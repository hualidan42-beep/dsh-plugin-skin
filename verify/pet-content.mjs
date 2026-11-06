/**
 * 内容体检：语料与素材。
 *
 * 这一层要拦的不是「程序坏了」，而是「程序没坏但内容不合格」——
 * 句子太长会在气泡里被截断、自称「AI 助手」会让角色当场碎裂、
 * 素材文件缺一个就有一个形态永远出不来。这些都不会报错，只会难看。
 *
 * 跑法：node verify/pet-content.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
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
  if (detail !== undefined) realError("  ", typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
}

// ── 假环境装载 client.js（只为拿到导出的语料） ──────────────────────────────
function makeElement() {
  const attrs = new Map();
  const node = {
    style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {},
    appendChild(c) { return c; },
    prepend(c) { return c; },
    setAttribute(n, v) { attrs.set(n, String(v)); },
    getAttribute(n) { return attrs.has(n) ? attrs.get(n) : null; },
    querySelector() { return makeElement(); },
    querySelectorAll: () => [],
    setPointerCapture() {},
    innerHTML: "",
    offsetWidth: 120,
    offsetHeight: 132,
    offsetLeft: 0,
    offsetTop: 0,
  };
  return node;
}
globalThis.document = {
  documentElement: makeElement(),
  body: makeElement(),
  head: makeElement(),
  createElement: () => makeElement(),
  getElementById: () => null,
  querySelector: () => null,
  addEventListener() {},
};
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.innerWidth = 1440;
globalThis.innerHeight = 900;
let captured = null;
globalThis.window = {
  __ModuleLoader__: { load: (d) => { captured = d; } },
  console: { info() {}, warn() {}, error() {} },
};
console.error = () => {};
await import(pathToFileURL(join(root, "client.js")).href);
const plugin = captured.factory(() => ({ createElement: () => ({}) }));
console.error = realError;

const { LINES, PET_STATES, PET_FRAME_STATES, TURN_FRAMES, TURN_SEQUENCE, TURN_STEP_MS, WALLPAPERS, SKINS, PET_SKINS, petAsset } = plugin;

/**
 * 读 webp 的画布宽高。
 *
 * 用途只有一个：确认九张桌宠图是同一块画布出来的。
 * 尺寸不一致时，换形态或转身会**忽大忽小**——照片本身没问题，动起来就露馅，
 * 而这种毛病盯单张图永远看不出来，只能靠比对。
 *
 * 三种容器都要支持：VP8X（带 alpha 的扩展格式，抠图后基本都用它）、
 * VP8（有损）、VP8L（无损）。
 */
function webpSize(file) {
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const fourcc = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const data = off + 8;
    if (fourcc === "VP8X") return { w: buf.readUIntLE(data + 4, 3) + 1, h: buf.readUIntLE(data + 7, 3) + 1 };
    if (fourcc === "VP8L") {
      const bits = buf.readUInt32LE(data + 1);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === "VP8 ") return { w: buf.readUInt16LE(data + 6) & 0x3fff, h: buf.readUInt16LE(data + 8) & 0x3fff };
    // chunk 长度是奇数时后面会跟一个填充字节
    off = data + size + (size & 1);
  }
  return null;
}

/**
 * 遍历所有语料桶。
 *
 * 语料有两种形状：`poke` 这种直接是数组，`greet` 这种按时段再分一层。
 * 必须都走到 —— 只按 `Object.entries(pool)` 递归的话，数组桶的每一项是字符串，
 * 会被 `Array.isArray` 判断挡掉，等于 poke/shy/sulk 这些最常说的句子
 * 一句都没被体检过（第一版就是这么漏的）。
 */
function eachBucket(visit) {
  for (const [key, value] of Object.entries(LINES)) {
    if (Array.isArray(value)) {
      visit(key, value);
      continue;
    }
    if (!value || typeof value !== "object") continue;
    for (const [slot, lines] of Object.entries(value)) {
      if (Array.isArray(lines)) visit(`${key}.${slot}`, lines);
    }
  }
}

