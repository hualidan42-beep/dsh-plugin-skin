/**
 * 宿主半侧：把 assets/ 里的壁纸和桌宠素材挂到 `/dsh-skin/` 下。
 *
 * 为什么必须自己挂路由：宿主的 `/plugins/<插件id>/<文件>` 只服务 JS chunk
 * （dsh-client-modules 用 CLIENT_CHUNK 正则卡死文件名），图片放哪个路径都拿不到，
 * 之前壁纸一直 404 就是这个原因，不是路径写错。
 *
 * 为什么不用 `export const inject = ["webServer"]`：这份插件的主体在浏览器端，
 * 宿主侧只是资源服务器。声明成必需依赖的话，万一 webServer 缺席，整个插件都不激活，
 * 连壁纸和桌宠一起消失 —— 拿不到服务就跳过路由，浏览器端自然会走降级外观。
 */

import { createReadStream, existsSync, statSync, mkdirSync, readFileSync, writeFileSync, rmSync, openSync, closeSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const name = "skin";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(HERE, "assets");
/** 桌面桌宠的脚本目录（与浏览器端共用一个包，只是不同进程）。 */
const DESKTOP_DIR = join(HERE, "desktop");
/** 运行时目录：配置、状态、窗口位置。放用户主目录，DSH 重装也还在。 */
// 运行时目录：名字、状态、位置三个 JSON 都在这儿。DSH_SKIN_HOME 是给冒烟/测试用的覆盖点
// （沙箱里写不了用户主目录，但真宿主不沙箱、正常走 ~/.dsh-skin）。
const RUNTIME_DIR = process.env.DSH_SKIN_HOME || join(homedir(), ".dsh-skin");

/** 路由前缀。客户端那边引用的就是 /dsh-skin/<文件名>。 */
export const PREFIX = "/dsh-skin";

/**
 * 播报句式用的纯函数。
 *
 * 单独的 `announcer` 导出是给测试用的：这些函数决定「跑完了 · 用时 · tokens」
 * 长什么样，而页面关着时宿主也得说同一句，两边不能各写一套。
 */
export const announcer = { composeFinishLine, formatDurationMs, formatTokensHost, hostUsageTotal };

const MIME = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/**
 * 只放行「小写字母数字连字符 + 白名单扩展名」的文件名。
 * 把路径穿越挡在外面：不接受 / \ .. 盘符，也不需要解码后再判断 ——
 * 编码过的 %2F 解出来仍然带斜杠，正则直接不通过。
 */
const SAFE_NAME = /^[a-z0-9][a-z0-9-]*\.(webp|png|jpg|jpeg|svg)$/;

const issues = [];

function note(part, error) {
  const message = String(error && error.message ? error.message : error);
  issues.push({ part, message });
  try {
    console.error(`[dsh-skin] ${part} 失败：${message}`, error);
  } catch {
    /* 控制台都没了就只能算了 */
  }
}

/**
 * 处理一次素材请求。
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function serveAsset(req, res, ctx) {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://dsh.invalid").pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  let rest = pathname.slice(PREFIX.length);
  if (rest.startsWith("/")) rest = rest.slice(1);


  // 桌面桌宠的开关与状态投递。和探针一样只认本机来源：
  // 这条能起进程、能写文件，不能让局域网里随便谁来按一下。
  if (rest === "desktop") {
    if (!isLocal(req)) {
      sendJson(res, 403, { ok: false, error: "桌面桌宠只允许本机访问" });
      return;
    }
    serveDesktop(req, res, ctx).catch((error) => {
      note("桌面桌宠", error);
      try {
        if (!res.writableEnded) sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
      } catch {
        /* 连接已经断了 */
      }
    });
    return;
  }

  /**
   * 方法限制放在两个 API 分支之后。
   *
   * 放前面的话 `POST /dsh-skin/chat` 会被这里直接 405 —— 而 chat 本来就该是 POST，
   * 那种 405 看起来像"路由没挂上"，很难往"检查顺序写反了"上想。
   */
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("method not allowed");
    return;
  }

  /**
   * 只接受平铺的文件名，不接受任何子目录。
   *
   * 一开始写的是「取最后一段当文件名」，于是 `/dsh-skin/assets/pet-idle.webp`
   * 甚至 `/dsh-skin/../../x/pet-idle.webp` 都会命中 —— 虽然读到的仍是 assets
   * 里的合法文件、泄露不到包外，但这种「看起来成功了」的路径会让日志和排查
   * 全部失真。宁可 404。
   */
  if (rest.includes("/") || rest.includes("\\")) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("dsh-skin: asset not found");
    return;
  }
  const fileName = rest;

  if (!SAFE_NAME.test(fileName)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("dsh-skin: asset not found");
    return;
  }

  const file = join(ASSET_DIR, fileName);
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("dsh-skin: asset not found");
    return;
  }

  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();

  /**
   * 协商缓存而不是长缓存。
   *
   * 一开始写的是 `max-age=604800`，理由是「素材随包发布、文件名不变」。
   * 但素材恰恰会变 —— 桌宠的图我们自己就重做了三版，文件名始终是 pet-idle.webp。
   * 长缓存的结果是：文件换了、浏览器还在用七天前那张，改完看不到效果，
   * 还会以为是代码没生效。
   *
   * 改成本地服务的常态做法：每次都问一句，没变就回 304 不传内容。
   * 本地往返的开销可以忽略，换来的是「改完刷新就能看见」。
   */
  let stat;
  try {
    stat = statSync(file);
  } catch (error) {
    note("读取素材信息", error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("dsh-skin: internal error");
    return;
  }
  const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag, "cache-control": "no-cache" });
    res.end();
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "cache-control": "no-cache",
    etag,
    "last-modified": stat.mtime.toUTCString(),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = createReadStream(file);
  stream.on("error", (error) => {
    note("读取素材", error);
    if (!res.writableEnded) res.end();
  });
  stream.pipe(res);
}

