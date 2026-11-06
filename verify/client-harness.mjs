/**
 * 浏览器半的降级冒烟：不开浏览器，把 client.js 真跑一遍。
 *
 * 要证明的就一件事：**皮肤坏了，不许把整页带走。**
 * 所以这里刻意造三个坏局面，断言 `apply` 一个都不往外抛：
 *
 * 1. 正常宿主 —— 两处注册都到位，降级清单为空。
 * 2. 宿主没有 `slots` —— 这正是 2026-10-31 那次白屏的形态（漏写 inject）。
 * 3. 宿主连 `ctx.effect` 都没有 —— 更早一步就坏。
 *
 * 另外把 `exports.inject` 钉住：少了它，第 2 种局面就是线上现实。
 *
 * 跑法：node verify/client-harness.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;

// 下面会把 console.error 换成空函数（client.js 的降级会往里写证据，刷屏）。
// 先把这个真身留出来，否则断言失败的信息也会被一起吞掉 —— 只看到「3 失败」，
// 看不到是哪 3 条，等于没有测试。
const realError = console.error.bind(console);

function check(ok, label, detail) {
  if (ok) { passed += 1; return; }
  failed += 1;
  realError(`✗ ${label}`);
  if (detail !== undefined) realError("  ", typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
}

// ── 假环境：只补 client.js 真用到的那几样 ────────────────────────────────────
function makeElement(tag = "div") {
  const attrs = new Map();
  const node = {
    tagName: tag,
    dataset: {},
    className: "",
    textContent: "",
    innerHTML: "",
    src: "",
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 120,
    offsetHeight: 132,
    children: [],
    parentNode: null,
    style: {
      values: new Map(),
      setProperty(name, value, priority = "") {
        this.values.set(name, { value: String(value), priority: String(priority) });
      },
      removeProperty(name) { this.values.delete(name); },
      getPropertyValue(name) { return this.values.get(name)?.value || ""; },
      getPropertyPriority(name) { return this.values.get(name)?.priority || ""; },
    },
    classList: {
      set: new Set(),
      add(name) { this.set.add(name); },
      remove(name) { this.set.delete(name); },
      contains(name) { return this.set.has(name); },
    },
    appendChild(child) { child.parentNode = node; this.children.push(child); return child; },
    prepend(child) { child.parentNode = node; this.children.unshift(child); return child; },
    remove() {
      if (!node.parentNode?.children) return;
      const index = node.parentNode.children.indexOf(node);
      if (index >= 0) node.parentNode.children.splice(index, 1);
      node.parentNode = null;
    },
    /**
     * 记下处理器而不是丢掉。
     *
     * 转身、戳一下、摸头这些都是绑在元素上的行为，只断言「apply 不抛」看不到它们。
     * 有了这张表，测试就能像真用户那样派发 dblclick / pointerup。
     * 同名事件只留最后一个 —— 和 `addEventListener` 的真实语义不同，
     * 但本项目每个事件只绑一次，够用。
     */
    __handlers: new Map(),
    addEventListener(type, handler) { node.__handlers.set(type, handler); },
    setPointerCapture() {},
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    /**
     * 按选择器返回固定子节点：同一选择器每次拿到同一个元素，
     * 这样 `setMood` 里「取到 .pet-img 再改 src」能被真实观察到。
     *
     * 装配前返回 null —— 真 DOM 里 `innerHTML` 还没写进去时本来就没有子节点。
     * 不加这一条的话，`renderPet` 会误判「已经装配过」而跳过建结构，
     * 于是 setMood / 初始形态这些真正要验的东西全被绕过（第一版就是这么漏的）。
     */
    querySelector(selector) {
      if (!node.innerHTML) return null;
      if (!node.__query) node.__query = new Map();
      if (!node.__query.has(selector)) node.__query.set(selector, makeElement(selector.replace(/[^a-z]/gi, "") || "div"));
      return node.__query.get(selector);
    },
    querySelectorAll(selector) {
      if (selector === "#dsh-skin-pet-root") {
        return body.children.filter((child) => child.id === "dsh-skin-pet-root");
      }
      return [];
    },
    /** `renderPet` 会拿它挂拖拽事件；给一个桩，别让它抛。 */
    get firstElementChild() { return makeElement(); },
  };
  return node;
}

const body = makeElement("body");
const documentElement = makeElement("html");
const appRoot = makeElement("div");
appRoot.id = "root";
body.appendChild(appRoot);

globalThis.document = {
  documentElement,
  body,
  head: makeElement("head"),
  createElement: (tag) => makeElement(tag),
  getElementById: (id) => body.children.find((node) => node.id === id) || null,
  querySelector: () => null,
  querySelectorAll: (selector) => selector === "#dsh-skin-pet-root"
    ? body.children.filter((node) => node.id === "dsh-skin-pet-root")
    : [],
  addEventListener() {},
  removeEventListener() {},
};

globalThis.localStorage = {
  store: new Map(),
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
  setItem(key, value) { this.store.set(key, String(value)); },
};

globalThis.CSS = { escape: (value) => String(value) };
globalThis.innerWidth = 1440;
globalThis.innerHeight = 900;

let captured = null;
/**
 * 假 window 也要能收发事件：跨插件换肤契约（`dsh-skin:apply` / `dsh-skin:changed`）
 * 全靠它，没有事件总线这一节就只能测到"不抛异常"，测不到"真的换上了"。
 * 用 Node 自带的 EventTarget 兜底，行为和浏览器一致。
 */
const windowBus = new EventTarget();
globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  __ModuleLoader__: { load: (definition) => { captured = definition; } },
  console: { info() {}, warn() {}, error() {} },
  addEventListener: (type, handler) => windowBus.addEventListener(type, handler),
  removeEventListener: (type, handler) => windowBus.removeEventListener(type, handler),
  dispatchEvent: (event) => windowBus.dispatchEvent(event),
};

// `safely` 里会调 console.error 记证据，这里静音，避免刷屏。
console.error = () => {};

// ── 装载真文件 ───────────────────────────────────────────────────────────────
await import(pathToFileURL(join(here, "..", "client.js")).href);

check(captured !== null, "client.js 调用了 window.__ModuleLoader__.load");
const plugin = captured.factory((name) => {
  if (name === "react") {
    return { createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }) };
  }
  throw new Error(`client.js 引用了未提供的模块：${name}`);
});

// ── 1. 注入声明 ──────────────────────────────────────────────────────────────
  check(Array.isArray(plugin.inject) && plugin.inject.includes("slots"),
  "exports.inject 声明了 slots（漏了它 = 线上白屏）", plugin.inject);
check(Array.isArray(plugin.inject) && plugin.inject.includes("layout"),
  "exports.inject 声明了 layout（关闭面板需要返回聊天）", plugin.inject);

// ── 2. 正常宿主 ──────────────────────────────────────────────────────────────
function makeCtx({ slots = true, effect = true } = {}) {
  const registered = [];
  const injected = [];
  const ctx = {};
  if (effect) {
    ctx.effect = (callback) => { callback(); return () => {}; };
  }
  if (slots) {
    ctx.slots = {
      inject: (name, mount) => { injected.push(name); return mount(); },
      register: (options) => { registered.push(options); return () => {}; },
    };
  }
  ctx.logger = { info() {}, warn() {} };
  return { ctx, registered, injected };
}

const happy = makeCtx();
const happyThrow = (() => { try { plugin.apply(happy.ctx); return null; } catch (error) { return error; } })();
check(happyThrow === null, "正常宿主下 apply 不抛", String(happyThrow));
check(happy.registered.some((row) => row.name === "main" && row.key === plugin.PANEL_KEY), "注册了主区面板");
check(happy.registered.some((row) => row.name === "sidebar.panellist" && row.id === plugin.PANEL_KEY), "注册了侧栏入口");
check(happy.injected.includes("main") && happy.injected.includes("sidebar.panellist"), "两处都注入到了对应槽位");
check(plugin.diagnostics().length === 0, "正常宿主下没有任何降级", plugin.diagnostics());

// ── 3. 宿主没有 slots（原事故形态） ──────────────────────────────────────────
const noSlots = makeCtx({ slots: false });
const noSlotsThrow = (() => { try { plugin.apply(noSlots.ctx); return null; } catch (error) { return error; } })();
check(noSlotsThrow === null, "缺 slots 时 apply 也不抛（整页得以存活）", String(noSlotsThrow));
const slotsIssues = plugin.diagnostics();
check(slotsIssues.length === 2, "缺 slots 时两处注册都记为降级", slotsIssues);
check(slotsIssues.every((issue) => typeof issue.message === "string" && issue.message.length > 0), "降级项都带得住原因", slotsIssues);