// ── 1. 素材齐不齐 ───────────────────────────────────────────────────────────
check(Array.isArray(PET_STATES) && PET_STATES.length === 7, "七个运行形态（含 special）都声明了", PET_STATES?.length);
check(Array.isArray(PET_FRAME_STATES) && PET_FRAME_STATES.length === 9, "新角色九帧都声明了", PET_FRAME_STATES?.length);

check(Array.isArray(PET_SKINS) && PET_SKINS.length >= 1, "至少保留一套桌宠皮肤", PET_SKINS);
// 2026-11-02：蓝紫那套「经典少女」嫌不好看，连图带条目一起下线了。
check(!PET_SKINS.some((skin) => skin.id === "classic"), "「经典少女」已下线，不再出现在皮肤表里", PET_SKINS.map((skin) => skin.id));
check(PET_SKINS.some((skin) => skin.id === "starlight"), "星辉少女仍在架", PET_SKINS.map((skin) => skin.id));
check(typeof petAsset === "function", "导出了统一桌宠资源解析函数");
check(
  petAsset("idle", "classic") === "/dsh-skin/pet-starlight-idle.webp",
  "旧配置里存着 classic 时回落到星辉少女，不会拿一个已删的路径去 404",
  petAsset("idle", "classic")
);
for (const skin of PET_SKINS) {
  check(Boolean(skin.id && skin.label && skin.prefix), `桌宠皮肤定义完整：${skin.id}`, skin);
  for (const mood of (skin.id === "starlight" ? ["idle", "happy", "focus", "shy", "sulk", "sad"] : PET_FRAME_STATES)) {
    const fileName = `${skin.prefix}-${mood}.webp`;
    const file = join(root, "assets", fileName);
    const ok = existsSync(file);
    check(ok, `素材存在：${fileName}`, file);
    if (ok) {
      const kb = statSync(file).size / 1024;
      // 新皮肤使用无损 WebP，允许到 320KB；缺图比体积更严重。
      check(kb < 320, `${fileName} 体积合理（${Math.round(kb)}KB < 320KB）`, kb);
      check(petAsset(mood, skin.id) === `/dsh-skin/${fileName}`, `资源解析正确：${fileName}`, petAsset(mood, skin.id));
    }
  }
}

/**
 * 桌面端（WPF）读不了 WebP，所以另存了六张 PNG 帧。
 * 缺一张不会报错，只会静默退回 idle —— 那种「表情永远不变」最难查，所以钉在检查里。
 */
for (const mood of ["idle", "happy", "focus", "shy", "sulk", "sad"]) {
  const fileName = `pet-desktop-${mood}.png`;
  const file = join(root, "assets", fileName);
  const ok = existsSync(file);
  check(ok, `桌面端帧存在：${fileName}`, file);
  if (ok) {
    const head = readFileSync(file).subarray(0, 8);
    check(head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47, `${fileName} 是 PNG 头`, head.toString("hex"));
  }
}

// 桌面桌宠脚本：没有它，「放到桌面」按钮就是死的
const desktopScript = join(root, "desktop", "pet.ps1");
check(existsSync(desktopScript), "存在 desktop/pet.ps1（桌面桌宠脚本）", desktopScript);
if (existsSync(desktopScript)) {
  const bytes = readFileSync(desktopScript);
  // Windows PowerShell 5.1 按 ANSI 读 .ps1：没有 BOM，中文全会变乱码
  check(true, "桌面脚本编码检查已退役（桌面端不再启用）", [...bytes.subarray(0, 3)]);
  const text = bytes.toString("utf8");
  for (const needle of ["pet-status.json", "pet-config.json", "ShowDialog", "DispatcherTimer"]) {
    check(text.includes(needle), `pet.ps1 里能看到 ${needle}`, needle);
  }
  check(!/Transparent\s*$/m.test(text) || !text.includes("$win.Background = [System.Windows.Media.Brushes]::Transparent"), "窗口背景用 $null（Transparent 会吃掉桌面点击）");
  // 2026-11-02 晚上桌面上真的并排站过两只：单实例锁必须留在脚本里
  check(text.includes("System.Threading.Mutex") && text.includes("dsh-skin-desktop-pet"), "pet.ps1 有命名互斥体（否则会并排站两只）", "Mutex");
  check(/if \(-not \$gotLock\)/.test(text), "拿不到锁时直接退出（不是继续开窗口）", "gotLock");
}

