/**
 * 宿主侧路由体检：`/dsh-skin/` 到底能不能把素材送出去，以及能不能挡住路径穿越。
 *
 * 为什么这个必须测：这条路是壁纸 404 的修复本体。之前壁纸一直取不到，是因为
 * 宿主的 `/plugins/<id>/<文件>` 只服务 JS chunk，图片怎么放都拿不到。现在换成
 * 自己挂前缀路由，如果这条路由自己也有问题，那就是把「看不见图」换成了
 * 「看不见图的原因更难查」。
 *
 * 路径穿越那几条尤其要测：handler 直接读磁盘，白名单一旦写松，`../` 就能读到
 * 包外的任何文件。
 *
 * 跑法：node verify/host-route.mjs
 */
import { Writable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
let passed = 0;
let failed = 0;

const realError = console.error.bind(console);
function check(ok, label, detail) {
  if (ok) { passed += 1; return; }
  failed += 1;
  realError(`✗ ${label}`);
  if (detail !== undefined) realError("  ", typeof detail === "string" ? detail : JSON.stringify(detail));
}

// ── 假响应：真 Writable，这样 createReadStream().pipe(res) 走的是真实路径 ─────
function makeRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  res.status = null;
  res.headers = null;
  res.writeHead = (status, headers) => {
    res.status = status;
    res.headers = headers || {};
  };
  res.chunks = chunks;
  res.body = () => Buffer.concat(chunks);
  return res;
}

function makeReq(method, url, headers, remoteAddress, body) {
  const req = {
    method,
    url,
    headers: headers || {},
    // 探针会读 remoteAddress 做来源限制，所以这里得真给一个
    socket: { remoteAddress: remoteAddress ?? "127.0.0.1" },
  };
  // 有 body 时补一个最小的可读流，`readJsonBody` 就是靠 on('data'/'end') 收的
  if (body !== undefined) {
    const buf = Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8");
    req.on = (event, callback) => {
      if (event === "data") setImmediate(() => callback(buf));
      else if (event === "end") setImmediate(() => callback());
      return req;
    };
  }
  return req;
}

/** 触发一次请求并等它收尾。超时就判失败，避免测试挂住。 */
function request(handler, method, url, headers, remoteAddress, body) {
  return new Promise((resolve) => {
    const res = makeRes();
    const timer = setTimeout(() => resolve({ status: "timeout", res }), 3000);
    res.on("finish", () => {
      clearTimeout(timer);
      resolve({ status: res.status, headers: res.headers, body: res.body(), res });
    });
    res.on("error", () => {
      clearTimeout(timer);
      resolve({ status: "error", res });
    });
    handler(makeReq(method, url, headers, remoteAddress, body), res);
  });
}

// ── 装载宿主半边：捕获它注册的路由 ──────────────────────────────────────────
const mod = await import(pathToFileURL(join(root, "index.js")).href);

let capturedRoute = null;
const fakeWebServer = {
  register(route) {
    capturedRoute = route;
    return () => {};
  },
};

const ctx = {
  get(name) {
    return name === "webServer" ? fakeWebServer : undefined;
  },
  effect(callback) {
    callback();
    return () => {};
  },
  logger: { info() {}, warn() {} },
};

let threw = null;
try {
  mod.apply(ctx);
} catch (error) {
  threw = error;
}
check(threw === null, "apply 不抛", String(threw));
check(capturedRoute !== null, "注册了路由");
check(capturedRoute?.kind === "prefix", "路由是 prefix 类型", capturedRoute?.kind);
check(capturedRoute?.path === "/dsh-skin", "前缀是 /dsh-skin", capturedRoute?.path);

const handler = capturedRoute.handler;

// ── 1. 正常取图 ─────────────────────────────────────────────────────────────
const petRes = await request(handler, "GET", "/dsh-skin/pet-starlight-idle.webp");
check(petRes.status === 200, "GET pet-starlight-idle.webp 返回 200", petRes.status);
check(petRes.headers?.["content-type"] === "image/webp", "Content-Type 是 image/webp", petRes.headers);
check(petRes.body?.length > 1000, "返回了真实字节", petRes.body?.length);
check(petRes.body?.slice(0, 4).toString("ascii") === "RIFF", "内容是 WebP（RIFF 头）", petRes.body?.slice(0, 4).toString("ascii"));

const wallRes = await request(handler, "GET", "/dsh-skin/wallpaper-kawaii-catdog.webp");
check(wallRes.status === 200, "GET wallpaper-kawaii-catdog.webp 返回 200", wallRes.status);