// ── 4. 宿主连 effect 都没有 ──────────────────────────────────────────────────
const noEffect = makeCtx({ effect: false });
const noEffectThrow = (() => { try { plugin.apply(noEffect.ctx); return null; } catch (error) { return error; } })();
check(noEffectThrow === null, "缺 ctx.effect 时 apply 也不抛", String(noEffectThrow));
check(plugin.diagnostics().length === 4, "累计 4 处降级（2 + 2）", plugin.diagnostics().length);

// ── 5. 真实渲染结果：壁纸路径与桌宠初始形态 ──────────────────────────────────
/**
 * 这一节钉的是 2026-10-31 那批修复的实际成果：
 *   - 壁纸不能再指向 `/plugins/dsh-plugin-skin/assets/...`（那条路只服务 JS chunk，必然 404）
 *   - 桌宠不能还是那个 emoji 方块，默认得是新皮肤 /dsh-skin/pet-starlight-idle.webp
 * 「apply 不抛」只能证明没崩，证明不了东西对不对。
 *
 * 注意不要清空 body.children：桌宠根节点是模块级变量持有、只在第一次 apply 时
 * append 一次的，清空之后它不会重新出现，断言会假失败。
 */
const renderCtx = makeCtx();
let renderThrow = null;
try {
  plugin.apply(renderCtx.ctx);
} catch (error) {
  renderThrow = error;
}
check(renderThrow === null, "渲染场景 apply 不抛", String(renderThrow));

const layers = body.children.filter((node) => node.id === "dsh-skin-wallpaper");
check(layers.length >= 1, "创建了壁纸层");
const layer = layers[layers.length - 1];
const wallpaperValue = String(layer?.style?.backgroundImage || "");
check(
  body.children.filter((node) => node.id === "dsh-skin-wallpaper").length === 1,
  "页面始终只创建一个壁纸层",
  body.children.filter((node) => node.id === "dsh-skin-wallpaper").length
);
check(
  wallpaperValue.includes("/dsh-skin/wallpaper-kawaii-catdog.webp"),
  "壁纸指向 /dsh-skin/wallpaper-kawaii-catdog.webp（宿主自挂路由）",
  wallpaperValue
);
check(
  String(documentElement.style.getPropertyValue("--dsw-alias-bg-base")).includes("rgba(238,247,255"),
  "主题令牌写入 html 根节点",
  documentElement.style.getPropertyValue("--dsw-alias-bg-base")
);
check(
  String(appRoot.style.getPropertyValue("--dsw-alias-bg-base")).includes("rgba(238,247,255"),
  "主题令牌同步写入 DSH 应用根 #root",
  appRoot.style.getPropertyValue("--dsw-alias-bg-base")
);
check(
  appRoot.style.getPropertyPriority("--dsw-alias-bg-base") === "important",
  "应用根令牌使用 important，压过宿主默认白色令牌",
  appRoot.style.getPropertyPriority("--dsw-alias-bg-base")
);
check(
  String(document.head.children.find?.((node) => node.id === "dsh-skin-style")?.textContent || "").includes("_emptyTabHost"),
  "全局样式包含真实 DSH 壳层去重规则"
);
check(
  !wallpaperValue.includes("/plugins/dsh-plugin-skin/assets/"),
  "壁纸不再指向 /plugins/ 那条 404 路径",
  wallpaperValue
);

const petRoots = body.children.filter((node) => node.id === "dsh-skin-pet-root");
check(petRoots.length === 1, "页面始终只创建一个桌宠根节点", petRoots.length);
const petRootNode = petRoots[0];
check(
  String(petRootNode.innerHTML).includes("pet-img"),
  "桌宠结构里用的是 <img>，不再是 emoji 方块",
  String(petRootNode.innerHTML).slice(0, 120)
);
const petImg = petRootNode.querySelector(".pet-img");
check(
  String(petImg?.src || "").includes("/dsh-skin/pet-nuonuo-idle.webp"),
  "桌宠初始形态是待机，默认使用糯糯素材", 
  String(petImg?.src || "")
);
check(
  String(petImg?.getAttribute?.("data-mood") || "") === "idle",
  "初始形态标记为 idle",
  String(petImg?.getAttribute?.("data-mood") || "")
);

// ── 5.5 换皮肤要当场换图（2026-11-04 修） ────────────────────────────────────
/**
 * 以前只有「形态变了」才写 img.src，所以单纯换皮肤时 mood 没动，代码什么都不做：
 * 面板里选了新角色，桌宠还站在原地不动，非得再点一下形态图才刷出来。
 * 下面这条就是钉死「换皮肤 = 立刻换图」。
 */
{
  const beforeSkin = String(petImg?.src || "");
  globalThis.window.__dshSkinRuntime?.api?.apply({ petSkin: "xiu" });
  check(
    String(petImg?.src || "").includes("/dsh-skin/pet-xiu-idle.webp"),
    "换皮肤后桌宠当场换成新素材，不用再点形态图",
    { before: beforeSkin, after: String(petImg?.src || "") }
  );
  check(
    petRootNode.dataset?.petSkin === "xiu" || String(petImg?.getAttribute?.("data-pet-skin")) === "xiu",
    "换皮肤后根节点/图片都记住了新角色",
    petRootNode.dataset?.petSkin
  );
  globalThis.window.__dshSkinRuntime?.api?.apply({ petSkin: "nuonuo" });
  check(
    String(petImg?.src || "").includes("/dsh-skin/pet-nuonuo-idle.webp"),
    "换回来同样即时生效（不会卡在上一只身上）",
    String(petImg?.src || "")
  );
  check(body.children.filter((node) => node.id === "dsh-skin-pet-root").length === 1, "反复换皮肤不会复制出第二只桌宠");
}

// 重复 apply（面板重挂/客户端热重载）不许把用户刚选的皮肤revert回旧值
{
  globalThis.window.__dshSkinRuntime?.api?.apply({ petSkin: "aowu" });
  const remount = makeCtx();
  plugin.apply(remount.ctx);
  const stillAowu = globalThis.window.__dshSkinRuntime?.api?.get?.()?.petSkin === "aowu";
  check(stillAowu, "面板重挂后仍保持刚选的皮肤（不会被旧内存/旧存档覆盖）", globalThis.window.__dshSkinRuntime?.api?.get?.());
  check(
    String(petRootNode.querySelector(".pet-img")?.src || "").includes("pet-aowu-"),
    "重挂后桌宠显示的还是刚选的那只",
    String(petRootNode.querySelector(".pet-img")?.src || "")
  );
  globalThis.window.__dshSkinRuntime?.api?.apply({ petSkin: "nuonuo" });
}