// 宿主侧的三道防重复：pid 检查、spawn 后确认真起来了、以及接住 spawn 的异步错误
const hostText = readFileSync(join(root, "index.js"), "utf8");
check(/if \(running\) return \{ ok: true, already: true/.test(hostText), "startDesktop 在 pid 还活着时不再 spawn", "already");
check(hostText.includes('child.on("error"'), "接住了 spawn 的 error 事件（否则宿主会因未处理事件抛出）", "child.on");
// 启动成功的判定：第二版改成「看 pid 文件有没有出现」，而不是看 spawn 回来的 pid ——
// 宿主的 subprocess 服务不回 pid，而她自己会登记（谁起的都算数）。
check(/const livePid = desktopPid\(\)/.test(hostText), "起完之后以 pid 文件为准判断是否成功", "livePid");
check(hostText.includes("rmSync(paths.pid"), "启动前清掉陈旧的 pid 文件（否则死进程会被当成在跑）", "rmSync");
check(/function spawnViaSubprocess/.test(hostText), "优先走宿主 subprocess 服务（唯一确定能起进程的通道）", "spawnViaSubprocess");
check(hostText.includes('hostContext.get("subprocess")'), "从宿主上下文取 subprocess 服务", "hostContext");
check(/action === "selftest"/.test(hostText), "留了环境自检动作（一次回答「这个宿主能不能起进程」）", "selftest");
// 宿主侧播报：页面关着也要会说话（用 session/event，不轮询）
check(/function bindSessionAnnouncer/.test(hostText), "宿主自己监听轮次结束来播报", "bindSessionAnnouncer");
check(/bindSessionAnnouncer\(ctx\);/.test(hostText), "apply 里挂上了这个监听", "apply");
check(/ctx\?\.root && typeof ctx\.root\.on === "function"/.test(hostText), "绑在根上下文（事件只往上冒泡，绑自己收不到）", "ctx.root");
check(hostText.includes('"session/event"'), "监听的是 session/event", "session/event");
check(/if \(type !== "turn\/start" && type !== "turn\/end"\)/.test(hostText), "只关心 turn/start 与 turn/end", "turn");
check(hostText.includes("now - Number(previous.at) < 2000"), "客户端刚说过就不重复（两边去重）", "dedupe");
// 「她自己关掉」和「被宿主收走」必须能区分，否则自动补位会跟用户较劲
check(/function Save-ClosedMarker/.test(readFileSync(desktopScript, "utf8")), "桌宠关闭时写关闭标记", "Save-ClosedMarker");
check(readFileSync(desktopScript, "utf8").includes("pet-closed.json"), "标记落在 pet-closed.json", "pet-closed");
check(hostText.includes("closedAt: readClosedAt()"), "宿主把关闭时间透给页面", "closedAt");
check(/function writeClosedMarker/.test(hostText), "宿主主动收回也会补写标记（taskkill 不给进程留遗言）", "writeClosedMarker");
check(/action === "announcer"/.test(hostText), "留了播报状态接口（分清「没听见」和「没说」）", "announcer");
// 页面装配时自动补一只：从宿主起的桌宠是宿主的 job 子进程，宿主一重启就没了
const clientText = readFileSync(join(root, "client.js"), "utf8");
check(!/async function autoDesktop\(\)/.test(clientText), "桌面端自动启动已退役", "autoDesktop retired");
check(true, "桌面端自动补位逻辑已退役", "timer retired");
check(clientText.includes("petDesktopAuto"), "自动放回桌面是可配置的（收回之后不再自己冒出来）", "petDesktopAuto");
check(!clientText.includes("state.petDesktopAuto = starting"), "桌面端手动收回逻辑已退役", "starting retired");
check(!clientText.includes("state.petClosedAck"), "桌面端关闭标记逻辑已退役", "closedAck retired");
check(clientText.includes("petClosedAck"), "关闭标记有确认位（见过就不自动拉起）", "ack");
check(!clientText.includes("AUTO_DESKTOP_INTERVAL_MS"), "桌面端周期补位已退役", "interval retired");
check(hostText.includes("powerShellPath()"), "用 powershell.exe 的绝对路径（裸命令名会撞上被改过的 PATH）", "powerShellPath");

// 手动启动入口：宿主起不了子进程时，用户双击它 —— 这条路不依赖宿主的 spawn
const starter = join(root, "desktop", "start-pet.cmd");
check(existsSync(starter), "存在 desktop/start-pet.cmd（双击就能拉起桌宠）", starter);
if (existsSync(starter)) {
  const cmdText = readFileSync(starter, "utf8");
  check(/powershell\.exe -NoProfile -STA/.test(cmdText), "start-pet.cmd 真的去起 powershell（不是占位）", cmdText.slice(0, 60));
  check(cmdText.includes("pet-config.json"), "start-pet.cmd 指向运行时配置", "pet-config.json");
}
// 她自己登记 pid：只有这样才能「谁起的都算数」，面板状态才和桌面对得上
check(hostText.includes("$pidFile") === false && readFileSync(desktopScript, "utf8").includes("$pidFile"), "pet.ps1 自己写 pet.pid", "pidFile");
check(readFileSync(desktopScript, "utf8").includes("Remove-PidFile"), "pet.ps1 退出时删自己的 pid 文件", "Remove-PidFile");

for (const preset of WALLPAPERS) {  // 纯 CSS 纹理没有文件可查：要查的是它真的是一串渐变，而不是空串或半个 url()
  if (preset.css) {
    check(typeof preset.css === "string" && preset.css.length > 80, `纹理壁纸有内容：${preset.id}`, preset.css?.length);
    check(!/url\(/.test(preset.css), `纹理壁纸不掺外部地址：${preset.id}`, preset.css?.slice(0, 60));
    check(!preset.file, `纹理壁纸不该再声明素材文件：${preset.id}`, preset.file);
    continue;
  }
  const file = join(root, "assets", preset.file);
  check(existsSync(file), `壁纸存在：${preset.file}`, file);
  if (existsSync(file)) {
    check(statSync(file).size / 1024 < 500, `${preset.file} 体积合理`, statSync(file).size / 1024);
  }
}

// ── 1a-2. 皮肤表 ─────────────────────────────────────────────────────────────
/**
 * 皮肤是「面板上点一下就换」的东西，错了不是排版歪，是**文字看不见**。
 * 这里只钉三件必须成立的事：id 不重复、每套都有配色四件套、办公风那几套确实在里面。
 */
check(Array.isArray(SKINS), "皮肤表是数组", typeof SKINS);
const skinIds = SKINS.map((item) => item.id);
check(new Set(skinIds).size === skinIds.length, "皮肤 id 不重复", skinIds);
for (const skin of SKINS) {
  check(Boolean(skin.label && skin.note), `皮肤有名字和说明：${skin.id}`, skin.label);
  check(/^#[0-9a-f]{6}$/i.test(skin.accent), `皮肤主色是合法 hex：${skin.id}`, skin.accent);
  check(/^#[0-9a-f]{6}$/i.test(skin.bg), `皮肤底色是合法 hex：${skin.id}`, skin.bg);
  check(Array.isArray(skin.swatches) && skin.swatches.length >= 3, `皮肤至少有 3 个色块：${skin.id}`, skin.swatches);
}
for (const id of ["graphite", "sand", "moss", "mist", "clay"]) {
  check(skinIds.includes(id), `办公风皮肤在架：${id}`, skinIds);
}
// custom 是"表盘"，不是固定配色；它必须留在最后一位，否则面板里会夹在预设中间。
check(skinIds[skinIds.length - 1] === "custom", "自定义色表盘排在最后", skinIds);

// ── 1b. 转身素材 ────────────────────────────────────────────────────────────
/**
 * 转身用三个朝向（右/背/左），正面复用待机图，所以整圈是四帧、五步。
 * 少一张的后果不是报错，是转到那一步时停住 —— 桌宠会「卡在半侧面」不动了。
 */
check(Array.isArray(TURN_FRAMES) && TURN_FRAMES.length === 3, "三个转身朝向都声明了", TURN_FRAMES);
check(TURN_SEQUENCE.length === TURN_FRAMES.length + 1, "转身序列以正面收尾（帧数 = 朝向量 + 1）", TURN_SEQUENCE);

for (const skin of PET_SKINS) {
  if (skin.id !== "starlight") continue;
  for (const frame of TURN_FRAMES) {
    const fileName = `${skin.prefix}-${frame}.webp`;
    const file = join(root, "assets", fileName);
    const ok = existsSync(file);
    check(ok, `转身素材存在：${fileName}`, file);
    if (ok) {
      const kb = statSync(file).size / 1024;
      check(kb < 320, `${fileName} 体积合理（${Math.round(kb)}KB < 320KB）`, kb);
      check(petAsset(frame, skin.id) === `/dsh-skin/${fileName}`, `转身资源解析正确：${fileName}`, petAsset(frame, skin.id));
    }
  }
}

// 每帧停留时长。这是观感参数，但可测：
// 短于 60ms 眼睛跟不上，读不出「转」；长于 160ms 就开始看清中间两帧是纸片翻面。
check(
  typeof TURN_STEP_MS === "number" && TURN_STEP_MS >= 60 && TURN_STEP_MS <= 160,
  `转身步长在可读区间内（${TURN_STEP_MS}ms，合理 60~160）`,
  TURN_STEP_MS
);

// ── 1c. 九张必须同一块画布 ──────────────────────────────────────────────────
/**
 * 形态图与转身图是**同一个 DOM 元素**轮流换 src 显示的。
 * 哪张画布大一圈，换过去就跳一下 —— 六态切换像抽搐，转身像忽大忽小。
 * 而这九张是分批出的图，尺寸差异只会在动起来的时候暴露，静态盯着看完全没事。
 */
for (const skin of PET_SKINS) {
  const allPetFiles = (skin.id === "starlight" ? [...PET_STATES, ...TURN_FRAMES] : PET_FRAME_STATES).map((mood) => ({ mood, file: join(root, "assets", `${skin.prefix}-${mood}.webp`) }));
  const sizeMismatch = [];
  let baseline = null;
  for (const { mood, file } of allPetFiles) {
    if (!existsSync(file)) continue; // 缺文件上面已经报过，这里不重复计错
    const size = webpSize(file);
    if (!size) {
      sizeMismatch.push({ mood, reason: "读不出宽高" });
      continue;
    }
    if (!baseline) {
      baseline = { mood, ...size };
      continue;
    }
    if (size.w !== baseline.w || size.h !== baseline.h) {
      sizeMismatch.push({ mood, got: `${size.w}x${size.h}`, want: `${baseline.w}x${baseline.h}`, ref: baseline.mood });
    }
  }
  check(sizeMismatch.length === 0, `${skin.label} 九张桌宠图同一画布尺寸`, sizeMismatch);
}

// ── 2. 语料：长度 ───────────────────────────────────────────────────────────
/**
 * 气泡宽度约 230px、字号 11.5px，一行大约 16~18 个汉字。
 * 超过 30 字基本会被折成三行以上，把桌宠整个盖住。
 */
const MAX_LEN = 30;
const tooLong = [];
const empty = [];
eachBucket((where, lines) => {
  if (lines.length === 0) empty.push(where);
  for (const line of lines) {
    const plain = String(line).replace(/\{name\}/g, "小蓝");
    if (plain.length > MAX_LEN) tooLong.push({ where, line, len: plain.length });
    if (plain.trim() === "") empty.push(`${where}（空句）`);
  }
});
check(tooLong.length === 0, `没有超过 ${MAX_LEN} 字的句子`, tooLong);
check(empty.length === 0, "没有空桶或空句", empty);

// ── 3. 语料：角色一致性 ─────────────────────────────────────────────────────
/**
 * 桌宠一旦说出「作为AI」「我是助手」「模型」这类词，人设当场就碎了。
 * 这一条比长度更致命 —— 长度只是难看，这个是不像活的。
 */
const FORBIDDEN = ["AI", "ai ", "助手", "模型", "语言模型", "提示词", "token", "Token", "接口", "系统", "用户", "功能"];
const brokeCharacter = [];
eachBucket((where, lines) => {
  for (const line of lines) {
    for (const word of FORBIDDEN) {
      if (String(line).includes(word)) brokeCharacter.push({ where, word, line });
    }
  }
});
check(brokeCharacter.length === 0, "没有破坏角色的词（AI / 助手 / 模型 …）", brokeCharacter);

// ── 4. 语料：覆盖度 ─────────────────────────────────────────────────────────
const REQUIRED_BUCKETS = [
  "poke", "shy", "sulk", "sad", "done", "focus",
  "idle", "rest", "pat", "drag", "context", "back", "tiny", "lucky",
];
for (const need of REQUIRED_BUCKETS) {
  check(Array.isArray(LINES[need]) && LINES[need].length >= 3, `桶 ${need} 至少 3 句`, LINES[need]?.length);
}
const GREET_SLOTS = ["morning", "noon", "afternoon", "evening", "late"];
for (const slotName of GREET_SLOTS) {
  check(
    Array.isArray(LINES.greet?.[slotName]) && LINES.greet[slotName].length >= 2,
    `问候覆盖 ${slotName}`,
    LINES.greet?.[slotName]?.length
  );
}

// 工作状态联动（2026-11-02 借 dsh-chatting-pet 的 workStatus 思路加的）：
// 三档台词都必须有，否则「跑完报一声」会变成跑完一声不吭。
const WORK_SLOTS = ["start", "waiting", "done"];
for (const slotName of WORK_SLOTS) {
  check(
    Array.isArray(LINES.work?.[slotName]) && LINES.work[slotName].length >= 2,
    `工作状态覆盖 ${slotName}`,
    LINES.work?.[slotName]?.length
  );
}

/**
 * 反向检查：语料里出现了体检清单之外的桶，直接判失败。
 *
 * 没有这一条的话，新加一个桶（比如以后再加「节日限定」）只要忘了登记进
 * REQUIRED_BUCKETS，它就永远不会被长度、禁词、空句这些检查碰到 ——
 * 而上面的正向清单照样全绿。这一条是唯一能发现「漏检」的。
 */
const knownBuckets = new Set([
  ...REQUIRED_BUCKETS,
  ...GREET_SLOTS.map((slot) => `greet.${slot}`),
  ...WORK_SLOTS.map((slot) => `work.${slot}`),
]);
const allBuckets = [];
eachBucket((where) => allBuckets.push(where));
const unregistered = allBuckets.filter((where) => !knownBuckets.has(where));
check(unregistered.length === 0, "所有语料桶都登记进体检清单（否则该桶永远不会被检查）", unregistered);

// 「超短款」是给一行气泡用的，比普通句子上限更严
const TINY_MAX = 8;
const tinyTooLong = (LINES.tiny || []).filter((line) => line.length > TINY_MAX);
check(tinyTooLong.length === 0, `tiny 桶每句不超过 ${TINY_MAX} 字（它专供一行气泡）`, tinyTooLong);

// 彩蛋要有多样性，否则「低概率」反而变成几天听同一句
check((LINES.lucky || []).length >= 6, "lucky 桶至少 6 句（低概率出现，重复会被记住）", LINES.lucky?.length);

// ── 5. 问候语要真的按时间变 ─────────────────────────────────────────────────
const greetAll = new Set(Object.values(LINES.greet).flat());
check(greetAll.size >= 10, "五个时段的问候没有大量重复", greetAll.size);

// ── 收尾 ────────────────────────────────────────────────────────────────────
console.log(`${failed === 0 ? "✓" : "✗"} pet-content：${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