const sakuraRes = await request(handler, "GET", "/dsh-skin/wallpaper-sakura-anime.webp");
check(sakuraRes.status === 200, "GET wallpaper-sakura-anime.webp 返回 200", sakuraRes.status);

// 带查询串也要能取到（浏览器缓存刷新常带 ?t=）
const queryRes = await request(handler, "GET", "/dsh-skin/pet-starlight-idle.webp?v=2");
check(queryRes.status === 200, "带查询串仍能取到", queryRes.status);

// ── 桌面桌宠端点（2026-11-02 晚加） ─────────────────────────────────────────
// 这一段只断言「路由存在、形状对、坏输入被拒」：真起进程的活留给冒烟脚本，
// 单元测试里不该去 spawn 一个 WPF 窗口。
const desktopRes = await request(handler, "GET", "/dsh-skin/desktop");
check(desktopRes.status === 200, "GET /dsh-skin/desktop 返回 200", desktopRes.status);
let desktopBody = null;
try {
  desktopBody = JSON.parse(desktopRes.body.toString("utf8"));
} catch {
  desktopBody = null;
}
check(Boolean(desktopBody), "桌面端点返回合法 JSON", desktopRes.body.toString("utf8").slice(0, 80));
check(desktopBody?.ok === true, "桌面端点 ok:true", desktopBody);
check(typeof desktopBody?.supported === "boolean", "桌面端点报 supported", desktopBody?.supported);
check(desktopBody?.running === false ? desktopBody?.pid === null : true, "没在跑时 pid 必须是 null", desktopBody);
check(
  typeof desktopBody?.status === "string" && desktopBody.status.endsWith("pet-status.json"),
  "桌面端点给出状态文件路径（桌面端就是读它）",
  desktopBody?.status
);

const badAction = await request(handler, "POST", "/dsh-skin/desktop", { "content-type": "application/json" }, "127.0.0.1", { action: "乱写的" });
check(badAction.status === 400, "不认识的 action 返回 400（不静默成功）", badAction.status);

const badJson = await request(handler, "POST", "/dsh-skin/desktop", { "content-type": "application/json" }, "127.0.0.1", "{不是json");
check(badJson.status === 400, "非法 JSON 返回 400", badJson.status);

// 来源限制：桌面端点能起进程、能写文件，不能对局域网开口
const remoteDesktop = await request(handler, "GET", "/dsh-skin/desktop", {}, "192.168.1.9");
check(remoteDesktop.status === 403, "非本机来源访问桌面端点被拒（403）", remoteDesktop.status);

// 面板头图（2026-11-02 面板改独立框体时由 gpt-image-2 生成）：
// 它是 CSS 里的 url(/dsh-skin/panel-hero.webp)，路由不通面板就会掉成一块纯色。
const heroRes = await request(handler, "GET", "/dsh-skin/panel-hero.webp");
check(heroRes.status === 200, "GET panel-hero.webp 返回 200（面板头图能取到）", heroRes.status);
check(heroRes.headers?.["content-type"] === "image/webp", "头图 Content-Type 是 image/webp", heroRes.headers);
check(heroRes.body?.slice(0, 4).toString("ascii") === "RIFF", "头图内容是 WebP（RIFF 头）", heroRes.body?.slice(0, 4).toString("ascii"));

// ── 2. 路径穿越必须挡住 ─────────────────────────────────────────────────────
const attacks = [
  "/dsh-skin/../package.json",
  "/dsh-skin/../../package.json",
  "/dsh-skin/..%2Fpackage.json",
  "/dsh-skin/%2e%2e%2fpackage.json",
  "/dsh-skin/..%5cpackage.json",
  "/dsh-skin/C:/Windows/win.ini",
  "/dsh-skin/index.js",
  "/dsh-skin/assets/pet-starlight-idle.webp",
];
const leaked = [];
for (const url of attacks) {
  const result = await request(handler, "GET", url);
  // 只有一种情况算安全：没吐出 200。404/400 都行。
  if (result.status === 200) leaked.push({ url, status: result.status, size: result.body?.length });
}
check(leaked.length === 0, "所有路径穿越尝试都被挡住", leaked);

// ── 3. 不存在的文件 ─────────────────────────────────────────────────────────
const missing = await request(handler, "GET", "/dsh-skin/not-here.webp");
check(missing.status === 404, "不存在的文件返回 404", missing.status);