// ── 5.8 这一轮新增的三件：预载瘦身 / 安静时段 / 贴边 ─────────────────────────
{
  const source = readFileSync(join(here, "..", "client.js"), "utf8");

  // 预载瘦身：九只角色 × 12 帧 = 108 个请求，首屏不该这么干。
  check(!/PET_SKINS\.forEach\(\(skin\) => \{\s*\n\s*\[\.\.\.PET_STATES/.test(source), "启动时不再把九只角色全预载");
  check(/preloadPetFrames\(petSkin\.id\)/.test(source), "renderPet 只预载当前角色");
  check(/preloadedPetFrames\.has\(skinId\)\) return;/.test(source), "同一角色不重复预载");

  // 安静时段：跨零点必须算对，两端相等当作没设。
  const q = plugin.inQuietRange;
  check(typeof q === "function", "导出了安静区间纯函数");
  check(q(23, 8, 23) === true && q(23, 8, 0) === true && q(23, 8, 7) === true, "23-8 覆盖深夜到清晨");
  check(q(23, 8, 8) === false && q(23, 8, 12) === false && q(23, 8, 22) === false, "23-8 之外不管");
  check(q(9, 18, 10) === true && q(9, 18, 18) === false, "同一天内的区间也对");
  check(q(9, 9, 10) === false, "起止相同视为没设");
  check(plugin.defaultState().petQuiet === true, "安静时段默认开");
  check(
    plugin.defaultState().petQuietFrom === 23 && plugin.defaultState().petQuietTo === 8,
    "默认 23:00 - 08:00",
    [plugin.defaultState().petQuietFrom, plugin.defaultState().petQuietTo]
  );
  check(!/if \(PET\.mood === "idle" && state\.petEnabled && !PET\.away\) \{/.test(source), "闲时独白已经受安静时段约束");

  // 贴边：纯函数，给坐标就算得出来。
  const s = plugin.snapPosition;
  check(typeof s === "function", "导出了贴边纯函数");
  const nearLeft = s({ x: 3, y: 400, width: 120, height: 132, viewWidth: 1600, viewHeight: 900 });
  check(nearLeft.x === 10 && nearLeft.snappedX === true, "靠近左边就贴到 10px", nearLeft);
  const nearRight = s({ x: 1470, y: 400, width: 120, height: 132, viewWidth: 1600, viewHeight: 900 });
  check(nearRight.x === 1470 && nearRight.snappedX === true, "靠近右边贴右", nearRight);
  const middle = s({ x: 700, y: 400, width: 120, height: 132, viewWidth: 1600, viewHeight: 900 });
  check(middle.x === 700 && middle.y === 400 && middle.snappedX === false, "离边远就不动", middle);
  const bottom = s({ x: 700, y: 770, width: 120, height: 132, viewWidth: 1600, viewHeight: 900 });
  check(bottom.y === 758 && bottom.snappedY === true, "靠近底边贴底", bottom);
  const overflow = s({ x: -40, y: 2000, width: 120, height: 132, viewWidth: 1600, viewHeight: 900 });
  check(overflow.x === 10 && overflow.y === 758, "越界坐标先夹回可视区再贴边", overflow);

  // 键盘：桌宠本身可聚焦，Enter 等于戳一下。
  const petNodeForKeys = petRootNode.querySelector(".dsh-skin-pet");
  check(petNodeForKeys?.__handlers?.has("keydown"), "桌宠绑了键盘事件（Tab 到它按回车）");
  check(petNodeForKeys?.tabIndex === 0, "桌宠可以被 Tab 选中", petNodeForKeys?.tabIndex);

  // 右键菜单里有换角色，不用开面板翻三层。
  check(source.includes("换个角色（下一个）"), "右键菜单能直接换下一个角色");

  // 桌宠是透明 PNG：被涂上底色就是一块方块（用户看到过粉的一块）。
  check(
    /body\[data-dsh-skin-theme\] \[role="button"\]:hover:not\(\[class\*="dsh-skin"\]\):not\(\[class\*="dsh-pet"\]\)/.test(source),
    "宿主按钮的 hover 上色排除了本插件自己的元素"
  );
  check(/#dsh-skin-pet-root \.dsh-skin-pet:hover,/.test(source), "桌宠 hover 明确写死透明底（双保险）");
  check(
    /\.dsh-skin-panel \.dsh-skin-petcard\.is-active:hover\{background-color:transparent\}/.test(source),
    "皮肤卡片 hover 也不吃宿主底色"
  );
}
/**
 * 宿主重挂、客户端热重载都会让模块再求值一次，旧实例的定时器不会自己消失。
 * 两个实例各改同一张图，就会来回跳。这里钉住三条防线的源码契约：
 * 共用的 state、接管权、旧实例定时器自杀。
 */
{
  const source = readFileSync(join(here, "..", "client.js"), "utf8");
  check(/let state = RUNTIME\.state \|\| load\(\)/.test(source), "新实例复用内存里的 state，不拿旧存档覆盖");
  check(/RUNTIME\.instance = INSTANCE/.test(source), "apply 时接管实例号");
  check(/if \(!stillLive\(\)\) \{\s*clearInterval\(PET\.turnInterval\)/.test(source), "旧的转身定时器发现自己下台就停");
  check(/if \(!stillLive\(\)\) \{\s*clearInterval\(PET\.sitInterval\)/.test(source), "旧的久坐心跳同样自杀");
  check(/if \(!stillLive\(\)\) return;\s*\n\s*if \(PET\.mood === "idle"/.test(source), "旧的独白定时器不再开口");
  check(/if \(!RUNTIME\.greeted\)/.test(source), "见面礼整页只来一次");
  // 面板里换皮肤走的是 renderPet：它必须自己把图对齐，不能等 setMood 顺手改。
  check(/paintPetAsset\(image, PET\.mood, petSkin\.id\);/.test(source), "renderPet 按「该显示的图」对齐 src");
  // 关掉桌宠再打开：DOM 是新建的，缓存却还留着上一条图 —— 必须按真实 src 判断。
  check(
    /const applied = typeof img\.getAttribute === "function" \? img\.getAttribute\("src"\) : null;/.test(source),
    "对齐按 DOM 上的真实 src 判断，不信缓存（收起过一次再打开，元素是新的）"
  );
  check(
    /PET\.renderedAsset = null;\s*\n\s*PET\.booted = false;/.test(source),
    "收起桌宠时一并忘掉「已画过图 / 已启动定时器」（2026-11-05 关掉再打开打不开的根因）"
  );
  // 收起再打开会重走一遍启动流程：监听和心跳必须幂等，否则每开合一次就多一份。
  check(
    /if \(!PET\.watching\) \{\s*\n\s*PET\.watching = true;/.test(source),
    "久坐的键鼠监听只挂一次（开合多了会成倍弹提醒）"
  );
  check(/clearInterval\(PET\.sitInterval\);\s*\n\s*PET\.sitInterval = setInterval/.test(source), "久坐心跳重新起之前先停掉旧的");
}

// ── 5.7 取名之后，台词里不许再冒出角色本名（2026-11-04 用户报过）──────────────
/**
 * 原来的语料是模板字符串，把角色名写死在句子里：
 * 「糯糯在这里，芽芽陪你慢慢来」——用户取名「阿宝」之后，前半句是阿宝、后半句又叫糯糯。
 * 现在所有自称都写 `{name}`，并且没取名时用角色本名兜底（不是「小蓝」）。
 */
{
  const api = globalThis.window.__dshSkinRuntime.api;
  const labels = plugin.PET_SKINS.filter((skin) => skin.id !== "starlight").map((skin) => ({ id: skin.id, label: skin.label }));
  api.apply({ petName: "" });
  api.apply({ petSkin: "bo" });
  check(plugin.petName() === "薄老师", "没取名时用角色本名兜底", plugin.petName());
  api.apply({ petName: "小满" });
  check(plugin.petName() === "小满", "取了名就用这个名字", plugin.petName());
  check(plugin.petName().length <= 12, "名字长度受限，不会被塞成一段话", plugin.petName());

  const leaked = [];
  const spoken = [];
  for (const { id, label } of labels) {
    api.apply({ petSkin: id });
    for (const bucket of ["idle", "poke", "greet.morning", "work.done", "shy", "sulk"]) {
      for (let round = 0; round < 6; round += 1) {
        const line = plugin.pick(bucket);
        spoken.push(line);
        if (line.includes(label)) leaked.push({ id, bucket, line });
      }
    }
  }
  check(leaked.length === 0, "所有角色的台词都不再自称角色本名", leaked.slice(0, 3));
  check(spoken.some((line) => line.includes("小满")), "改名后句子里用的是新名字", spoken.slice(0, 4));
  check(
    spoken.every((line) => line.trim().length > 0),
    "每个桶都取到了句子（没有空语料）",
    spoken.filter((line) => !line.trim()).length
  );

  // 语料要真的有差别：八个角色的同一桶不能是同一句话。
  const signatures = labels.map(({ id }) => {
    api.apply({ petSkin: id });
    return [plugin.pick("idle"), plugin.pick("poke"), plugin.pick("done")].join("|");
  });
  check(new Set(signatures).size === labels.length, "八个角色各有各的台词，不是同一句换名字", signatures);

  const perSkin = labels.map(({ id }) => {
    const lines = plugin.CHARACTER_LINES[id];
    const buckets = Object.keys(lines).filter((key) => typeof lines[key] === "object");
    const total = buckets.reduce((sum, key) => {
      const value = lines[key];
      if (Array.isArray(value)) return sum + value.length;
      return sum + Object.values(value).reduce((inner, arr) => inner + (Array.isArray(arr) ? arr.length : 0), 0);
    }, 0);
    return { id, total };
  });
  check(perSkin.every((row) => row.total >= 30), "每个角色至少 30 句，不是三句模板循环", perSkin);

  api.apply({ petName: "", petSkin: "nuonuo" });
}

// ── 6. 转身：四帧走完一整圈 ──────────────────────────────────────────────────
/**
 * 转身是纯运行期行为，改的是同一个 <img> 的 src 序列。
 * 不做这一节的话，「素材都在」「apply 不抛」全绿，但点下去可能一动不动 ——
 * 因为素材存在和动画能播完是两件事。
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const petEl = petRootNode.querySelector(".dsh-skin-pet");
const initialDblclick = petEl?.__handlers?.get("dblclick");
const initialImg = petImg;
if (typeof initialDblclick === "function") {
  const before = String(initialImg.src || "");
  initialDblclick({ preventDefault() {} });
  check(String(initialImg.src || "").includes("pet-nuonuo-special.webp"), "糯糯双击进入特别翻肚皮帧", initialImg.src);
  check(String(initialImg.getAttribute("data-mood") || "") === "special", "糯糯双击标记 special", initialImg.getAttribute("data-mood"));
}
globalThis.window.__dshSkinRuntime?.api?.apply({ petSkin: "starlight" });
check(petEl?.__handlers?.has("dblclick"), "桌宠绑定了 dblclick（转身入口）");

// 把 src 的每次赋值记下来，事后回放成序列
const srcHistory = [];
let liveSrc = String(petImg.src || "");
Object.defineProperty(petImg, "src", {
  configurable: true,
  get() { return liveSrc; },
  set(value) { liveSrc = String(value); srcHistory.push(liveSrc); },
});
const moodOf = (url) => String(url).replace(/^.*\/pet-(?:starlight-|nuonuo-)?/, "").replace(/\.webp$/, "");

const dblclick = petEl?.__handlers?.get("dblclick");
const waitWholeTurn = () => sleep(plugin.TURN_STEP_MS * 6 + 150);

if (typeof dblclick === "function") {
  dblclick({ preventDefault() {} });
  await waitWholeTurn();
  const seq = srcHistory.map(moodOf);
  // 期望值写死，不从 plugin.TURN_SEQUENCE 取 —— 拿被测代码导出的常量当期望值，
  // 顺序真写反了测试也照样绿，那种断言只是自证。
  check(
    JSON.stringify(seq.slice(0, 4)) === JSON.stringify(["turn-right", "turn-back", "turn-left", "idle"]),
    "星辉双击播放右 → 背 → 左 → 待机",
    seq
  );
  check(seq[seq.length - 1] === "shy", "星辉双击完成后接害羞", seq);
  check(
    String(petImg.getAttribute("data-mood") || "") === "shy",
    "星辉落定后形态标记为害羞",
    String(petImg.getAttribute("data-mood") || "")
  );
  check(srcHistory.length <= 7, "整圈没有多余帧（收尾不重复赋同一个 src）", srcHistory.length);
}

// 转身期间被戳：必须立刻停住。停不下来就成了「一边说话一边转圈」，很出戏。
srcHistory.length = 0;
if (typeof dblclick === "function") {
  dblclick({ preventDefault() {} });
  await sleep(30); // 第一帧 already 出，后续帧还在等 timer
  petEl.__handlers.get("pointerdown")?.({ button: 0, clientX: 10, clientY: 10, pointerId: 1 });
  petEl.__handlers.get("pointerup")?.({});
  const atInterrupt = srcHistory.length;
  await waitWholeTurn();
  const leaked = srcHistory.slice(atInterrupt).filter((url) => /pet-(?:starlight|nuonuo)-(?:turn-|peek|special)/.test(url));
  check(atInterrupt >= 1, "打断发生在转身过程中（第一帧已出）", srcHistory.map(moodOf));
  check(leaked.length === 0, "转身被戳时立刻停住，不会插着嘴继续转", leaked.map(moodOf));
}

// ── 7. 长按说话已经整个删掉（2026-11-04 用户要求）────────────────────────────
/**
 * 用户的原话：「只能回答固定的一些对话，没必要」。
 *
 * 删掉的不该只是开关，而是整条链路：按住 0.6 秒挂计时器 → 弹输入条 →
 * POST /dsh-skin/chat。留着任何一段，都是白占一个常驻计时器。
 * 这一节同时测「不该发生的事」和「代码里确实没有这条路」。
 */
const petHost = petRootNode.querySelector(".dsh-skin-pet");
check(typeof petHost?.__handlers?.get("pointerdown") === "function", "拿到了 pointerdown 处理器（否则下面那条是空转）");
const hostChildrenBefore = petHost?.children?.length ?? 0;
petHost?.__handlers?.get("pointerdown")?.({ button: 0, clientX: 10, clientY: 10, pointerId: 1 });
await sleep(780);
const hostChildrenAfter = petHost?.children?.length ?? 0;
check(hostChildrenAfter === hostChildrenBefore, "按住不放也不弹任何输入条", {
  before: hostChildrenBefore,
  after: hostChildrenAfter,
});
petHost?.__handlers?.get("pointerup")?.({});

{
  const source = readFileSync(join(here, "..", "client.js"), "utf8");
  check(!source.includes("petLlm"), "客户端里没有 petLlm 开关了");
  check(!source.includes("openChatInput") && !source.includes("askLlm"), "没有输入条与对话函数");
  check(!source.includes("/chat"), "客户端不再请求 /dsh-skin/chat");
  check(!/LONG_PRESS_MS/.test(source), "没有长按阈值常量");
  check(!source.includes(".pet-input"), "没有输入条样式");
  check(!Object.prototype.hasOwnProperty.call(plugin.defaultState(), "petLlm"), "默认状态里也没有这个键");
}

// ── 8. 跨插件换肤契约（工作小管家的面板靠它换肤）─────────────────────────────
/**
 * 这一节测的是**另一个插件能不能把皮肤换掉**。
 *
 * 契约只有三样东西：`window.__dshSkinRuntime.api`、`dsh-skin:apply`（进）、
 * `dsh-skin:changed`（出）。缺任何一样，「工作小管家」面板上的换肤按钮就变成
 * 一个点了没反应的装饰，而这在假 DOM 里不会报错 —— 只能靠断言当场钉住。
 */
const runtime = globalThis.window.__dshSkinRuntime;
check(Boolean(runtime?.api), "对外发布了 window.__dshSkinRuntime.api", Object.keys(runtime || {}));
check(runtime?.api?.version === 1, "接口带版本号，将来改形状能认出老调用方", runtime?.api?.version);

const bootSnapshot = runtime?.api?.get?.();
check(Array.isArray(bootSnapshot?.skins) && bootSnapshot.skins.length >= 13, "快照里带全部皮肤（含 5 套办公风）", bootSnapshot?.skins?.length);
check(Array.isArray(bootSnapshot?.wallpapers) && bootSnapshot.wallpapers.length >= 5, "快照里带全部壁纸（含 3 套纹理）", bootSnapshot?.wallpapers?.length);
check(
  bootSnapshot?.wallpapers?.filter((item) => item.kind === "css").length === 3,
  "三套纯 CSS 壁纸在自己的档位里",
  bootSnapshot?.wallpapers?.map((item) => `${item.id}:${item.kind}`)
);

// 收一份广播，验"出"的那条通道
const changedSeen = [];
const onChange = (event) => changedSeen.push(event.detail);
globalThis.window.addEventListener(plugin.SKIN_EVENT_CHANGED, onChange);

// 换皮肤：宿主的 html/body/#root 三处令牌都得跟着变
runtime?.api?.apply({ skin: "moss" });
check(documentElement.dataset.dshSkin === "moss", "外部调用后 html 上的皮肤标记已更新", documentElement.dataset.dshSkin);
check(
  String(documentElement.style.getPropertyValue("--dsw-alias-bg-base")).includes("rgba(244,248,243"),
  "外部调用后主题令牌真的换成苔痕的底色",
  documentElement.style.getPropertyValue("--dsw-alias-bg-base")
);
check(changedSeen.length >= 1, "换肤后广播了 dsh-skin:changed", changedSeen.length);
check(changedSeen[changedSeen.length - 1]?.skin === "moss", "广播里带着新皮肤 id", changedSeen[changedSeen.length - 1]?.skin);

// 脏值不许把用户选好的外观清掉
runtime?.api?.apply({ skin: "不存在的皮肤" });
check(documentElement.dataset.dshSkin === "moss", "不认识的皮肤 id 被忽略，当前皮肤保持不变", documentElement.dataset.dshSkin);
check(!(() => { try { runtime?.api?.apply(null); return false; } catch { return true; } })(), "传 null 也不抛");

// 换纹理壁纸：应该是渐变，不该拼出 url(/dsh-skin/undefined)
runtime?.api?.apply({ wallpaper: "__paper__" });
const textureValue = String(
  body.children.filter((node) => node.id === "dsh-skin-wallpaper").pop()?.style?.backgroundImage || ""
);
check(textureValue.includes("repeating-linear-gradient"), "纹理壁纸铺的是 CSS 渐变", textureValue.slice(0, 90));
check(!textureValue.includes("undefined"), "纹理壁纸没有拼出 url(...undefined)", textureValue);
check(
  body.children.filter((node) => node.id === "dsh-skin-wallpaper").length === 1,
  "换壁纸不会再生一层（切换靠改样式，不靠加节点）",
  body.children.filter((node) => node.id === "dsh-skin-wallpaper").length
);

// 换回插画壁纸：这条路径还得是 url(...)
runtime?.api?.apply({ wallpaper: "__catdog__" });
const imageValue = String(
  body.children.filter((node) => node.id === "dsh-skin-wallpaper").pop()?.style?.backgroundImage || ""
);
check(imageValue.includes('url("/dsh-skin/wallpaper-kawaii-catdog.webp")'), "插画壁纸仍然走 url(...)", imageValue.slice(0, 90));

// 事件入口（工作小管家用的就是这一条，不是 api.apply）
globalThis.window.dispatchEvent(new CustomEvent(plugin.SKIN_EVENT_APPLY, { detail: { skin: "clay" } }));
check(documentElement.dataset.dshSkin === "clay", "dsh-skin:apply 事件也能换肤", documentElement.dataset.dshSkin);
globalThis.window.removeEventListener(plugin.SKIN_EVENT_CHANGED, onChange);

// ── 9. 桌宠新逻辑（2026-11-02 借鉴 dsh-chatting-pet 之后加的） ───────────────
/**
 * 三条纯逻辑，都不依赖真实指针与真实会话：
 *   - pick 的点路径：`greet.morning` / `work.done` 这类嵌套桶必须真能取到句子
 *     （以前只认顶层键，于是问候语一直是空串 —— 这一条防的就是那种「静默失效」）；
 *   - releaseVelocity：松手太快才算甩，慢慢挪过去不算；
 *   - observeSessions：running/waiting/done 的计数与「刚完成」的判定。
 */
check(typeof plugin.pick === "function", "导出了 pick（语料取句）");
if (typeof plugin.pick === "function") {
  const greet = plugin.pick("greet.morning");
  check(typeof greet === "string" && greet.length > 0, "pick 支持点路径：greet.morning 取得到句子", greet);
  const work = plugin.pick("work.done");
  check(typeof work === "string" && work.length > 0, "pick 支持点路径：work.done 取得到句子", work);
  check(plugin.pick("没有这个桶") === "", "不存在的桶返回空串而不是抛错", plugin.pick("没有这个桶"));
}

check(typeof plugin.releaseVelocity === "function", "导出了 releaseVelocity（甩动速度估算）");
if (typeof plugin.releaseVelocity === "function") {
  const fast = plugin.releaseVelocity([{ t: 0, x: 0, y: 0 }, { t: 60, x: 300, y: 0 }]);
  check(fast && Math.abs(fast.vx - 5000) < 1, "快速横甩算出 5000px/s", fast);
  check(plugin.releaseVelocity([{ t: 0, x: 0, y: 0 }, { t: 500, x: 20, y: 0 }]) === null, "样本太旧（>140ms）不当甩");
  check(plugin.releaseVelocity([{ t: 0, x: 0, y: 0 }, { t: 200, x: 60, y: 0 }]) === null, "慢慢挪过去不算甩");
  check(plugin.releaseVelocity([{ t: 0, x: 0, y: 0 }]) === null, "只有一个样本时返回 null");
}

check(typeof plugin.observeSessions === "function", "导出了 observeSessions（会话状态联动）");
if (typeof plugin.observeSessions === "function") {
  const statuses = new Map();
  const list = { ids: ["s1"], byId: { s1: { displayTitle: "demo" } } };
  let threw = null;
  try {
    plugin.observeSessions(null, null);
    statuses.set("s1", { running: true });
    plugin.observeSessions(statuses, list);
  } catch (error) {
    threw = error;
  }
  check(threw === null, "observeSessions 对空数据不抛", String(threw));
  check(plugin.sessionCounts()?.running === 1, "一个会话在跑 → 计数 running=1", plugin.sessionCounts());

  statuses.set("s1", { completionUnread: true });
  plugin.observeSessions(statuses, list);
  check(plugin.sessionCounts()?.done === 1, "跑完未读 → 计数 done=1", plugin.sessionCounts());

  statuses.set("s1", { pendingInteraction: true });
  plugin.observeSessions(statuses, list);
  check(plugin.sessionCounts()?.waiting === 1, "等你处理 → 计数 waiting=1", plugin.sessionCounts());
}

// ── 10. 完场播报与桌面端（2026-11-02 晚加） ─────────────────────────────────
/**
 * 「跑完播报」是这次最容易被用户检验的功能：句子里的任务名 / 用时 / tokens
 * 任何一个为 undefined 都会当场穿帮。所以四个格式化函数都单独钉值。
 */
check(plugin.formatDuration(500) === "", "不足一秒不报用时（不显示 0 秒）", plugin.formatDuration(500));
check(plugin.formatDuration(42000) === "42 秒", "42 秒", plugin.formatDuration(42000));
check(plugin.formatDuration(130000) === "2 分 10 秒", "2 分 10 秒", plugin.formatDuration(130000));
check(plugin.formatDuration(120000) === "2 分", "整分钟不带秒", plugin.formatDuration(120000));
check(plugin.formatDuration(3_900_000) === "1 小时 5 分", "超过一小时按小时报", plugin.formatDuration(3_900_000));

check(plugin.formatTokens(950) === "950", "三位数 tokens 原样显示", plugin.formatTokens(950));
check(plugin.formatTokens(12_340) === "12.3K", "12.3K", plugin.formatTokens(12_340));
check(plugin.formatTokens(1_400_000) === "1.4M", "1.4M", plugin.formatTokens(1_400_000));
check(plugin.formatTokens(undefined) === "", "没有数字就不显示", plugin.formatTokens(undefined));

const usage = plugin.normalizeUsage({ inputTokens: "1200", outputTokens: 340, reasoningTokens: -5 });
check(usage?.inputTokens === 1200 && usage?.outputTokens === 340, "usage 归一化认数字字符串", usage);
check(usage?.reasoningTokens === undefined, "负数字段被丢掉", usage?.reasoningTokens);
check(plugin.usageTotal({ inputTokens: 1200, outputTokens: 340 }) === 1540, "总数 = 输入 + 输出", plugin.usageTotal({ inputTokens: 1200, outputTokens: 340 }));
check(plugin.normalizeUsage(null) === null, "空 usage 返回 null", plugin.normalizeUsage(null));

/**
 * 三套真实命名（2026-11-02 第二版，按宿主的真实契约改的）。
 *
 * 第一版只认 `inputTokens/outputTokens` 这种长名，而宿主实际给的是
 * ① 投影 `tokenUsage`：`uncachedInputTokens / cacheReadTokens / ...`
 * ② trajectory：`input / output / reasoning` 短名
 * 两边全漏 → 「跑完播报」永远没有 tokens，而且是静默的。
 */
const fromProjection = plugin.normalizeUsage({
  uncachedInputTokens: 1180,
  outputTokens: 240,
  reasoningTokens: 60,
  cacheReadTokens: 9000,
  cacheWriteTokens: 400,
});
check(fromProjection?.inputTokens === 1180, "认投影的 uncachedInputTokens", fromProjection);
check(fromProjection?.cacheReadTokens === 9000, "认投影的 cacheReadTokens", fromProjection);
check(
  plugin.usageTotal(fromProjection) === 1180 + 9000 + 400 + 240,
  "输入不含缓存时，缓存读写要单独加进总数（1180+9000+400+240）",
  plugin.usageTotal(fromProjection),
);
check(
  plugin.usageTotal(fromProjection) !== 1180 + 9000 + 400 + 240 + 60,
  "reasoning 属于输出明细，不能重复加",
  plugin.usageTotal(fromProjection) - (1180 + 9000 + 400 + 240),
);

const fromTrajectory = plugin.normalizeUsage({ input: 800, output: 120, reasoning: 30, cacheRead: 5000 });
check(fromTrajectory?.inputTokens === 800 && fromTrajectory?.outputTokens === 120, "认 trajectory 的短名 input/output", fromTrajectory);
check(fromTrajectory?.cacheReadTokens === 5000, "认 trajectory 的 cacheRead", fromTrajectory);

const fromProvider = plugin.normalizeUsage({ prompt_tokens: 9000, completion_tokens: 300 });
check(fromProvider?.inputTokens === 9000, "认 provider 的 prompt_tokens", fromProvider);
check(
  plugin.usageTotal(fromProvider) === 9300,
  "OpenAI 的 prompt_tokens 已经含缓存，不能再加 cache",
  plugin.usageTotal(fromProvider),
);

// 投影 → 播报：走通「会话投影里带 tokenUsage」这条主路（宿主对列表里每个会话都带）
if (typeof plugin.usageForSession === "function") {
  const withProjection = {
    ids: ["s10"],
    byId: { s10: { displayTitle: "导出数据" } },
    projectionsBySession: {
      s10: { values: { tokenUsage: { totals: { uncachedInputTokens: 2000, outputTokens: 500, cacheReadTokens: 3000 } } } },
    },
  };
  const found = plugin.usageForSession(withProjection, "s10");
  check(found?.inputTokens === 2000, "usageForSession 读 projections.values.tokenUsage.totals", found);
  check(plugin.usageTotal(found) === 5500, "总数 2000+3000+500", plugin.usageTotal(found));

  const bare = { ids: ["s11"], byId: { s11: {} }, projectionsBySession: { s11: { values: { tokenUsage: { outputTokens: 42 } } } } };
  check(plugin.usageForSession(bare, "s11")?.outputTokens === 42, "tokenUsage 没有 totals 时直接读它本身", plugin.usageForSession(bare, "s11"));

  const none = { ids: ["s12"], byId: { s12: {} }, projectionsBySession: { s12: { values: {} } } };
  check(plugin.usageForSession(none, "s12") === null, "投影里没有用量就返回 null（不估数）", plugin.usageForSession(none, "s12"));
}

// 端到端：带用量的会话跑完，播报里必须**真的**出现 tokens 数字
if (typeof plugin.observeSessions === "function") {
  const statuses = new Map();
  const list = {
    ids: ["s13"],
    byId: { s13: { displayTitle: "把登录面板重排一遍" } },
    projectionsBySession: {
      s13: { values: { tokenUsage: { totals: { uncachedInputTokens: 10_000, outputTokens: 2_340, cacheReadTokens: 0 } } } },
    },
  };
  statuses.set("s13", { running: true });
  plugin.observeSessions(statuses, list);
  statuses.set("s13", { completionUnread: true });
  plugin.observeSessions(statuses, list);
  const debug = plugin.debugSnapshot?.();
  check(debug?.lastSpoken?.includes("《把登录面板重排一遍》跑完了"), "端到端：播报里有任务名", debug?.lastSpoken);
  check(debug?.lastSpoken?.includes("12.3K tokens"), "端到端：播报句子里带 tokens", debug?.lastSpoken);
  check(debug?.lastUsage?.total === 12_340, "端到端：lastUsage 记下总数 12340", debug?.lastUsage?.total);
}

check(plugin.pendingLabel({ kind: "dsh-client-ui-approval" }) === "待批准", "审批类待处理 → 待批准", plugin.pendingLabel({ kind: "dsh-client-ui-approval" }));
check(plugin.pendingLabel({ kind: "ask-user-question" }) === "待回答", "提问类 → 待回答", plugin.pendingLabel({ kind: "ask-user-question" }));
check(plugin.pendingLabel({ kind: "别的东西" }) === "等你处理", "认不出来的 kind 退回中性说法", plugin.pendingLabel({ kind: "别的东西" }));

// 「本次消耗」而不是「这辈子消耗」：同一会话第二轮只报增量
if (typeof plugin.observeSessions === "function") {
  const statuses = new Map();
  const make = (total) => ({
    ids: ["s14"],
    byId: { s14: { displayTitle: "第二轮接着改" } },
    projectionsBySession: { s14: { values: { tokenUsage: { totals: { uncachedInputTokens: total, outputTokens: 0 } } } } },
  });
  // 第一轮：从 0 跑到 10K
  statuses.set("s14", { running: true });
  plugin.observeSessions(statuses, make(0));
  statuses.set("s14", { completionUnread: true });
  plugin.observeSessions(statuses, make(10_000));
  check(plugin.debugSnapshot()?.lastUsage?.total === 10_000, "第一轮报 10000", plugin.debugSnapshot()?.lastUsage?.total);
  // 第二轮：累计 10K → 18K，本次只花了 8K
  statuses.set("s14", { running: true });
  plugin.observeSessions(statuses, make(10_000));
  statuses.set("s14", { completionUnread: true });
  plugin.observeSessions(statuses, make(18_000));
  check(plugin.debugSnapshot()?.lastUsage?.total === 8_000, "第二轮只报本次增量 8000（不是累计 18000）", plugin.debugSnapshot()?.lastUsage?.total);
}

// 跑完一轮：播报里必须同时有用时和任务名（面板不再显示记录，全部靠这句话）
if (typeof plugin.observeSessions === "function") {
  const statuses = new Map();
  const list = {
    ids: ["s9"],
    byId: { s9: { displayTitle: "重构登录面板的样式与排版" } },
    // 带上用量：没有用量时播报会先等 2.5 秒再补（见下面的「用量晚到」用例）
    projectionsBySession: { s9: { values: { tokenUsage: { totals: { uncachedInputTokens: 1200, outputTokens: 300 } } } } },
  };
  statuses.set("s9", { running: true });
  plugin.observeSessions(statuses, list);
  statuses.set("s9", { completionUnread: true });
  plugin.observeSessions(statuses, list);
  const spoken = plugin.debugSnapshot()?.lastSpoken ?? "";
  check(spoken.includes("《重构登录面板的样式与排版》跑完了"), "播报里有任务名", spoken);
  // 这里不断言用时：harness 里 running→done 是同一毫秒，本来就没有时长可报
  // （时长的口径由 formatDuration 那几条断言负责）。
}

/**
 * 用量晚到：宿主广播 running=false 的那一拍，tokenUsage 投影常常还没算完。
 * 第一版当场读数 → 播报永远缺 tokens（而且是静默的）。这里钉住「等一拍再补」。
 */
if (typeof plugin.observeSessions === "function") {
  const statuses = new Map();
  const early = { ids: ["s14"], byId: { s14: { displayTitle: "晚到的用量" } }, projectionsBySession: {} };
  statuses.set("s14", { running: true });
  plugin.observeSessions(statuses, early);
  statuses.set("s14", { completionUnread: true });
  plugin.observeSessions(statuses, early);
  check(
    !String(plugin.debugSnapshot()?.lastSpoken ?? "").includes("晚到的用量"),
    "用量还没到时先不播报（不把半句话推出去）",
    plugin.debugSnapshot()?.lastSpoken,
  );

  // 模拟宿主紧接着补推了一份带用量的快照
  const late = {
    ids: ["s14"],
    byId: { s14: { displayTitle: "晚到的用量" } },
    projectionsBySession: { s14: { values: { tokenUsage: { totals: { uncachedInputTokens: 4000, outputTokens: 500 } } } } },
  };
  plugin.observeSessions(statuses, late);
  await new Promise((resolve) => setTimeout(resolve, 2900));
  check(plugin.debugSnapshot()?.lastSpoken?.includes("4.5K tokens"), "补上用量后再播报，数字正确（4.5K）", plugin.debugSnapshot()?.lastSpoken);
  check(plugin.debugSnapshot()?.lastSpoken?.includes("晚到的用量"), "补的那句里带任务名", plugin.debugSnapshot()?.lastSpoken);
}

// 桌面端状态：没问过宿主时按钮文案必须是「还没问过」，不能假装运行中
if (typeof plugin.desktopState === "function") {
  const desktop = plugin.desktopState();
  check(typeof desktop === "object" && "running" in desktop && "supported" in desktop, "桌面端状态可读", desktop);
  check(desktop.running === false, "默认不是运行中（不假装已启动）", desktop.running);
  check("test" in desktop && desktop.test === "", "桌面端状态带自检结果位（默认空）", desktop.test);
}

// ── 表面可读性：设置页后面透出对话（2026-11-02 用户截图报的） ────────────────
{
  const lift = plugin.limitSurfaceAlpha;
  check(typeof lift === "function", "导出了 limitSurfaceAlpha", typeof lift);
  check(lift("rgba(10,20,30,.88)", { factor: 0.42, floor: 0 }) === "rgba(10,20,30,0.37)", "倍率照算（老行为）", lift("rgba(10,20,30,.88)", { factor: 0.42, floor: 0 }));
  check(lift("rgba(10,20,30,.72)", { factor: 1, floor: 0.9 }) === "rgba(10,20,30,0.90)", "地板线抬到 0.90：主题自己 .72 的表面也不许透字", lift("rgba(10,20,30,.72)", { factor: 1, floor: 0.9 }));
  check(lift("rgba(10,20,30,.99)", { factor: 1, floor: 0.9 }) === "rgba(10,20,30,0.99)", "本来就够实的不动", lift("rgba(10,20,30,.99)", { factor: 1, floor: 0.9 }));
  check(lift("#ffffff", { factor: 0.5, floor: 0.9 }) === "#ffffff", "非 rgba 原样返回（不猜）", lift("#ffffff", { factor: 0.5, floor: 0.9 }));

  const tokens = plugin.tokensForAppearance(plugin.THEME_TOKENS.ocean, {});
  const alphaOf = (value) => Number(String(value).match(/,\s*([0-9.]+)\)$/)?.[1]);
  const lightL1 = alphaOf(tokens["--dsw-alias-bg-layer-1"].light);
  const lightBase = alphaOf(tokens["--dsw-alias-bg-base"].light);
  const lightSide = alphaOf(tokens["--dsw-specific-sidebar-fill"].light);
  const darkL2 = alphaOf(tokens["--dsw-alias-bg-layer-2"].dark);
  const darkBase = alphaOf(tokens["--dsw-alias-bg-base"].dark);
  check(lightL1 >= 0.86, "浅色：卡片/对话框层 ≥ .86（设置页不再透出对话）", lightL1);
  check(lightSide >= 0.88, "浅色：侧栏/设置页左侧那一列 ≥ .88", lightSide);
  check(lightBase <= 0.55, "浅色：底板压到 ≤ .55，壁纸才看得见（.78 那版只剩 17% 可见度）", lightBase);
  check(lightBase >= 0.42, "浅色：底板仍有 .42 地板，不至于糊成一张白纸", lightBase);
  check(darkL2 >= 0.88, "深色：卡片层同样抬到 ≥ .88", darkL2);
  check(darkBase <= 0.55 && darkBase >= 0.42, "深色：底板同样落在 .42~.55", darkBase);
  check(lightL1 > lightBase, "层次仍成立：浮层比底色实（不是一律一个色）", { lightL1, lightBase });
  // 底板降到 .47 之后必须有毛玻璃兜底，但模糊要分类型：纹理用 0，否则图案被抹平。
  const css = readFileSync(join(here, "..", "client.js"), "utf8");
  check(
    /\[class\*="centerCol"\][\s\S]{0,900}backdrop-filter:blur\(var\(--dsh-skin-col-blur,10px\)\)/.test(css),
    "三列底板的模糊走变量（插画 10px / 纹理 0）",
    "blur(var(--dsh-skin-col-blur"
  );
  check(css.includes("saturate(1.12)"), "毛玻璃带一点饱和补偿（不然会发灰）", "saturate");
  check(
    /--dsh-skin-col-blur", isTexture \? "0px" : "10px"/.test(css),
    "纯 CSS 纹理不做列模糊：1px 线条经不起 blur",
    "col-blur"
  );
  // 壁纸要铺满整宽：侧栏/右栏各有自己的底色，只靠背后托底会剩两条白边。
  check(
    /background-image:var\(--dsh-skin-wallpaper-paint,none\)!important/.test(css),
    "三列自己画壁纸（左右两列不再是一块白）"
  );
  check(
    /--dsh-skin-wallpaper-paint",\s*\n?\s*paintable \? `linear-gradient\(var\(--dsw-alias-bg-base\)/.test(css),
    "列上的遮罩用半透明底板令牌，和中间那列一致"
  );
  check(
    /background-attachment:fixed!important/.test(css) && /background-size:var\(--dsh-skin-col-size,cover\)!important/.test(css),
    "三列共用一张视口对齐的图（fixed + cover），不会各画各的"
  );
  check(
    /html:has\(\[role="dialog"\]\):not\(\.dsh-skin-panel-open\) body\[data-dsh-skin-wallpaper="true"\][\s\S]{0,400}background-image:none!important/.test(css),
    "宿主弹窗打开时撤掉列上的壁纸（但不包括本插件自己的面板）"
  );
  check(/documentElement\?\.classList\?\.add\?\.\("dsh-skin-panel-open"\)/.test(css), "面板挂载时会打上 dsh-skin-panel-open 标记");
  check(
    /return \(\) => document\.documentElement\?\.classList\?\.remove\?\.\("dsh-skin-panel-open"\)/.test(css),
    "面板卸载时把标记摘掉（否则关掉面板后宿主弹窗的规则会一直失效）"
  );
  check(/function wallpaperPreview|const wallpaperPreview = \(\) =>/.test(css), "面板里有实时预览");
  check(
    /"var\(--dsh-skin-wallpaper-paint,none\)"/.test(css),
    "预览用活的 CSS 变量画，亮度校准后自己更新（不用再点一次）"
  );
  // 面板结构（2026-11-05 产品评审）：缩略图 + 微调上移 + 页头压缩
  check(/\.dsh-skin-wallgrid\{display:grid/.test(css) && /\.dsh-skin-wallcard\{/.test(css), "背景库是一格一张的缩略图网格");
  check(
    /item\.css \? null : h\("img", \{\s*src: `\$\{ASSET\}\/\$\{item\.file\}`,[\s\S]{0,120}loading: "lazy"/.test(css),
    "插画缩略图用真素材且懒加载（14 张一起拉太重）"
  );
  check(
    css.indexOf('"壁纸强度"') > 0 && css.indexOf('"壁纸强度"') < css.indexOf('"背景库"'),
    "强度/模糊排在背景列表之前（原来要滚过 17 张卡）"
  );
  check(/\.dsh-skin-skingrid\{display:grid/.test(css) && /\.dsh-skin-skinrow\{display:flex/.test(css), "皮肤卡自带色条，不用只靠文字猜");
  check(
    /\.dsh-skin-hero-main\{display:flex;align-items:center/.test(css) && /\.dsh-skin-hero\{[^}]*padding:12px 20px/.test(css),
    "页头压成一行（标题 + 主题名 + 关闭）"
  );
  check(
    /--dsh-skin-panel-art", source \? layerOnly : "url\(\/dsh-skin\/panel-hero\.webp\)"/.test(css),
    "面板头图跟着当前背景走（没设背景时回落到自带头图）"
  );
  check(
    /\.dsh-skin-panel:before\{content:'';position:absolute;inset:-36px;[\s\S]{0,200}var\(--dsh-skin-panel-art,none\)/.test(css),
    "面板本体也垫一层同一个背景（柔化 + 压暗，保证卡片文字对比）"
  );
  // 自适应玻璃：不再靠猜宿主类名，而是扫真实 DOM 标自己的类。
  check(typeof plugin.syncOpaqueSurfaces === "function", "导出了自适应玻璃的扫描函数");
  // 「PUA 开关变成一块补丁」：别的插件的 .pua-composer 被 class*=composer 命中，壁纸画到按钮底下
  check(typeof plugin.syncContentAreas === "function", "导出了内容区标记函数");
  check(/const AREA_CLASS = "dsh-skin-area"/.test(css), "内容区用自己的类名标（.dsh-skin-area）");
  check(
    /if \(Number\(el\.offsetWidth\) < minWidth \|\| Number\(el\.offsetHeight\) < 24\) continue;/.test(css),
    "内容区按尺寸认定：够宽才算，60px 的包裹层（.pua-composer）不会被当成输入区"
  );
  check(
    !/body\[data-dsh-skin-wallpaper="true"\] \[class\*="composer"\]/.test(css),
    "壁纸不再按 class*=composer 子串铺（会连别的插件的小包裹层一起铺）"
  );
  check(
    /body\[data-dsh-skin-wallpaper="true"\] \.dsh-skin-area\{/.test(css),
    "输入区/消息区的壁纸改由 .dsh-skin-area 触发"
  );
  check(/\.dsh-skin-glass\{background-color:transparent!important/.test(css), "玻璃类自己带透明底 + 壁纸");
  check(/const GLASS_CLASS = "dsh-skin-glass"/.test(css), "玻璃标记用本插件自己的类名（不依赖宿主哈希）");
  check(
    /el\.closest\?\.\("#dsh-skin-pet-root,\.dsh-skin-panel,\.dsh-skin-stage,\.dsh-pet-menu,\[role='dialog'\]"\)/.test(css),
    "扫描时跳过本插件界面与弹窗（不能用 [class*=dsh-skin]，否则会把自己刚标的摘掉）"
  );
  check(/if \(el\.querySelector\?\.\("pre,code"\)\) continue;/.test(css), "含代码的表面不上玻璃（代码底下必须实底）");
  // 别的插件可以整块退出换肤（2026-11-05：工作小管家的面板跟着壁纸变色了）
  check(
    /const OPT_OUT_SELECTOR = '\[data-dsh-skin="off"\]'/.test(css) && /if \(el\.closest\?\.\(OPT_OUT_SELECTOR\)\) continue;/.test(css),
    "写了 data-dsh-skin=\"off\" 的容器跳过玻璃扫描"
  );
  check(
    /function captureHostTokens\(\)/.test(css) && /HOST_TOKENS\.values\[name\] = value/.test(css),
    "改色之前先记一份宿主原始令牌"
  );
  check(
    /--dsh-skin-wallpaper-paint:none!important;--dsh-skin-read-veil:none!important/.test(css),
    "退出口里把宿主令牌还原，并且不许再画壁纸"
  );
  check(/function recaptureHostTokens\(\)/.test(css), "宿主换深浅色时重新抓一份（否则退出口那份快照会滞后）");
  check(/wasGlass \? el\.dataset\.dshSkinGlassBase \|\| ""/.test(css), "已标过的元素用记下的原色判断，避免每轮摘了又标");
  check(/colorAlpha/.test(css) && plugin.colorAlpha("rgba(0,0,0,.4)") === 0.4, "能读出背景色 alpha", plugin.colorAlpha("rgba(0,0,0,.4)"));
  check(plugin.colorAlpha("rgb(255,255,255)") === 1 && plugin.colorAlpha("transparent") === 0, "rgb/transparent 的 alpha 也对");

  // 文字可读性：遮罩厚度按「壁纸有多亮」自适应 —— 亮图遮厚、暗图遮薄。
  check(plugin.withAlpha("rgba(238,247,255,0.44)", 0.62) === "rgba(238,247,255,0.620)", "只换 alpha 不动颜色");
  check(plugin.withAlpha("rgb(1,2,3)", 0.5) === "rgba(1,2,3,0.500)", "rgb 也能补出 alpha");
  const lumaCache = plugin.wallpaperLumaCache;
  const probe = { kind: "image", image: "/dsh-skin/probe-luma.webp" };
  check(plugin.wallpaperVeilAlpha(probe) === 0.56, "没量过先用中性遮罩", plugin.wallpaperVeilAlpha(probe));
  lumaCache.set(probe.image, 0.1);
  check(plugin.wallpaperVeilAlpha(probe) === 0.5, "暗壁纸用薄遮罩（多露出图）", plugin.wallpaperVeilAlpha(probe));
  lumaCache.set(probe.image, 0.9);
  check(plugin.wallpaperVeilAlpha(probe) === 0.62, "亮壁纸用厚遮罩（保证字看得清）", plugin.wallpaperVeilAlpha(probe));
  check(typeof plugin.measureWallpaperLuma === "function", "导出了亮度测量（canvas 缩图取均值）");

  // ── 鼠标光标（2026-11-05）────────────────────────────────────────────────
  check(Array.isArray(plugin.CURSOR_THEMES) && plugin.CURSOR_THEMES.length === 6, "六套光标主题都在表里", plugin.CURSOR_THEMES?.length);
  check(plugin.defaultState().cursorTheme === "off", "光标默认关闭（用系统指针）", plugin.defaultState().cursorTheme);
  check(plugin.cursorThemeId() === "off", "当前没有启用任何光标主题", plugin.cursorThemeId());
  check(plugin.cursorCssFor("off") === "", "关掉时返回空 CSS（不残留规则）");
  check(plugin.cursorCssFor("不存在的主题") === "", "认不出的主题也不生成规则");

  const cookieCss = plugin.cursorCssFor("cookie");
  check(/url\("\/dsh-skin\/cursor-cookie-arrow-32\.png"\) 3 3, default/.test(cookieCss), "默认箭头指到对应素材、热区在尖端", cookieCss.slice(0, 120));
  check(/cursor-cookie-hand-32\.png"\) 9 3, pointer!important/.test(cookieCss), "交互元素换成手型且带 !important");
  check(/cursor-cookie-text-32\.png"\) 16 16, text!important/.test(cookieCss), "输入框换成 I 型");
  check(/cursor-cookie-na-32\.png"\) 16 16, not-allowed!important/.test(cookieCss), "禁用态换成不可用");
  check(cookieCss.includes("progress"), "忙碌态有 progress 兜底");
  // 斜角缩放（2026-11-06 用户：光标没做斜角缩放）
  check(/cursor-cookie-nwse-32\.png"\) 16 16, nwse-resize!important/.test(cookieCss), "斜角 ↘：左上↔右下，热区在正中");
  check(/cursor-cookie-nesw-32\.png"\) 16 16, nesw-resize!important/.test(cookieCss), "斜角 ↗：右上↔左下，热区在正中");
  // 2026-11-06：光标规则里**一个类名子串都不许出现**（公众号工作台根节点叫
  // gzs-root--split，被 [class*="split"] 铺成了整块「左右拖动」）。
  // 断言前先去掉注释——注释里会提到"以前是 [class*=...]"，那是说明不是规则。
  const cursorRules = cookieCss.replace(/\/\*[\s\S]*?\*\//g, "");
  check(
    !/\[class\*="/.test(cursorRules),
    "光标规则不按类名子串下判断（只认元素自己的 cursor 与 data-dsh-skin-axis）"
  );
  check(
    /html\[data-dsh-skin-cursor="cookie"\] \[data-dsh-skin-axis="x"\]\{cursor:/.test(cursorRules) &&
      /html\[data-dsh-skin-cursor="cookie"\] \[data-dsh-skin-axis="y"\]/.test(cursorRules),
    "左右 / 上下都靠 data-dsh-skin-axis 触发"
  );
  check(
    /if \(scope\) html\.removeAttribute\("data-dsh-skin-cursor"\);/.test(css) &&
      /if \(scope\) html\.setAttribute\("data-dsh-skin-cursor", scope\);/.test(css),
    "扫描期间先摘掉主题标记，读页面原本的 cursor（否则读到的是我们自己覆盖后的）"
  );
  check(typeof plugin.syncResizeCursors === "function", "导出了「可缩放/可拖角」的标记函数");
  check(
    /else if \(cursor\.includes\("nwse-resize"\)\) axis = "nwse";/.test(css),
    "自己画把手的浮窗（computed cursor: nwse-resize、resize 为 none）也能认出来"
  );
  check(
    /const root = document\.body \|\| document\.getElementById\("root"\);/.test(css),
    "光标扫描扫整个 body（浮窗可能挂在 body 而不是 #root）"
  );
  // 「点会话记录看到十字准星」：draggable 的列表行不该被当成拖拽把手（2026-11-06）
  check(
    !/\$\{scope\} \[draggable="true"\]/.test(css),
    "不再把 [draggable=true] 一律当四向移动（会话行、工作区行也带 draggable）"
  );
  check(
    /else if \(\/move\|grab\|all-scroll\/\.test\(cursor\)\) axis = "move";/.test(css),
    "四向移动改成看元素自己声明的 cursor（move/grab）"
  );
  check(
    /else if \(cursor\.includes\("pointer"\)\) axis = "hand";/.test(css) &&
      /\$\{scope\} \[data-dsh-skin-axis="hand"\]\{cursor:\$\{rule\("hand", "pointer"\)\}/.test(css),
    "自己声明 pointer 的行改用主题手型（不退回系统指针）"
  );
  check(
    !/[^a-z-]\[role="separator"\], \$\{scope\} \[class\*="split"\]/.test(css),
    "不再用 [role=separator] 兜底成左右拖动（会抢走斜角把手）"
  );
  check(
    /if \(\/\^\(INPUT\|TEXTAREA\)\$\/\.test\(el\.tagName\)\) continue;/.test(css),
    "标记双向缩放时跳过文本框（右下角把手不能把整块变成斜角箭头）"
  );
  check(
    Object.keys(plugin.CURSOR_HOTSPOT).length === 11 && plugin.CURSOR_HOTSPOT.arrow[0] === 3,
    "热区表齐全（11 态），箭头在 (3,3)",
    plugin.CURSOR_HOTSPOT
  );
}

// 重启后自动回到桌面：默认开，但用户收回之后不能再自己冒出来（见 desktopToggle 的说明）
if (typeof plugin.defaultState === "function") {
  check(plugin.defaultState().petDesktopAuto === false, "桌面桌宠已下线，默认禁止自动启动", plugin.defaultState().petDesktopAuto);
  check(plugin.defaultState().petWork === true && plugin.defaultState().petEnabled === true, "联动与桌宠默认都是开的", {
    work: plugin.defaultState().petWork,
    enabled: plugin.defaultState().petEnabled,
  });
  check(typeof plugin.desktopAuto === "function" && plugin.desktopAuto() === false, "运行期桌面自动启动始终关闭", plugin.desktopAuto?.());
}

// 自动保存契约：所有原预览入口均入防抖保存，关闭不回滚。
{
  const source = readFileSync(join(here, "..", "client.js"), "utf8");
  check(/function preview\(\)[\s\S]*?setTimeout\(flushAutoSave, 250\)/.test(source), "即时预览会在 250ms 后自动保存");
  check(/const closePanel = \(\) => \{\s*flushAutoSave\(\)/.test(source), "关闭面板立即补存，不回滚");
  check(!source.includes("cancelDraft") && !source.includes("committedState"), "移除草稿回滚状态");
  check(!source.includes('"联动："') && !source.includes('"应用设置"'), "移除联动卡及应用按钮");
  check(source.includes('"完成"') && source.includes('保存失败：浏览器存储不可用'), "完成按钮与保存失败提示齐备");
  check(source.includes('addEventListener?.("pagehide"'), "离开页面前补存修改");
}

// ── 收尾 ────────────────────────────────────────────────────────────────────
console.error = realError;
console.log(`${failed === 0 ? "✓" : "✗"} client-harness：${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