// ── LLM 连通性探针 ──────────────────────────────────────────────────────────

/**
 * 探针的人设提示词。
 *
 * 探针不是「发个你好看返回啥」，那样测不出真正会翻车的地方。
 * 这里带着**最终形态要用的约束**去问一句真实场景的话，一次验四件事：
 *   1. 链路通不通、provider 是不是活的；
 *   2. 首字延迟够不够桌宠用（超过 2 秒就没法做即时反应）；
 *   3. 模型守不守得住「一句话」这种长度约束；
 *   4. 会不会滑回助手腔（「我能帮你做什么」）。
 * 第 3、4 条是这个人设最容易崩的地方，比连通性更值得先看见。
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

/**
 * 跑一次真实的模型调用，把过程指标原样吐出来。
 *
 * 取服务用 ctx.get 而不是 inject 声明：没装 LLM 适配器时这里要**返回一条
 * 明确的错误**，而不是让整个插件不激活 —— 桌宠的壁纸和素材不该被这件事连坐。
 */
function isLocal(req) {
  const remote = String(req.socket?.remoteAddress ?? "");
  return /^127\.|^::1$|^::ffff:127\./.test(remote);
}

/** 收 JSON 请求体，带体积上限（不让一个超大 body 把进程撑爆）。 */
function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("请求体过大"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * 把模型输出收成「一句能塞进气泡的话」。
 *
 * 模型不会自己守长度：它可能换行、可能带上引号、可能先来一句「小蓝说：」。
 * 这里全部削掉，最后硬截 30 字 —— 宁可句子断掉，也不能撑破气泡。
 *
 * 顺序有讲究：先去引号再去前缀。反过来做的话，`「小蓝说：晚安」，` 这种
 * 首尾都带引号的句子，前缀去掉了引号还留着，看着像半句话。
 */
let desktopChild = null;

/** apply 里记下的宿主上下文：给 subprocess 服务用（见 startDesktop 的说明）。 */
let hostContext = null;

/**
 * 走宿主的 subprocess 服务起进程。
 *
 * 这是**唯一能确定成功**的通道：它用 native job-object 绑定（`launchWindowsJob`），
 * 而裸 `child_process.spawn` 在宿主被某些启动器/沙箱包住时会静默失败 ——
 * 2026-11-02 实测：spawn 没抛错、没有 error 事件、`pet.ps1` 的面包屑一个都没写、
 * `Microsoft-Windows-PowerShell/Operational` 里连引擎启动事件都没有。
 *
 * 服务不可用（老宿主没装 / 没暴露）就返回 null，让调用方退回裸 spawn。
 * @returns {{ handle: object, pid: number|null } | null} 起起来就是 handle，否则 null。
 */
function spawnViaSubprocess(argv) {
  let service;
  try {
    service = typeof hostContext?.get === "function" ? hostContext.get("subprocess") : undefined;
  } catch (error) {
    note("取 subprocess 服务", error);
    return null;
  }
  if (!service || typeof service.spawn !== "function") return null;
  const handle = service.spawn({
    argv,
    cwd: DESKTOP_DIR,
    // 这个 grace 是「终止时先礼后兵」的窗口，不是启动超时；给 1.5s 够窗口收尾
    graceMs: 1500,
    stdio: {
      stdin: "ignore",
      // 收齐 stdout/stderr：powershell 起来就退的时候，原因只可能在这里
      stdout: { maxBytes: 16384 },
      stderr: { maxBytes: 16384 },
    },
  });
  return { handle, pid: null };
}

/** 把 subprocess 那条路收集到的输出落进 spawn 日志（进程活着也记，可能已经有警告）。 */
function drainSubprocessOutput(handle, label) {
  try {
    const out = handle?.collected?.stdout?.finalize?.();
    const err = handle?.collected?.stderr?.finalize?.();
    if (out?.text) appendSpawnLog(`${label} stdout: ${out.text.trim().slice(0, 2000)}`);
    if (err?.text) appendSpawnLog(`${label} stderr: ${err.text.trim().slice(0, 2000)}`);
  } catch {
    /* 收集器结构变了就算了，不能因为日志把启动搞坏 */
  }
}

/**
 * 宿主环境自检：这个宿主到底能不能起子进程？
 *
 * 2026-11-02 的排查里，最难的一步是分不清「插件算错了」和「这个环境根本起不了进程」：
 * 现象一样（按钮没反应），证据全无（没有进程、没有日志、没有 error 事件）。
 * 所以留下这个动作：`POST /dsh-skin/desktop {action:"selftest"}`，一次回答三件事 ——
 * subprocess 服务在不在、这条路能不能跑起来、裸 spawn 会不会报错。
 * @returns {Promise<object>} 两条路的结论 + 服务是否可用。
 */
async function desktopSelfTest() {
  const report = { platform: process.platform, service: false, subprocessRoute: null, rawRoute: null };
  const exe = process.env.ComSpec || "cmd.exe";
  const argv = [exe, "/c", "echo dsh-skin-selftest"];

  try {
    report.service = Boolean(hostContext && typeof hostContext.get === "function" && hostContext.get("subprocess"));
  } catch (error) {
    report.serviceError = String(error?.message ?? error);
  }

  // 一、宿主的 subprocess 服务（native job 绑定，pwsh 工具用的就是它）
  try {
    const started = spawnViaSubprocess(argv);
    if (!started) {
      report.subprocessRoute = { ok: false, error: "服务不可用" };
    } else {
      const done = await Promise.race([
        started.handle.done.then(
          (result) => ({ ok: true, exitCode: result?.exitCode ?? null }),
          (error) => ({ ok: false, error: String(error?.message ?? error) }),
        ),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "10 秒没退（超时）" }), 10000)),
      ]);
      const out = started.handle?.collected?.stdout?.finalize?.();
      report.subprocessRoute = { ...done, text: String(out?.text ?? "").trim().slice(0, 200) };
    }
  } catch (error) {
    report.subprocessRoute = { ok: false, error: String(error?.message ?? error) };
  }

  // 二、裸 child_process.spawn（插件的默认做法；想知道它在这个环境里是不是被拦了）
  try {
    report.rawRoute = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      let child;
      try {
        child = spawn(exe, argv.slice(1), { stdio: "ignore", windowsHide: true });
      } catch (error) {
        finish({ ok: false, error: `spawn 直接抛了：${String(error?.message ?? error)}` });
        return;
      }
      child.on("error", (error) => finish({ ok: false, error: `error 事件：${String(error?.message ?? error)}` }));
      child.on("exit", (code) => finish({ ok: code === 0, exitCode: code, pid: child.pid ?? null }));
      setTimeout(() => finish({ ok: false, error: "5 秒没退（超时），pid=" + String(child.pid ?? "undefined") }), 5000);
    });
  } catch (error) {
    report.rawRoute = { ok: false, error: String(error?.message ?? error) };
  }

  return report;
}