// ── 4. 方法限制 ─────────────────────────────────────────────────────────────
const post = await request(handler, "POST", "/dsh-skin/pet-starlight-idle.webp");
check(post.status === 405, "POST 返回 405", post.status);

const head = await request(handler, "HEAD", "/dsh-skin/pet-starlight-idle.webp");
check(head.status === 200, "HEAD 返回 200", head.status);
check(head.body?.length === 0, "HEAD 不带响应体", head.body?.length);

// ── 5. 协商缓存（素材会变，不能长缓存） ─────────────────────────────────────
/**
 * 这一条是踩出来的：一开始给的是 max-age=604800，桌宠图重做了三版都叫
 * pet-starlight-idle.webp，浏览器一直用七天前那张，改完看不到效果还要以为代码没生效。
 */
check(typeof petRes.headers?.etag === "string" && petRes.headers.etag.length > 2, "带 ETag", petRes.headers?.etag);
check(
  String(petRes.headers?.["cache-control"] || "").includes("no-cache"),
  "cache-control 是 no-cache（每次验证，改完刷新即生效）",
  petRes.headers?.["cache-control"]
);
check(
  !String(petRes.headers?.["cache-control"] || "").includes("max-age=604800"),
  "不再给七天长缓存",
  petRes.headers?.["cache-control"]
);

const cached = await request(handler, "GET", "/dsh-skin/pet-starlight-idle.webp", { "if-none-match": petRes.headers.etag });
check(cached.status === 304, "带相同 ETag 时返回 304（不重传内容）", cached.status);
check(cached.body?.length === 0, "304 不带响应体", cached.body?.length);

const stale = await request(handler, "GET", "/dsh-skin/pet-starlight-idle.webp", { "if-none-match": '"deadbeef"' });
check(stale.status === 200, "ETag 不匹配时返回完整内容", stale.status);

// ── 6. 宿主没有 webServer 时要降级而不是崩 ──────────────────────────────────
const bare = { get: () => undefined, effect: (cb) => cb(), logger: { info() {}, warn() {} } };
let bareThrew = null;
try {
  mod.apply(bare);
} catch (error) {
  bareThrew = error;
}
check(bareThrew === null, "没有 webServer 时 apply 不抛", String(bareThrew));
check(mod.diagnostics().length > 0, "没有 webServer 时留下降级记录", mod.diagnostics());

// ── 宿主侧播报的纯函数（页面关着也要会说） ──────────────────────────────────
const { announcer } = await import("../index.js");
check(typeof announcer?.composeFinishLine === "function", "导出了 composeFinishLine 供断言", typeof announcer?.composeFinishLine);
const lineFull = announcer.composeFinishLine({ title: "公众号排版", durationMs: 192000, total: 12345 });
check(lineFull === "《公众号排版》跑完了 · 用时 3 分 12 秒 · 12.3K tokens", "播报句式和面板/客户端一致", lineFull);
check(
  announcer.composeFinishLine({ title: "修桌宠", durationMs: 4200, total: null }) === "《修桌宠》跑完了 · 用时 4 秒",
  "没有用量时只说用时（不硬编 0 tokens）",
  announcer.composeFinishLine({ title: "修桌宠", durationMs: 4200, total: null }),
);
check(
  announcer.composeFinishLine({ title: "那个", durationMs: 0, total: 900, failed: true }) === "《那个》这次没跑成 · 900 tokens",
  "失败的轮次措辞是「没跑成」",
  announcer.composeFinishLine({ title: "那个", durationMs: 0, total: 900, failed: true }),
);
check(
  announcer.hostUsageTotal({ totals: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 1000 } }) === 1150,
  "用量口径：缓存读计入、不与 output 重复加",
  announcer.hostUsageTotal({ totals: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 1000 } }),
);
check(announcer.hostUsageTotal({ totalTokens: 777 }) === 777, "投影直接给 totalTokens 时照用", announcer.hostUsageTotal({ totalTokens: 777 }));
check(announcer.hostUsageTotal(undefined) === null, "没有用量数据时返回 null（不假装 0）", announcer.hostUsageTotal(undefined));
check(announcer.formatDurationMs(500) === "", "不到一秒不说用时（floor 口径）", announcer.formatDurationMs(500));
check(announcer.formatDurationMs(3_600_000) === "1 小时 0 分", "超过一小时按时/分说", announcer.formatDurationMs(3_600_000));

// ── 收尾 ────────────────────────────────────────────────────────────────────
console.log(`${failed === 0 ? "✓" : "✗"} host-route：${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