function desktopPaths() {
  return {
    dir: RUNTIME_DIR,
    config: join(RUNTIME_DIR, "pet-config.json"),
    status: join(RUNTIME_DIR, "pet-status.json"),
    window: join(RUNTIME_DIR, "pet-window.json"),
    pid: join(RUNTIME_DIR, "pet.pid"),
    script: join(DESKTOP_DIR, "pet.ps1"),
    assets: ASSET_DIR,
  };
}

function writeJsonFile(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
}

function readPidFile() {
  try {
    const raw = JSON.parse(readFileSync(desktopPaths().pid, "utf8"));
    const pid = Number(raw?.pid);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * 写「她自己关掉了」的标记（`pet-closed.json`）。
 *
 * 宿主重启会连 job 一起收掉她，`pet.pid` 只留下一个死 pid —— 面板分不清
 * 「被系统收走」和「用户右键退出」，只能一律再拉起来，那用户刚关掉的宠物就会自己回来。
 * 有了这个时间戳，面板见过它就不再自动拉起，直到用户自己再点一次「放到桌面」。
 * @param {string} reason - 谁写的：`pet`（她自己）/ `host-stop`（面板收回）。
 */
function writeClosedMarker(reason) {
  try {
    writeJsonFile(join(RUNTIME_DIR, "pet-closed.json"), { at: Date.now(), reason, pid: desktopPid() });
  } catch (error) {
    note("写关闭标记", error);
  }
}

/** 读关闭标记的时间戳（毫秒）；没有或读不了返回 0。 */
function readClosedAt() {
  try {
    const raw = JSON.parse(readFileSync(join(RUNTIME_DIR, "pet-closed.json"), "utf8"));
    const at = Number(raw?.at);
    return Number.isFinite(at) && at > 0 ? at : 0;
  } catch {
    return 0;
  }
}

/** 判断一个 pid 还在不在。EPERM 说明进程在、只是没权限发信号，也算活着。 */function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/**
 * powershell.exe 的绝对路径。
 *
 * 不用裸命令名：宿主进程的 PATH 可能被启动器改过（甚至撞上 WindowsApps 里的同名
 * 应用执行别名），那种情况 node 照样能拿到 pid，但进程会立刻退出、一行日志都不写 ——
 * 2026-11-02 排查「点放到桌面没反应」时就是这个症状：进程起来了，脚本一个字都没跑。
 */
function powerShellPath() {
  const root = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  const full = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return existsSync(full) ? full : "powershell.exe";
}

/** 宿主侧的启动记录：子进程自己都不说话时，至少能知道我们发了什么命令、它怎么退的。 */
function appendSpawnLog(line) {
  try {
    appendFileSync(join(DESKTOP_DIR, "last-spawn.log"), `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    /* 写不了就算了，不能因为日志把启动搞坏 */
  }
}

function desktopPid() {
  if (desktopChild && desktopChild.exitCode === null && desktopChild.signalCode === null) return desktopChild.pid ?? null;
  const pid = readPidFile();
  return pidAlive(pid) ? pid : null;
}

/**
 * 起桌面桌宠。
 *
 * 用 `powershell.exe`（5.1）而不是 `pwsh`：WPF 在 5.1 上最稳，且控制台默认 STA，
 * 不用额外操心单线程单元。`detached` 让它不跟着宿主退出 —— 宿主重启时她不该消失。
 *
 * 防重复有三道（2026-11-02 晚加的：桌面上真的站过两只）：
 *   1. 这里先看 pid 是否还活着，活着就返回 already，不再 spawn；
 *   2. pid 文件丢了也不怕 —— 脚本里还有命名互斥体，后来者自己退出；
 *   3. spawn 之后等 800ms 确认真的起来了，起不来（被互斥体挡掉的正是这种）就不写 pid 文件。
 */
async function startDesktop(config = {}) {
  const paths = desktopPaths();
  if (process.platform !== "win32") {
    return { ok: false, error: "桌面桌宠目前只支持 Windows（需要 PowerShell + WPF）" };
  }
  if (!existsSync(paths.script)) {
    return { ok: false, error: "缺少 desktop/pet.ps1，插件包不完整" };
  }
  const running = desktopPid();
  if (running) return { ok: true, already: true, pid: running };

  try {
    writeJsonFile(paths.config, {      name: String(config.name ?? "小蓝").slice(0, 12),
      size: Math.max(72, Math.min(260, Number(config.size) || 160)),
      opacity: Math.max(0.3, Math.min(1, Number(config.opacity) || 1)),
      prefix: String(config.prefix ?? "pet-starlight"),
      assetDir: paths.assets,
      statusFile: paths.status,
      windowFile: paths.window,
      bubble: config.bubble !== false,
    });
  } catch (error) {
    // 写不了配置（目录权限 / 磁盘）就别往下 spawn：窗口会起来但读不到配置，白开一个
    note("写桌面配置", error);
    return { ok: false, error: `写不了 ${paths.config}：${String(error?.message ?? error)}` };
  }

  try {
    // 陈旧的 pid 文件先清掉：下面要靠「pid 文件有没有出现」判断这次到底起没起来，
    // 留一份上一轮的会把死进程误判成在跑。
    const stalePid = readPidFile();
    if (stalePid && !pidAlive(stalePid)) {
      try {
        rmSync(paths.pid, { force: true });
      } catch {
        /* 删不掉也不影响后面读：pidAlive 会把它筛掉 */
      }
    }

    // 把子进程的 stdout/stderr 落到插件目录里：它一启动就退的时候，「为什么退」
    // 只可能在这两股流里（裸 spawn 是 detached + stdio 重定向，默认什么都看不到）。
    let spawnFd = null;
    try {
      spawnFd = openSync(join(DESKTOP_DIR, "last-spawn.log"), "a");
    } catch {
      spawnFd = null;
    }
    const exe = powerShellPath();
    const argv = [
      exe,
      "-NoProfile",
      "-STA",
      "-WindowStyle",
      "Hidden",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      paths.script,
      "-Config",
      paths.config,
    ];
    appendSpawnLog(`spawn ${exe} -Node env: PATH=${process.env.PATH ? "set" : "MISSING"} TEMP=${process.env.TEMP ?? ""} cwd=${process.cwd()}`);

    // 先走宿主自己的 subprocess 服务：它是唯一确定能起进程的通道（见 spawnViaSubprocess
    // 的说明）。拿不到服务才退回裸 spawn —— 那条路在部分宿主启动方式下会静默失败。
    let route = "subprocess";
    let viaService = spawnViaSubprocess(argv);
    if (!viaService) {
      route = "child_process";
      appendSpawnLog("subprocess 服务不可用，退回裸 child_process.spawn");
      const child = spawn(exe, argv.slice(1), {
        detached: true,
        stdio: spawnFd === null ? "ignore" : ["ignore", spawnFd, spawnFd],
        windowsHide: true,
      });
      child.unref();
      viaService = { handle: null, child };
    }
    if (spawnFd !== null) {
      try {
        closeSync(spawnFd);
      } catch {
        /* 父进程关掉自己那端的句柄，子进程仍持有 */
      }
    }
    const child = viaService.child ?? null;
    const handle = viaService.handle ?? null;
    if (child) desktopChild = child;
    // 起不来的错误是异步发的（EPERM / ENOENT）。不接住这个事件，宿主会因为
    // 一个未处理的 'error' 直接抛异常 —— 面板那边只能看到「按钮点了没反应」。
    let spawnError = null;
    let exitInfo = null;
    child?.on("error", (error) => {
      spawnError = error;
      note("启动桌面桌宠", error);
    });
    child?.on("exit", (code, signal) => {
      exitInfo = { code, signal, at: Date.now() };
    });
    if (handle?.done) {
      handle.done.then(
        (result) => {
          exitInfo = { code: result?.exitCode ?? null, signal: result?.signal ?? null, at: Date.now() };
        },
        (error) => {
          spawnError = error;
        },
      );
    }

    // 等一拍再判定：被单实例锁挡掉的会秒退，正常起来的会在这段时间里写好 pid 文件
    await new Promise((resolve) => setTimeout(resolve, 1800));
    if (spawnError) {
      desktopChild = null;
      appendSpawnLog(`启动失败（${route}）：${String(spawnError?.message ?? spawnError)}`);
      return { ok: false, route, error: `起不了 powershell.exe（${route}）：${String(spawnError?.message ?? spawnError)}` };
    }
    // pid 文件才是唯一真相：不管谁起的、走哪条路，她起来了就会自己登记
    const livePid = desktopPid();
    if (!livePid) {
      desktopChild = null;
      drainSubprocessOutput(handle, route);
      const suffix = exitInfo ? `退出码 ${exitInfo.code}${exitInfo.signal ? ` / ${exitInfo.signal}` : ""}` : "没有退出码";
      appendSpawnLog(`启动失败（${route}）：进程没起来（${suffix}）`);
      return {
        ok: false,
        route,
        pid: null,
        exit: exitInfo,
        error:
          `powershell 起来就退了（${route} · ${suffix}）` +
          `。她自己的日志：${join(RUNTIME_DIR, "boot.log")}；宿主记录：${join(DESKTOP_DIR, "last-spawn.log")}`,
      };
    }
    // 走裸 spawn 时她可能还来不及写 pid 文件，这里补一份；subprocess 路线由她自己写
    if (route === "child_process" && child?.pid) {
      try {
        writeJsonFile(paths.pid, { pid: livePid, at: Date.now() });
      } catch {
        /* 她自己的那份已经够了 */
      }
    }
    try {
      rmSync(join(RUNTIME_DIR, "pet-closed.json"), { force: true });
    } catch {
      /* 删不掉只是下次自动放回会犹豫一下 */
    }
    appendSpawnLog(`启动成功（${route}）pid=${livePid}`);
    return { ok: true, pid: livePid, route };
  } catch (error) {
    note("启动桌面桌宠", error);
    return { ok: false, error: String(error?.message ?? error) };
  }
}

async function stopDesktop() {
  const paths = desktopPaths();
  const pid = desktopPid();
  if (!pid) {
    desktopChild = null;
    return { ok: true, already: true };
  }
  let error = null;
  try {
    process.kill(pid);
  } catch (cause) {
    error = cause?.code === "ESRCH" ? null : cause;
  }
  // WPF 窗口收尾要一点时间；等一拍还在就上 taskkill（它会连子线程一起收）
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (pidAlive(pid)) {
    try {
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).unref?.();
      error = null;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (cause) {
      note("结束桌面桌宠", cause);
      error = cause;
    }
  }
  desktopChild = null;
  try {
    // pid 文件留着没用：进程没了，读它只会得到「已经死了的 pid」
    rmSync(paths.pid, { force: true });
  } catch {
    /* 删不掉也不影响下一次启动 */
  }
  // 是我们主动收的，就留一个关闭标记：被 taskkill 的进程来不及自己写，
  // 不补这一份的话「用户刚收走、页面又把她放回来」会立刻发生。
  writeClosedMarker("host-stop");
  return {
    ok: !error,
    error: error ? String(error?.message ?? error) : undefined,
    killed: pid,
    stillRunning: pidAlive(pid),
  };
}

async function serveDesktop(req, res, ctx) {
  const paths = desktopPaths();
  const supported = process.platform === "win32";
  const running = desktopPid();

  if (req.method === "GET" || req.method === "HEAD") {
    sendJson(res, 200, {
      ok: true,
      platform: process.platform,
      supported,
      running: Boolean(running),
      pid: running,
      script: paths.script,
      config: paths.config,
      status: paths.status,
      // 最后一次「她自己关掉」的时间。页面靠它区分「被宿主 job 收走」和
      // 「用户右键退出」—— 后者不该被自动放回来。
      closedAt: readClosedAt(),
    });
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("method not allowed");
    return;
  }

  let body = {};
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: String(error?.message ?? error) });
    return;
  }
  const action = String(body.action ?? "status");

  if (action === "start") {
    // 桌面宠物不稳定，已按用户要求下线；旧页面也不得重新拉起。
    sendJson(res, 410, { ok: false, supported: false, running: false, error: "桌面桌宠已停用，请使用 DSH 页面内桌宠" });
    return;
  }

  if (action === "selftest") {
    // 环境自检：不问人就先回答「这个宿主到底能不能起进程」。
    // 只用 cmd 跑一句无害命令，不碰桌宠。
    const result = await desktopSelfTest();
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (action === "announcer") {
    // 播报通道的现场状态：绑没绑上、听见了几个事件、最后说了什么。
    // 「她怎么不报任务」这类问题，一眼就能分出是没听见还是没说话。
    sendJson(res, 200, { ok: true, ...ANNOUNCER, running: Boolean(desktopPid()) });
    return;
  }

  if (action === "stop") {
    const result = await stopDesktop();
    sendJson(res, result.ok ? 200 : 500, { ...result, supported, running: Boolean(desktopPid()) });
    return;
  }

  if (action === "status") {
    /**
     * 浏览器端投递「她现在要说的话」。桌面端每秒读一次这个文件，
     * `at` 变了才说话 —— 所以重复投递同一句不会反复念。
     */
    const status = body.status && typeof body.status === "object" ? body.status : null;
    if (status) {
      try {
        writeJsonFile(paths.status, {
          line: String(status.line ?? "").slice(0, 200),
          mood: String(status.mood ?? "idle").slice(0, 12),
          at: Date.now(),
          // 记下来源：排查时一眼看出这句是谁投的（桌面端不认这个字段，忽略即可）
          source: "browser",
        });
      } catch (error) {
        note("写桌面状态", error);
      }
    }
    sendJson(res, 200, { ok: true, running: Boolean(desktopPid()) });
    return;
  }

  sendJson(res, 400, { ok: false, error: `不认识的 action：${action}` });
}

export function apply(ctx) {
  let mounted = false;
  // 记下来给 startDesktop 用：宿主的 subprocess 服务是**唯一能确定起得来的**通道
  // （它走 native job-object 绑定），而裸 child_process.spawn 在某些宿主启动方式下
  // 会被拦掉 —— 进程表里什么都没有，日志里也什么都没有。
  hostContext = ctx;

  // 页面关着的时候也要会说话：宿主自己能看见每一轮什么时候结束，不依赖任何标签页。
  bindSessionAnnouncer(ctx);

  /** 取服务。ctx.get 不走 inject 声明，拿不到只返回 undefined，不会抛。 */
  const readServer = () => {
    try {
      return typeof ctx?.get === "function" ? ctx.get("webServer") : undefined;
    } catch (error) {
      note("取 webServer", error);
      return undefined;
    }
  };

  /**
   * 尝试挂路由。
   * @returns {boolean} 挂上了返回 true。
   *
   * 为什么要试两次：`dsh web --help` 这类不真正起服务的路径上，apply 执行时
   * webServer 还没被提供，第一次取一定是 undefined。只取一次的话，路由就永远
   * 不会挂 —— 表现和「壁纸 404 没修」一模一样，只是原因藏得更深。
   */
  const mount = () => {
    if (mounted) return true;
    const webServer = readServer();
    if (!webServer || typeof webServer.register !== "function") return false;
    try {
      ctx.effect(
        () =>
          webServer.register({
            kind: "prefix",
            path: PREFIX,
            handler: (req, res) => {
              try {
                serveAsset(req, res, ctx);
              } catch (error) {
                note("响应素材", error);
                try {
                  if (!res.writableEnded) {
                    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
                    res.end("dsh-skin: internal error");
                  }
                } catch {
                  /* 连接已经断了 */
                }
              }
            },
          }),
        "skin: /dsh-skin asset route",
      );
      mounted = true;
      ctx.logger?.info?.("dsh-skin: 素材路由已挂到 /dsh-skin");
      return true;
    } catch (error) {
      note("挂素材路由", error);
      return false;
    }
  };

  if (mount()) return;

  // 服务还没就绪：等它出现再挂。回调只当「就绪通知」用，
  // 真正干活仍走外层 ctx（effect / get 都在它上面）。
  try {
    if (typeof ctx.inject === "function") {
      ctx.inject({ webServer: null }, () => {
        mount();
      });
      return;
    }
  } catch (error) {
    note("等待 webServer", error);
  }

  note(
    "挂素材路由",
    new Error("没有 webServer 服务，壁纸与桌宠素材将取不到（客户端会降级为纯色背景）"),
  );
}

// ── 宿主侧播报：页面关着也要会说 ────────────────────────────────────────
//
// 原来的播报全在浏览器里（面板算完再 POST 给宿主），页面一关就没人说话了。
// 但「我某个任务跑完了，她告诉我」不该依赖某个标签页是否开着 —— 宿主本来就看得见
// 每一个会话的轮次开始/结束（`session/event`），也读得到投影里的 token 用量。
// 所以这里再做一份：事件驱动、不轮询、写同一个状态文件。
//
// 两边都说话会重复，用时间戳去重：客户端刚推过（2 秒内），宿主这次就不吭声。

/** 每个会话当前这一轮的起点；`turn/end` 时用来算用时。 */
const TURN_STARTED_AT = new Map();

/**
 * 每个会话在**这一轮开始时**的累计用量。
 *
 * 播报要回答的是「本次消耗多少」，而投影里的 `tokenUsage` 是整个会话的累计值 ——
 * 同一个会话跑到第五轮时报 13M，用户只会觉得在骗他。所以记下起点、播报时做差。
 */
const TURN_BASE_TOKENS = new Map();

/** 距上次「跟桌面说话」至少隔这么久，避免一连串会话结束时刷屏。 */
const HOST_ANNOUNCE_GAP_MS = 1500;

let lastHostAnnounceAt = 0;
let announcerBound = false;

/**
 * 播报通道的现场状态，给 `POST {action:"announcer"}` 看。
 *
 * 为什么要留这个：`session/event` 是宿主内部事件，而 cordis 的监听只「从发出者往上冒泡」——
 * 绑错上下文就永远不会触发，症状又是「什么都不发生」。不看计数器根本没法判断
 * 是「没人跑任务」还是「根本没听见」。
 */
const ANNOUNCER = { bound: false, where: null, seen: 0, turns: 0, lastLine: "", lastAt: 0, lastEvent: "" };

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  // 和客户端同一套口径：floor 而不是 round（500ms 说「1 秒」是四舍五入出来的谎）
  const total = Math.floor(ms / 1000);
  if (total < 1) return "";
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

function formatTokensHost(value) {
  if (!Number.isFinite(value)) return "";
  const number = Math.max(0, Math.round(value));
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}K`;
  return String(number);
}

/**
 * 从 `tokenUsage` 投影里取总用量。
 *
 * 口径必须和客户端一致（否则面板说 12.3K、桌宠说 15K，用户会以为谁在骗他）：
 * 四个桶互不重叠 → 缓存读/写在 input **不含缓存**时才有意义；reasoning 已经算在
 * output 里，绝不单独再加一次。
 * @param {object|undefined} projection - `values.tokenUsage`，可能是 totals 也可能是平铺的。
 * @returns {number|null} 总量；没有可用数据时 null。
 */
function hostUsageTotal(projection) {
  const usage = projection && typeof projection === "object" ? projection.totals ?? projection : null;
  if (!usage || typeof usage !== "object") return null;
  const num = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
  const declared = num(usage.totalTokens);
  if (declared > 0) return declared;
  const sum =
    num(usage.uncachedInputTokens) + num(usage.outputTokens) + num(usage.cacheReadTokens) + num(usage.cacheWriteTokens);
  return sum > 0 ? sum : null;
}

/**
 * 拼一句「哪个任务跑完了」。和客户端 `finishAnnounce` 的措辞保持一致。
 * @param {{title: string, durationMs?: number, total?: number|null, failed?: boolean}} input
 * @returns {string} 一句话；没内容时返回空串。
 */
function composeFinishLine(input) {
  const title = String(input?.title ?? "").trim() || "刚才那个任务";
  const parts = [input?.failed ? `《${title}》这次没跑成` : `《${title}》跑完了`];
  const duration = formatDurationMs(input?.durationMs);
  if (duration) parts.push(`用时 ${duration}`);
  const tokens = formatTokensHost(input?.total);
  if (tokens) parts.push(`${tokens} tokens`);
  return parts.join(" · ");
}

/** 会话标题：投影里有就用，没有就退到 cwd，再没有就退到 id。 */
function hostSessionTitle(ctx, session) {
  try {
    const projections = ctx.get("sessionProjections");
    const snapshot = projections?.snapshot?.(session, ["title"]);
    const title = snapshot?.values?.title;
    const text = String(title?.displayTitle ?? title?.title ?? (typeof title === "string" ? title : "") ?? "").trim();
    if (text) return text.length > 16 ? `${text.slice(0, 16)}…` : text;
  } catch {
    /* 投影读不到就走下面的兜底 */
  }
  const cwd = String(session?.header?.cwd ?? "").trim();
  if (cwd) {
    const base = cwd.split(/[\\/]/).filter(Boolean).pop();
    if (base) return base;
  }
  return String(session?.id ?? "").slice(0, 6) || "这个任务";
}

/**
 * 把一句话写到桌宠读的状态文件。
 *
 * 桌面端每秒读一次，`at` 变了才说话 —— 所以这里的 `at` 必须是「这次说话的时刻」。
 * @param {string} line - 要说的话。
 * @param {"happy"|"sulk"|"idle"} mood - 表情。
 * @returns {boolean} 写了返回 true（没在运行 / 太密 / 刚被客户端说过 → false）。
 */
function speakToDesktop(ctx, line, mood) {
  if (!line) return false;
  if (!desktopPid()) return false; // 桌面那只没在跑，说话没人听
  const now = Date.now();
  if (now - lastHostAnnounceAt < HOST_ANNOUNCE_GAP_MS) return false;
  try {
    // 去重：客户端刚推过一句就别重复。客户端和宿主看到的是同一个 `at`。
    const previous = JSON.parse(readFileSync(desktopPaths().status, "utf8"));
    if (Number(previous?.at) > 0 && now - Number(previous.at) < 2000) return false;
  } catch {
    /* 没有状态文件 = 没人在说话，正常继续 */
  }
  try {
    writeJsonFile(desktopPaths().status, { line: String(line).slice(0, 200), mood: mood || "idle", at: now, source: "host" });
    lastHostAnnounceAt = now;
    appendSpawnLog(`播报：${line}`);
    return true;
  } catch (error) {
    note("写桌面播报", error);
    return false;
  }
}

/**
 * 挂上「轮次结束就说一句」的监听。
 *
 * 只做一件事：记住 `turn/start` 的时刻，在 `turn/end` 时说一句。
 * 不用轮询 —— 宿主的事件流本来就有这两条。
 * @param {object} ctx - 插件上下文。
 */
function bindSessionAnnouncer(ctx) {
  if (announcerBound) return;
  // 绑在根上下文：cordis 的监听只「从发出者往上冒泡」，而会话是由别的 fiber 创建的，
  // 我挂在插件自己的 ctx 上很可能一条都收不到（症状：永远不说话，且没有任何报错）。
  const host = ctx?.root && typeof ctx.root.on === "function" ? ctx.root : ctx;
  if (typeof host?.on !== "function") return;
  try {
    const off = host.on("session/event", (session, event) => {
      const type = event?.type;
      if (type !== "turn/start" && type !== "turn/end") return;
      ANNOUNCER.seen += 1;
      ANNOUNCER.lastEvent = String(type);
      const id = String(session?.id ?? "");
      if (!id) return;
      const readTotal = () => {
        try {
          const projections = ctx.get("sessionProjections");
          return hostUsageTotal(projections?.snapshot?.(session, ["tokenUsage"])?.values?.tokenUsage);
        } catch {
          return null;
        }
      };
      if (type === "turn/start") {
        TURN_STARTED_AT.set(id, Number(event?.time) > 0 ? Number(event.time) : Date.now());
        // 记下这一轮开始前的累计值，结束时报「本次」而不是「这辈子」
        TURN_BASE_TOKENS.set(id, readTotal());
        return;
      }
      ANNOUNCER.turns += 1;
      const startedAt = TURN_STARTED_AT.get(id);
      TURN_STARTED_AT.delete(id);
      const endedAt = Number(event?.time) > 0 ? Number(event.time) : Date.now();
      const durationMs = startedAt ? Math.max(0, endedAt - startedAt) : 0;
      // 一闪而过的轮次（用户按 Esc、请求就被拒）不值得播报：只会把真消息挤掉
      if (durationMs > 0 && durationMs < 1000) return;
      const base = TURN_BASE_TOKENS.get(id);
      TURN_BASE_TOKENS.delete(id);
      const cumulative = readTotal();
      /**
       * 本次增量 = 结束时的累计 - 开始时的累计。
       * 拿不到起点（插件是在这一轮中途才挂上的）或者算出负数，就退回累计值 ——
       * 宁可多报，也不要报个 0 假装这轮没花钱。
       */
      const total = cumulative === null ? null : Number.isFinite(base) && cumulative - base > 0 ? cumulative - base : cumulative;
      const line = composeFinishLine({ title: hostSessionTitle(ctx, session), durationMs, total });
      if (speakToDesktop(ctx, line, "happy")) {
        ANNOUNCER.lastLine = line;
        ANNOUNCER.lastAt = Date.now();
      } else {
        ANNOUNCER.lastLine = `${line}（没说：桌面没在跑 / 刚说过）`;
      }
    });
    announcerBound = true;
    ANNOUNCER.bound = true;
    ANNOUNCER.where = host === ctx ? "plugin" : "root";
    ctx.logger?.info?.(`dsh-skin: 完场播报已挂上（ctx=${ANNOUNCER.where}）`);
    if (typeof ctx.effect === "function") {
      ctx.effect(() => () => {
        try {
          off?.();
        } catch {
          /* 已经解绑 */
        }
        announcerBound = false;
        ANNOUNCER.bound = false;
      }, "skin: 完场播报监听");
    }
  } catch (error) {
    note("挂完场播报", error);
  }
}

/** 降级清单（只读快照），给冒烟测试和现场排查用。 */export const diagnostics = () => issues.map((issue) => ({ ...issue }));
