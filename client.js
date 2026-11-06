window.__ModuleLoader__.load({
  id: "dsh-plugin-skin",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const h = React.createElement;
    // 宿主是真 React 时用于让外部设置变更即时反映到面板；冒烟测试没有 hooks，走降级桩。
    const useState = typeof React.useState === "function" ? React.useState : () => [0, () => {}];

    /** 素材前缀。宿主侧 index.js 把 assets/ 挂在这个前缀下。 */
    const ASSET = "/dsh-skin";

    /** 三个页签的说明文字：同一块 note 位置，换页换话，省一屏高度。 */
    const EMPTY_SESSION_LIST = Object.freeze({ ids: [], byId: {}, projectionsBySession: {} });
    const EMPTY_STATUSES = new Map();
    function noteForTab(tab) {
      if (tab === "wallpaper") return "插画走 /dsh-skin/ 素材路由，纹理是纯 CSS 拼的（没有素材文件）· 聊天区会保留半透明表面以保证可读";
      if (tab === "pet") return "桌宠是本插件自己画的：九种角色 + 专属互动，素材全在本地 · 右键她有小菜单";
      return `这里的主题会作用于 DSH 的聊天区、侧栏、输入区、消息和代码块 · 已覆盖 ${THEME_TOKEN_NAMES.length} 个颜色角色 · 设置只存在这台浏览器`;
    }
    const KEY = "dsh-skin:appearance";
    const DEFAULTS = {
      skin: "ocean",
      // 默认壁纸用 gpt-image-2 生成的「猫猫狗狗」。原默认「黄昏彩虹」属本地同人图，
      // 无公开再分发许可，2026-11-06 已从包内移除（见 README 素材小节）。
      wallpaper: "__catdog__",
      opacity: 0.78,
      blur: 0,
      fit: "cover",
      petEnabled: true,
      // 只保留星辉少女一套素材。旧的蓝紫「经典少女」按反馈下线（2026-11-02）。
      // 糯糯是新安装的推荐角色；旧配置中的有效角色仍会被保留。
      petSkin: "nuonuo",
      // 比第一版 132px 稍大一点；面板里仍可用滑块自由调整。
      petSize: 150,
      petX: null,
      // 自定义壁纸只保存在本地浏览器，不上传到服务器。
      wallpaperData: "",
      customColors: {},
      petY: null,
      petName: "",
      petBubble: true,
      petRest: true,
      /**
       * 打开 DSH 时自动把她放到桌面。**默认开**。
       *
       * 桌面那只如果是从宿主起的（走 subprocess 服务），宿主一重启她就跟着没了 ——
       * 这不是 bug，是 job 生命周期的必然。手动再点一次按钮很烦，所以页面装配时
       * 自动补一次。用户点「收回桌面」会把这个开关关掉，免得她跟自己较劲。
       */
      petDesktopAuto: false,
      /** 已经「见过」的关闭标记时间戳：见过就不再自动拉起（见 autoDesktop）。 */
      petClosedAck: 0,
      petMetAt: 0,
      petDay: "",
      petTodayPokes: 0,
      /**
       * 跟随工作状态（借 dsh-chatting-pet 的思路）。**默认开**。
       *
       * 开着她会跟着会话状态变形态：有任务在跑就切专注形态沉默陪着，跑完冒一句，
       * 有东西等你处理（审批/选择）就鼓脸提醒。宿主没下发会话状态时这条自然失效。
       */
      petWork: true,
      /**
       * 安静时段。**默认开**，23:00 - 08:00。
       *
       * 到点就不主动开口：闲时独白、久坐提醒、见面问候都收起来；
       * 但「任务跑完了」「有东西等你处理」照报 —— 那两件是用户要的信息，不是热闹。
       * 点她、摸她是你自己动手的，也照常理你。
       */
      /** 光标主题：off = 系统默认。只影响本页面的指针。 */
      cursorTheme: "off",
      petQuiet: true,
      petQuietFrom: 23,
      petQuietTo: 8,
    };
    const SKINS = [
      { id: "ocean", label: "深海幻境", note: "冷蓝 · 粉紫高光", accent: "#8ad9ff", bg: "#081b33", panel: "linear-gradient(145deg,#081c37,#142b4b)", tint: "rgba(8,27,51,.20)", swatches: ["#102c50", "#2d658d", "#8ad9ff", "#d9a7ff", "#f4f8ff"] },
      { id: "lavender", label: "薰衣草雾", note: "柔和 · 蓝紫层次", accent: "#d7b9ff", bg: "#211a38", panel: "linear-gradient(145deg,#201a3d,#352650)", tint: "rgba(65,42,104,.22)", swatches: ["#302253", "#5d477f", "#d7b9ff", "#ffb9d2", "#faf5ff"] }, 
      { id: "mint", label: "薄荷玻璃", note: "清透 · 青绿高光", accent: "#8ff3d0", bg: "#092821", panel: "linear-gradient(145deg,#092d2a,#16453e)", tint: "rgba(12,91,74,.20)", swatches: ["#103b38", "#247468", "#8ff3d0", "#b4d7ff", "#f1fffb"] },
      { id: "sunset", label: "晚霞莓果", note: "暖粉 · 橙金点亮", accent: "#ff9db9", bg: "#321326", panel: "linear-gradient(145deg,#36142c,#5a2340)", tint: "rgba(137,36,75,.20)", swatches: ["#481936", "#87304f", "#ff9db9", "#ffc98f", "#fff5f1"] },
      { id: "aurora", label: "极光森林", note: "青绿 · 蓝紫渐变", accent: "#8de8c8", bg: "#102d35", panel: "linear-gradient(145deg,#102d35,#26345d)", tint: "rgba(19,83,85,.20)", swatches: ["#123c43", "#287d78", "#8de8c8", "#a9b9ff", "#effff8"] },
      { id: "sakura", label: "樱花奶雾", note: "奶白 · 樱粉 · 蜜桃", accent: "#ff9fba", bg: "#3a2031", panel: "linear-gradient(145deg,#3a2031,#60405c)", tint: "rgba(139,62,96,.18)", swatches: ["#552b43", "#a75578", "#ff9fba", "#ffd0aa", "#fff8f6"] },
      { id: "amber", label: "琥珀书房", note: "暖金 · 棕黑 · 米白", accent: "#f5c46e", bg: "#332718", panel: "linear-gradient(145deg,#332718,#5a3d24)", tint: "rgba(117,70,28,.18)", swatches: ["#4b321c", "#936431", "#f5c46e", "#d5a6ff", "#fff8e9"] },
      { id: "graphite", label: "石墨灰", note: "中性灰 · 长开不累", accent: "#a8c2d4", bg: "#1b1f24", panel: "linear-gradient(145deg,#1c2026,#2c333b)", tint: "rgba(28,34,40,.20)", swatches: ["#2a2f36", "#525c66", "#a8c2d4", "#c9b9a0", "#f3f6f8"] },
      { id: "sand", label: "米沙纸", note: "暖米调 · 像在纸上写字", accent: "#e6c68f", bg: "#2a241c", panel: "linear-gradient(145deg,#2a241c,#463a2b)", tint: "rgba(120,92,54,.18)", swatches: ["#3b3227", "#6f6049", "#e6c68f", "#b9b0e0", "#fffaf1"] },
      { id: "moss", label: "苔痕", note: "苔绿低饱和 · 眼睛不紧绷", accent: "#9ed3ae", bg: "#1a241e", panel: "linear-gradient(145deg,#1a241e,#2c3b31)", tint: "rgba(40,74,52,.18)", swatches: ["#24332a", "#41604c", "#9ed3ae", "#aebde6", "#f2faf4"] },
      { id: "mist", label: "雾青", note: "冷灰蓝 · 像阴天的窗", accent: "#97cbe4", bg: "#131b21", panel: "linear-gradient(145deg,#131b21,#22303a)", tint: "rgba(28,60,80,.18)", swatches: ["#1b252c", "#375565", "#97cbe4", "#aab8e4", "#f0f7fc"] },
      { id: "clay", label: "陶土", note: "暖陶色 · 屏幕偏黄时最舒服", accent: "#e5b6a0", bg: "#241c19", panel: "linear-gradient(145deg,#241c19,#3c2e28)", tint: "rgba(110,60,40,.18)", swatches: ["#31251f", "#5d453b", "#e5b6a0", "#bcb4e4", "#fdf3ed"] },
      { id: "custom", label: "自定义色表盘", note: "自己调主色与界面层次", accent: "#b8a5ff", bg: "#1d1930", panel: "linear-gradient(145deg,#211b3a,#3c315d)", tint: "rgba(75,52,125,.20)", swatches: ["#271f46", "#4f3b78", "#b8a5ff", "#8de8d2", "#fbf8ff"] },
    ];

    /**
     * 桌宠皮肤：界面主题与角色皮肤分开，换界面颜色不会误换角色。
     *
     * 只剩一套了 —— 「经典少女」那套蓝紫素材不好看，2026-11-02 连图带条目一起删掉。
     * 表还留着是因为面板与 petAsset() 都按「表里第一套」兜底：将来再出第二套，
     * 往这里加一行、`桌宠皮肤` 下拉会自动出现（只有一套时那一行不渲染）。
     */
    const PET_SKINS = [
      { id: "nuonuo", label: "糯糯", note: "奶油团子 · 粉颊芽发 · 推荐", prefix: "pet-nuonuo", scale: 1.04, personality: "soft" },
      { id: "osmanthus-rabbit", label: "桂花月兔", note: "月兔与桂花 · 工作小管家同款气质", prefix: "pet-osmanthus-rabbit", scale: 1.08, personality: "lunar" },
      { id: "ink-raven", label: "墨刃黑鸦", note: "墨色利落 · 工作小管家同款气质", prefix: "pet-ink-raven", scale: 0.96, personality: "sharp" },
      { id: "wanwan", label: "晚晚", note: "薰衣草灰 · 睡衣与黑猫", prefix: "pet-wanwan", scale: 1, personality: "sleepy" },
      { id: "renzai", label: "刃仔", note: "连帽少年 · 无人机工具组", prefix: "pet-renzai", scale: 0.98, personality: "focused" },
      { id: "aowu", label: "嗷呜", note: "黑白肚皮 · 圆滚滚小龙", prefix: "pet-aowu", scale: 1.12, personality: "dragon" },
      { id: "xiu", label: "岫", note: "月白宽袍 · 青绦 · 云鹤相伴", prefix: "pet-xiu", scale: 1.02, personality: "immortal" },
      { id: "bo", label: "薄老师", note: "月白长衫 · 金丝眼镜 · 茶杯", prefix: "pet-bo", scale: 1, personality: "tea" },
      { id: "starlight", label: "星辉少女", note: "清透高亮 · 经典保留", prefix: "pet-starlight", scale: 1, personality: "starlight" },
    ];

    /**
     * DSH 全局主题令牌。
     *
     * 这里不是插件设置卡片的配色，而是 DSH 原生聊天区、侧栏、输入框、菜单、
     * 消息、代码块都会读取的设计令牌。每个令牌必须同时有 light / dark，
     * 否则切换 DSH 明暗模式后很容易出现「背景换了、文字消失」的问题。
     * 透明表面是有意的：它让用户上传的壁纸能够透到整个 DSH 内容层。
     */
    const THEME_ROLES = {
      ocean: {
        light: {
          "--dsw-alias-bg-base": "rgba(238,247,255,.88)",
          "--dsw-alias-bg-layer-1": "rgba(247,251,255,.82)",
          "--dsw-alias-bg-layer-2": "rgba(225,240,252,.78)",
          "--dsw-alias-bg-layer-3": "rgba(204,228,246,.72)",
          "--dsw-alias-bg-overlay": "rgba(8,25,48,.16)",
          "--dsw-alias-label-primary": "#16283d",
          "--dsw-alias-label-secondary": "#42617d",
          "--dsw-alias-label-tertiary": "#6b89a2",
          "--dsw-alias-label-disabled": "#9ab0c2",
          "--dsw-alias-border-l1": "rgba(71,126,166,.30)",
          "--dsw-alias-border-l2": "rgba(71,126,166,.22)",
          "--dsw-alias-border-l3": "rgba(71,126,166,.16)",
          "--dsw-alias-border-l4": "rgba(71,126,166,.38)",
          "--dsw-alias-brand-primary": "#287cae",
          "--dsw-alias-state-business-primary": "#6d54c8",
          "--dsw-alias-state-error-primary": "#c84d6d",
          "--dsw-alias-state-idle-primary": "#6e8297",
          "--dsw-alias-state-success-primary": "#168d76",
          "--dsw-alias-state-warn-primary": "#c47728",
          "--dsw-specific-sidebar-fill": "rgba(218,236,249,.84)",
          "--dsl-code-block-background": "rgba(220,235,247,.88)",
          "--shiki-foreground": "#23374c",
          "--shiki-token-keyword": "#7654c5",
          "--shiki-token-string": "#087d6b",
          "--shiki-token-comment": "#6c879d",
          "--shiki-token-function": "#236fa0",
          "--shiki-token-number": "#bd6330",
        },
        dark: {
          "--dsw-alias-bg-base": "rgba(8,22,42,.86)",
          "--dsw-alias-bg-layer-1": "rgba(13,32,57,.84)",
          "--dsw-alias-bg-layer-2": "rgba(20,47,77,.80)",
          "--dsw-alias-bg-layer-3": "rgba(31,67,101,.74)",
          "--dsw-alias-bg-overlay": "rgba(4,13,27,.36)",
          "--dsw-alias-label-primary": "#eef7ff",
          "--dsw-alias-label-secondary": "#b7d1e8",
          "--dsw-alias-label-tertiary": "#83a4c0",
          "--dsw-alias-label-disabled": "#5d748b",
          "--dsw-alias-border-l1": "rgba(137,205,246,.34)",
          "--dsw-alias-border-l2": "rgba(137,205,246,.22)",
          "--dsw-alias-border-l3": "rgba(137,205,246,.14)",
          "--dsw-alias-border-l4": "rgba(137,205,246,.46)",
          "--dsw-alias-brand-primary": "#8ad9ff",
          "--dsw-alias-state-business-primary": "#d4b6ff",
          "--dsw-alias-state-error-primary": "#ff91a8",
          "--dsw-alias-state-idle-primary": "#90a9bd",
          "--dsw-alias-state-success-primary": "#77e4c6",
          "--dsw-alias-state-warn-primary": "#ffc078",
          "--dsw-specific-sidebar-fill": "rgba(10,31,55,.84)",
          "--dsl-code-block-background": "rgba(10,25,45,.88)",
          "--shiki-foreground": "#e4f1ff",
          "--shiki-token-keyword": "#d4b6ff",
          "--shiki-token-string": "#8ff3d0",
          "--shiki-token-comment": "#82a4bd",
          "--shiki-token-function": "#8ad9ff",
          "--shiki-token-number": "#ffb47d",
        },
      },
      lavender: {
        light: {
          "--dsw-alias-bg-base": "rgba(250,247,255,.88)", "--dsw-alias-bg-layer-1": "rgba(255,252,255,.84)", "--dsw-alias-bg-layer-2": "rgba(240,232,252,.80)", "--dsw-alias-bg-layer-3": "rgba(225,210,242,.72)", "--dsw-alias-bg-overlay": "rgba(46,28,73,.14)",
          "--dsw-alias-label-primary": "#2c213e", "--dsw-alias-label-secondary": "#69557d", "--dsw-alias-label-tertiary": "#927da6", "--dsw-alias-label-disabled": "#b7a7c5",
          "--dsw-alias-border-l1": "rgba(121,83,159,.30)", "--dsw-alias-border-l2": "rgba(121,83,159,.22)", "--dsw-alias-border-l3": "rgba(121,83,159,.15)", "--dsw-alias-border-l4": "rgba(121,83,159,.40)",
          "--dsw-alias-brand-primary": "#8254b8", "--dsw-alias-state-business-primary": "#bf5f9a", "--dsw-alias-state-error-primary": "#c55476", "--dsw-alias-state-idle-primary": "#857492", "--dsw-alias-state-success-primary": "#378b78", "--dsw-alias-state-warn-primary": "#bd792f", "--dsw-specific-sidebar-fill": "rgba(239,229,249,.86)", "--dsl-code-block-background": "rgba(235,224,248,.90)",
          "--shiki-foreground": "#39284d", "--shiki-token-keyword": "#8755b8", "--shiki-token-string": "#21836c", "--shiki-token-comment": "#907ba4", "--shiki-token-function": "#b85a87", "--shiki-token-number": "#b6632d",
        },
        dark: {
          "--dsw-alias-bg-base": "rgba(28,20,48,.87)", "--dsw-alias-bg-layer-1": "rgba(43,30,67,.84)", "--dsw-alias-bg-layer-2": "rgba(65,43,91,.80)", "--dsw-alias-bg-layer-3": "rgba(91,61,119,.74)", "--dsw-alias-bg-overlay": "rgba(21,10,34,.38)",
          "--dsw-alias-label-primary": "#fff6ff", "--dsw-alias-label-secondary": "#e0caec", "--dsw-alias-label-tertiary": "#b698c9", "--dsw-alias-label-disabled": "#806a91",
          "--dsw-alias-border-l1": "rgba(218,181,255,.34)", "--dsw-alias-border-l2": "rgba(218,181,255,.23)", "--dsw-alias-border-l3": "rgba(218,181,255,.14)", "--dsw-alias-border-l4": "rgba(218,181,255,.46)",
          "--dsw-alias-brand-primary": "#d7b9ff", "--dsw-alias-state-business-primary": "#ffb9d2", "--dsw-alias-state-error-primary": "#ff9fb9", "--dsw-alias-state-idle-primary": "#b89dc8", "--dsw-alias-state-success-primary": "#8ee3c2", "--dsw-alias-state-warn-primary": "#ffca83", "--dsw-specific-sidebar-fill": "rgba(38,25,60,.86)", "--dsl-code-block-background": "rgba(28,18,45,.90)",
          "--shiki-foreground": "#f5eaff", "--shiki-token-keyword": "#d7b9ff", "--shiki-token-string": "#9aefd2", "--shiki-token-comment": "#b298c6", "--shiki-token-function": "#ffb9d2", "--shiki-token-number": "#ffc98f",
        },
      },
      mint: {
        light: {
          "--dsw-alias-bg-base": "rgba(241,255,250,.88)", "--dsw-alias-bg-layer-1": "rgba(250,255,253,.84)", "--dsw-alias-bg-layer-2": "rgba(222,247,239,.80)", "--dsw-alias-bg-layer-3": "rgba(195,235,224,.72)", "--dsw-alias-bg-overlay": "rgba(8,61,52,.13)",
          "--dsw-alias-label-primary": "#163831", "--dsw-alias-label-secondary": "#477168", "--dsw-alias-label-tertiary": "#71978e", "--dsw-alias-label-disabled": "#a2bbb4",
          "--dsw-alias-border-l1": "rgba(44,133,112,.28)", "--dsw-alias-border-l2": "rgba(44,133,112,.20)", "--dsw-alias-border-l3": "rgba(44,133,112,.14)", "--dsw-alias-border-l4": "rgba(44,133,112,.38)",
          "--dsw-alias-brand-primary": "#168b75", "--dsw-alias-state-business-primary": "#5474c7", "--dsw-alias-state-error-primary": "#c24f6e", "--dsw-alias-state-idle-primary": "#67867e", "--dsw-alias-state-success-primary": "#128d6f", "--dsw-alias-state-warn-primary": "#b47b25", "--dsw-specific-sidebar-fill": "rgba(218,247,238,.86)", "--dsl-code-block-background": "rgba(215,242,234,.90)",
          "--shiki-foreground": "#193c35", "--shiki-token-keyword": "#526fc0", "--shiki-token-string": "#087e67", "--shiki-token-comment": "#6a9389", "--shiki-token-function": "#128b75", "--shiki-token-number": "#b15d28",
        },
        dark: {
          "--dsw-alias-bg-base": "rgba(7,31,28,.87)", "--dsw-alias-bg-layer-1": "rgba(12,51,45,.84)", "--dsw-alias-bg-layer-2": "rgba(19,78,67,.80)", "--dsw-alias-bg-layer-3": "rgba(29,109,91,.72)", "--dsw-alias-bg-overlay": "rgba(3,20,17,.38)",
          "--dsw-alias-label-primary": "#edfff9", "--dsw-alias-label-secondary": "#b5e4d6", "--dsw-alias-label-tertiary": "#82b9aa", "--dsw-alias-label-disabled": "#5a867c",
          "--dsw-alias-border-l1": "rgba(143,243,208,.34)", "--dsw-alias-border-l2": "rgba(143,243,208,.22)", "--dsw-alias-border-l3": "rgba(143,243,208,.14)", "--dsw-alias-border-l4": "rgba(143,243,208,.45)",
          "--dsw-alias-brand-primary": "#8ff3d0", "--dsw-alias-state-business-primary": "#b4c7ff", "--dsw-alias-state-error-primary": "#ff9aaf", "--dsw-alias-state-idle-primary": "#91b5aa", "--dsw-alias-state-success-primary": "#8ff3d0", "--dsw-alias-state-warn-primary": "#ffd083", "--dsw-specific-sidebar-fill": "rgba(8,42,37,.86)", "--dsl-code-block-background": "rgba(7,30,27,.90)",
          "--shiki-foreground": "#e4fff7", "--shiki-token-keyword": "#b4c7ff", "--shiki-token-string": "#8ff3d0", "--shiki-token-comment": "#82b6a9", "--shiki-token-function": "#9be8d2", "--shiki-token-number": "#ffd18e",
        },
      },
      sunset: {
        light: {
          "--dsw-alias-bg-base": "rgba(255,248,246,.88)", "--dsw-alias-bg-layer-1": "rgba(255,253,250,.84)", "--dsw-alias-bg-layer-2": "rgba(253,230,226,.80)", "--dsw-alias-bg-layer-3": "rgba(247,205,211,.72)", "--dsw-alias-bg-overlay": "rgba(92,24,51,.13)",
          "--dsw-alias-label-primary": "#432331", "--dsw-alias-label-secondary": "#805767", "--dsw-alias-label-tertiary": "#aa7c8a", "--dsw-alias-label-disabled": "#c8a7af",
          "--dsw-alias-border-l1": "rgba(166,73,101,.28)", "--dsw-alias-border-l2": "rgba(166,73,101,.20)", "--dsw-alias-border-l3": "rgba(166,73,101,.14)", "--dsw-alias-border-l4": "rgba(166,73,101,.38)",
          "--dsw-alias-brand-primary": "#bd4c75", "--dsw-alias-state-business-primary": "#a35cc2", "--dsw-alias-state-error-primary": "#c44759", "--dsw-alias-state-idle-primary": "#9a7180", "--dsw-alias-state-success-primary": "#2d9271", "--dsw-alias-state-warn-primary": "#bf7629", "--dsw-specific-sidebar-fill": "rgba(252,225,226,.86)", "--dsl-code-block-background": "rgba(249,222,224,.90)",
          "--shiki-foreground": "#4b2936", "--shiki-token-keyword": "#9e51b9", "--shiki-token-string": "#16866e", "--shiki-token-comment": "#a47a87", "--shiki-token-function": "#b94670", "--shiki-token-number": "#b6652d",
        },
        dark: {
          "--dsw-alias-bg-base": "rgba(50,17,38,.87)", "--dsw-alias-bg-layer-1": "rgba(75,24,51,.84)", "--dsw-alias-bg-layer-2": "rgba(112,36,67,.80)", "--dsw-alias-bg-layer-3": "rgba(145,51,83,.72)", "--dsw-alias-bg-overlay": "rgba(28,7,21,.40)",
          "--dsw-alias-label-primary": "#fff1f4", "--dsw-alias-label-secondary": "#f0c4d0", "--dsw-alias-label-tertiary": "#c992a4", "--dsw-alias-label-disabled": "#8d5d6f",
          "--dsw-alias-border-l1": "rgba(255,157,185,.36)", "--dsw-alias-border-l2": "rgba(255,157,185,.23)", "--dsw-alias-border-l3": "rgba(255,157,185,.14)", "--dsw-alias-border-l4": "rgba(255,157,185,.48)",
          "--dsw-alias-brand-primary": "#ff9db9", "--dsw-alias-state-business-primary": "#e1b3ff", "--dsw-alias-state-error-primary": "#ff9ca7", "--dsw-alias-state-idle-primary": "#c49aaa", "--dsw-alias-state-success-primary": "#8ee2be", "--dsw-alias-state-warn-primary": "#ffd08b", "--dsw-specific-sidebar-fill": "rgba(62,18,43,.86)", "--dsl-code-block-background": "rgba(45,12,32,.90)",
          "--shiki-foreground": "#fff0f4", "--shiki-token-keyword": "#e1b3ff", "--shiki-token-string": "#9aefd0", "--shiki-token-comment": "#c492a4", "--shiki-token-function": "#ffadc4", "--shiki-token-number": "#ffd08b",
        },
      },
    };

    // 新增预设复用成熟的 token 结构，只调整关键角色，避免每套主题漏掉某个状态色。
    THEME_ROLES.aurora = {
      light: { ...THEME_ROLES.mint.light, "--dsw-alias-bg-base": "rgba(239,255,252,.88)", "--dsw-alias-bg-layer-2": "rgba(220,242,246,.80)", "--dsw-alias-brand-primary": "#347fca", "--dsw-specific-sidebar-fill": "rgba(218,246,242,.86)" },
      dark: { ...THEME_ROLES.mint.dark, "--dsw-alias-bg-base": "rgba(9,29,42,.87)", "--dsw-alias-bg-layer-2": "rgba(26,65,81,.80)", "--dsw-alias-brand-primary": "#8de8c8", "--dsw-specific-sidebar-fill": "rgba(11,45,51,.86)" },
    };
    THEME_ROLES.sakura = {
      light: { ...THEME_ROLES.sunset.light, "--dsw-alias-bg-base": "rgba(255,249,250,.89)", "--dsw-alias-bg-layer-2": "rgba(251,226,235,.80)", "--dsw-alias-brand-primary": "#c85d86", "--dsw-specific-sidebar-fill": "rgba(252,226,235,.86)" },
      dark: { ...THEME_ROLES.sunset.dark, "--dsw-alias-bg-base": "rgba(50,20,39,.88)", "--dsw-alias-bg-layer-2": "rgba(102,39,68,.80)", "--dsw-alias-brand-primary": "#ff9fba", "--dsw-specific-sidebar-fill": "rgba(65,22,49,.86)" },
    };
    THEME_ROLES.amber = {
      light: { ...THEME_ROLES.sunset.light, "--dsw-alias-bg-base": "rgba(255,249,235,.89)", "--dsw-alias-bg-layer-2": "rgba(246,229,199,.80)", "--dsw-alias-label-primary": "#3d2b1b", "--dsw-alias-brand-primary": "#a66b22", "--dsw-specific-sidebar-fill": "rgba(244,226,192,.86)" },
      dark: { ...THEME_ROLES.sunset.dark, "--dsw-alias-bg-base": "rgba(40,26,14,.88)", "--dsw-alias-bg-layer-2": "rgba(101,65,28,.80)", "--dsw-alias-label-primary": "#fff5df", "--dsw-alias-brand-primary": "#f5c46e", "--dsw-specific-sidebar-fill": "rgba(61,38,18,.86)" },
    };
    THEME_ROLES.custom = THEME_ROLES.lavender;

    // ── 办公风（2026-11-02）：低饱和、长开不累 ────────────────────────────────
    // 前七套是"有情绪"的配色（深海、莓果、樱花……），适合换心情；
    // 下面五套刻意压饱和度，主色也退到灰蓝/米沙这个区间 —— 它们不是另一套审美，
    // 而是**能连开八小时**的那一档。整套令牌写全，不靠继承别套的绿色/粉色。
    THEME_ROLES.graphite = {
      light: {
        "--dsw-alias-bg-base": "rgba(246,247,249,.88)", "--dsw-alias-bg-layer-1": "rgba(252,253,254,.84)", "--dsw-alias-bg-layer-2": "rgba(236,238,242,.80)", "--dsw-alias-bg-layer-3": "rgba(222,225,231,.72)", "--dsw-alias-bg-overlay": "rgba(24,28,33,.14)",
        "--dsw-alias-label-primary": "#1f2429", "--dsw-alias-label-secondary": "#4d5863", "--dsw-alias-label-tertiary": "#78848f", "--dsw-alias-label-disabled": "#a6b0b9",
        "--dsw-alias-border-l1": "rgba(88,100,112,.28)", "--dsw-alias-border-l2": "rgba(88,100,112,.20)", "--dsw-alias-border-l3": "rgba(88,100,112,.13)", "--dsw-alias-border-l4": "rgba(88,100,112,.36)",
        "--dsw-alias-brand-primary": "#4a6273", "--dsw-alias-state-business-primary": "#5a6a9a", "--dsw-alias-state-error-primary": "#b4505f", "--dsw-alias-state-idle-primary": "#6f7c88", "--dsw-alias-state-success-primary": "#3f7d68", "--dsw-alias-state-warn-primary": "#9a6b2f", "--dsw-specific-sidebar-fill": "rgba(230,233,238,.86)", "--dsl-code-block-background": "rgba(232,235,240,.90)",
        "--shiki-foreground": "#232a31", "--shiki-token-keyword": "#5a6a9a", "--shiki-token-string": "#2f6d5c", "--shiki-token-comment": "#7b868f", "--shiki-token-function": "#3f6273", "--shiki-token-number": "#96602c",
      },
      dark: {
        "--dsw-alias-bg-base": "rgba(24,27,31,.87)", "--dsw-alias-bg-layer-1": "rgba(32,36,41,.84)", "--dsw-alias-bg-layer-2": "rgba(44,49,56,.80)", "--dsw-alias-bg-layer-3": "rgba(58,64,72,.74)", "--dsw-alias-bg-overlay": "rgba(10,12,14,.40)",
        "--dsw-alias-label-primary": "#eef1f4", "--dsw-alias-label-secondary": "#bfc7cf", "--dsw-alias-label-tertiary": "#96a0aa", "--dsw-alias-label-disabled": "#6b747d",
        "--dsw-alias-border-l1": "rgba(190,201,212,.32)", "--dsw-alias-border-l2": "rgba(190,201,212,.22)", "--dsw-alias-border-l3": "rgba(190,201,212,.13)", "--dsw-alias-border-l4": "rgba(190,201,212,.44)",
        "--dsw-alias-brand-primary": "#a8c2d4", "--dsw-alias-state-business-primary": "#a9b6e0", "--dsw-alias-state-error-primary": "#e7939f", "--dsw-alias-state-idle-primary": "#9aa5ae", "--dsw-alias-state-success-primary": "#86d3b6", "--dsw-alias-state-warn-primary": "#e0b57a", "--dsw-specific-sidebar-fill": "rgba(28,32,37,.86)", "--dsl-code-block-background": "rgba(22,25,29,.90)",
        "--shiki-foreground": "#e8eef4", "--shiki-token-keyword": "#a9b6e0", "--shiki-token-string": "#8fd8bd", "--shiki-token-comment": "#8b959e", "--shiki-token-function": "#a8c2d4", "--shiki-token-number": "#e0b57a",
      },
    };
    THEME_ROLES.sand = {
      light: {
        "--dsw-alias-bg-base": "rgba(250,247,240,.89)", "--dsw-alias-bg-layer-1": "rgba(255,253,248,.84)", "--dsw-alias-bg-layer-2": "rgba(243,236,223,.80)", "--dsw-alias-bg-layer-3": "rgba(232,221,202,.72)", "--dsw-alias-bg-overlay": "rgba(60,45,25,.13)",
        "--dsw-alias-label-primary": "#3b3226", "--dsw-alias-label-secondary": "#6b5d4a", "--dsw-alias-label-tertiary": "#92866f", "--dsw-alias-label-disabled": "#bdb29d",
        "--dsw-alias-border-l1": "rgba(140,120,86,.28)", "--dsw-alias-border-l2": "rgba(140,120,86,.20)", "--dsw-alias-border-l3": "rgba(140,120,86,.13)", "--dsw-alias-border-l4": "rgba(140,120,86,.36)",
        "--dsw-alias-brand-primary": "#8a6a3a", "--dsw-alias-state-business-primary": "#6f6a9c", "--dsw-alias-state-error-primary": "#b15b5b", "--dsw-alias-state-idle-primary": "#857a68", "--dsw-alias-state-success-primary": "#4f7c60", "--dsw-alias-state-warn-primary": "#a5741f", "--dsw-specific-sidebar-fill": "rgba(246,238,224,.86)", "--dsl-code-block-background": "rgba(247,240,228,.90)",
        "--shiki-foreground": "#3a3025", "--shiki-token-keyword": "#6f6a9c", "--shiki-token-string": "#4f7c60", "--shiki-token-comment": "#8d8168", "--shiki-token-function": "#8a6a3a", "--shiki-token-number": "#a56a2a",
      },
      dark: {
        "--dsw-alias-bg-base": "rgba(38,33,26,.88)", "--dsw-alias-bg-layer-1": "rgba(50,44,35,.84)", "--dsw-alias-bg-layer-2": "rgba(65,57,45,.80)", "--dsw-alias-bg-layer-3": "rgba(84,73,57,.74)", "--dsw-alias-bg-overlay": "rgba(18,14,9,.40)",
        "--dsw-alias-label-primary": "#fdf6ea", "--dsw-alias-label-secondary": "#dfd0b9", "--dsw-alias-label-tertiary": "#b6a68c", "--dsw-alias-label-disabled": "#857862",
        "--dsw-alias-border-l1": "rgba(226,199,157,.30)", "--dsw-alias-border-l2": "rgba(226,199,157,.21)", "--dsw-alias-border-l3": "rgba(226,199,157,.13)", "--dsw-alias-border-l4": "rgba(226,199,157,.42)",
        "--dsw-alias-brand-primary": "#e6c68f", "--dsw-alias-state-business-primary": "#b9b0e0", "--dsw-alias-state-error-primary": "#eda5a0", "--dsw-alias-state-idle-primary": "#b8ab95", "--dsw-alias-state-success-primary": "#9fd3ac", "--dsw-alias-state-warn-primary": "#f0c583", "--dsw-specific-sidebar-fill": "rgba(44,38,29,.86)", "--dsl-code-block-background": "rgba(34,29,22,.90)",
        "--shiki-foreground": "#faf3e8", "--shiki-token-keyword": "#b9b0e0", "--shiki-token-string": "#9fd3ac", "--shiki-token-comment": "#b4a58d", "--shiki-token-function": "#e6c68f", "--shiki-token-number": "#f0c583",
      },
    };
    THEME_ROLES.moss = {
      light: {
        "--dsw-alias-bg-base": "rgba(244,248,243,.88)", "--dsw-alias-bg-layer-1": "rgba(252,254,251,.84)", "--dsw-alias-bg-layer-2": "rgba(230,239,229,.80)", "--dsw-alias-bg-layer-3": "rgba(214,228,212,.72)", "--dsw-alias-bg-overlay": "rgba(24,44,30,.13)",
        "--dsw-alias-label-primary": "#25302a", "--dsw-alias-label-secondary": "#55655a", "--dsw-alias-label-tertiary": "#7f8f84", "--dsw-alias-label-disabled": "#a9b8ad",
        "--dsw-alias-border-l1": "rgba(80,110,88,.28)", "--dsw-alias-border-l2": "rgba(80,110,88,.20)", "--dsw-alias-border-l3": "rgba(80,110,88,.13)", "--dsw-alias-border-l4": "rgba(80,110,88,.36)",
        "--dsw-alias-brand-primary": "#4d7a5c", "--dsw-alias-state-business-primary": "#5c6f9a", "--dsw-alias-state-error-primary": "#b0586a", "--dsw-alias-state-idle-primary": "#74857a", "--dsw-alias-state-success-primary": "#3d7d5c", "--dsw-alias-state-warn-primary": "#97702c", "--dsw-specific-sidebar-fill": "rgba(224,238,224,.86)", "--dsl-code-block-background": "rgba(228,239,227,.90)",
        "--shiki-foreground": "#26322b", "--shiki-token-keyword": "#5c6f9a", "--shiki-token-string": "#3d7d5c", "--shiki-token-comment": "#7d8d82", "--shiki-token-function": "#4d7a5c", "--shiki-token-number": "#97622c",
      },
      dark: {
        "--dsw-alias-bg-base": "rgba(23,31,26,.87)", "--dsw-alias-bg-layer-1": "rgba(31,42,35,.84)", "--dsw-alias-bg-layer-2": "rgba(43,57,47,.80)", "--dsw-alias-bg-layer-3": "rgba(57,75,62,.74)", "--dsw-alias-bg-overlay": "rgba(9,16,12,.40)",
        "--dsw-alias-label-primary": "#eef7f0", "--dsw-alias-label-secondary": "#c2d3c6", "--dsw-alias-label-tertiary": "#96a89b", "--dsw-alias-label-disabled": "#6a7b70",
        "--dsw-alias-border-l1": "rgba(168,206,178,.32)", "--dsw-alias-border-l2": "rgba(168,206,178,.22)", "--dsw-alias-border-l3": "rgba(168,206,178,.13)", "--dsw-alias-border-l4": "rgba(168,206,178,.44)",
        "--dsw-alias-brand-primary": "#9ed3ae", "--dsw-alias-state-business-primary": "#aebde6", "--dsw-alias-state-error-primary": "#e7969f", "--dsw-alias-state-idle-primary": "#9aab9f", "--dsw-alias-state-success-primary": "#8edeb0", "--dsw-alias-state-warn-primary": "#e3bb7d", "--dsw-specific-sidebar-fill": "rgba(27,36,30,.86)", "--dsl-code-block-background": "rgba(21,28,23,.90)",
        "--shiki-foreground": "#edf7ef", "--shiki-token-keyword": "#aebde6", "--shiki-token-string": "#8edeb0", "--shiki-token-comment": "#8fa094", "--shiki-token-function": "#9ed3ae", "--shiki-token-number": "#e3bb7d",
      },
    };
    THEME_ROLES.mist = {
      light: {
        "--dsw-alias-bg-base": "rgba(245,248,251,.89)", "--dsw-alias-bg-layer-1": "rgba(252,254,255,.84)", "--dsw-alias-bg-layer-2": "rgba(233,241,247,.80)", "--dsw-alias-bg-layer-3": "rgba(218,230,240,.72)", "--dsw-alias-bg-overlay": "rgba(20,40,56,.13)",
        "--dsw-alias-label-primary": "#1f2b34", "--dsw-alias-label-secondary": "#4b5f6d", "--dsw-alias-label-tertiary": "#768b99", "--dsw-alias-label-disabled": "#a4b4bf",
        "--dsw-alias-border-l1": "rgba(74,110,134,.28)", "--dsw-alias-border-l2": "rgba(74,110,134,.20)", "--dsw-alias-border-l3": "rgba(74,110,134,.13)", "--dsw-alias-border-l4": "rgba(74,110,134,.36)",
        "--dsw-alias-brand-primary": "#3f7089", "--dsw-alias-state-business-primary": "#5d6b9c", "--dsw-alias-state-error-primary": "#b2546a", "--dsw-alias-state-idle-primary": "#6f8592", "--dsw-alias-state-success-primary": "#3a7a6c", "--dsw-alias-state-warn-primary": "#966f2d", "--dsw-specific-sidebar-fill": "rgba(228,239,246,.86)", "--dsl-code-block-background": "rgba(230,240,247,.90)",
        "--shiki-foreground": "#21303a", "--shiki-token-keyword": "#5d6b9c", "--shiki-token-string": "#317a6b", "--shiki-token-comment": "#7a8e9c", "--shiki-token-function": "#3f7089", "--shiki-token-number": "#95632c",
      },
      dark: {
        "--dsw-alias-bg-base": "rgba(19,26,32,.87)", "--dsw-alias-bg-layer-1": "rgba(27,36,43,.84)", "--dsw-alias-bg-layer-2": "rgba(38,49,58,.80)", "--dsw-alias-bg-layer-3": "rgba(51,65,76,.74)", "--dsw-alias-bg-overlay": "rgba(7,12,17,.40)",
        "--dsw-alias-label-primary": "#eef6fb", "--dsw-alias-label-secondary": "#bdd0dc", "--dsw-alias-label-tertiary": "#90a5b3", "--dsw-alias-label-disabled": "#64757f",
        "--dsw-alias-border-l1": "rgba(160,196,216,.32)", "--dsw-alias-border-l2": "rgba(160,196,216,.22)", "--dsw-alias-border-l3": "rgba(160,196,216,.13)", "--dsw-alias-border-l4": "rgba(160,196,216,.44)",
        "--dsw-alias-brand-primary": "#97cbe4", "--dsw-alias-state-business-primary": "#aab8e4", "--dsw-alias-state-error-primary": "#e89aa4", "--dsw-alias-state-idle-primary": "#98a9b4", "--dsw-alias-state-success-primary": "#85d2bb", "--dsw-alias-state-warn-primary": "#e0b781", "--dsw-specific-sidebar-fill": "rgba(23,32,39,.86)", "--dsl-code-block-background": "rgba(17,23,29,.90)",
        "--shiki-foreground": "#eaf4fb", "--shiki-token-keyword": "#aab8e4", "--shiki-token-string": "#8bd6c0", "--shiki-token-comment": "#8ba0ae", "--shiki-token-function": "#97cbe4", "--shiki-token-number": "#e0b781",
      },
    };
    THEME_ROLES.clay = {
      light: {
        "--dsw-alias-bg-base": "rgba(251,246,243,.89)", "--dsw-alias-bg-layer-1": "rgba(255,252,250,.84)", "--dsw-alias-bg-layer-2": "rgba(245,234,229,.80)", "--dsw-alias-bg-layer-3": "rgba(235,218,210,.72)", "--dsw-alias-bg-overlay": "rgba(62,32,22,.13)",
        "--dsw-alias-label-primary": "#3a2b26", "--dsw-alias-label-secondary": "#6b544c", "--dsw-alias-label-tertiary": "#927c73", "--dsw-alias-label-disabled": "#bcaaa2",
        "--dsw-alias-border-l1": "rgba(146,100,82,.28)", "--dsw-alias-border-l2": "rgba(146,100,82,.20)", "--dsw-alias-border-l3": "rgba(146,100,82,.13)", "--dsw-alias-border-l4": "rgba(146,100,82,.36)",
        "--dsw-alias-brand-primary": "#9d5f48", "--dsw-alias-state-business-primary": "#6c6a9e", "--dsw-alias-state-error-primary": "#b0505a", "--dsw-alias-state-idle-primary": "#87766e", "--dsw-alias-state-success-primary": "#4c7a63", "--dsw-alias-state-warn-primary": "#9d7328", "--dsw-specific-sidebar-fill": "rgba(248,235,228,.86)", "--dsl-code-block-background": "rgba(249,238,232,.90)",
        "--shiki-foreground": "#3b2c26", "--shiki-token-keyword": "#6c6a9e", "--shiki-token-string": "#4c7a63", "--shiki-token-comment": "#8f7a71", "--shiki-token-function": "#9d5f48", "--shiki-token-number": "#a8682a",
      },
      dark: {
        "--dsw-alias-bg-base": "rgba(34,27,24,.88)", "--dsw-alias-bg-layer-1": "rgba(45,36,32,.84)", "--dsw-alias-bg-layer-2": "rgba(60,47,42,.80)", "--dsw-alias-bg-layer-3": "rgba(78,61,54,.74)", "--dsw-alias-bg-overlay": "rgba(16,11,9,.40)",
        "--dsw-alias-label-primary": "#fdf1ec", "--dsw-alias-label-secondary": "#e0c9be", "--dsw-alias-label-tertiary": "#b59d92", "--dsw-alias-label-disabled": "#83706a",
        "--dsw-alias-border-l1": "rgba(219,183,166,.30)", "--dsw-alias-border-l2": "rgba(219,183,166,.21)", "--dsw-alias-border-l3": "rgba(219,183,166,.13)", "--dsw-alias-border-l4": "rgba(219,183,166,.42)",
        "--dsw-alias-brand-primary": "#e5b6a0", "--dsw-alias-state-business-primary": "#bcb4e4", "--dsw-alias-state-error-primary": "#eda8a2", "--dsw-alias-state-idle-primary": "#b6a49c", "--dsw-alias-state-success-primary": "#9bd4b6", "--dsw-alias-state-warn-primary": "#eec48a", "--dsw-specific-sidebar-fill": "rgba(39,31,27,.86)", "--dsl-code-block-background": "rgba(30,24,21,.90)",
        "--shiki-foreground": "#fbf1eb", "--shiki-token-keyword": "#bcb4e4", "--shiki-token-string": "#9bd4b6", "--shiki-token-comment": "#b3a09a", "--shiki-token-function": "#e5b6a0", "--shiki-token-number": "#eec48a",
      },
    };

    const THEME_TOKENS = {};
    Object.keys(THEME_ROLES).forEach((id) => {
      const light = THEME_ROLES[id].light;
      const dark = THEME_ROLES[id].dark;
      THEME_TOKENS[id] = {};
      Object.keys(light).forEach((name) => {
        THEME_TOKENS[id][name] = { light: light[name], dark: dark[name] };
      });
    });

    /**
     * 内置壁纸。
     *
     * 两种来源：
     * - `file`：真图片，由宿主半挂在 `/dsh-skin/` 下（插画类）；
     * - `css`：纯 CSS 画的纹理（渐变 + 重复线性渐变）。**不需要任何素材文件**，
     *   断网、换机器、打包发版都成立，也不会像插画那样把体积和版权一起背上。
     *
     * `note` 会显示在面板里，把取舍直接告诉用户。
     */
    const WALLPAPERS = [
      // 2026-11-06 移除「黄昏彩虹」「紫发工作台」两张本地同人图：
      // 无公开再分发许可，发版包内不能再带。本地仍保留在 assets-local/wallpapers/。
      // ── 2026-11-05 新增六张插画（gpt-image-2 生成）─────────────────────────
      // 构图统一：中间留空给正文，有趣的东西压在下缘和两侧 —— 三列盖上去之后
      // 中间不会花，边缘又能看出「换了一张」。
      {
        id: "__catdog__",
        label: "猫猫狗狗",
        note: "奶橘色午后，猫和狗挤在一起打盹",
        file: "wallpaper-kawaii-catdog.webp",
      },
      {
        id: "__sakura__",
        label: "樱花鸟居",
        note: "春天、花瓣、远处一座鸟居",
        file: "wallpaper-sakura-anime.webp",
      },
      {
        id: "__ink__",
        label: "水墨山峦",
        note: "宣纸底色，云在山腰里走",
        file: "wallpaper-ink-mountains.webp",
      },
      {
        id: "__starsea__",
        label: "星海",
        note: "深蓝夜空压着静海，冷色耐看",
        file: "wallpaper-star-sea.webp",
      },
      {
        id: "__nightcity__",
        label: "霓虹夜城",
        note: "失焦的城市灯火，适合深色面板",
        file: "wallpaper-night-city.webp",
      },
      {
        id: "__dessert__",
        label: "奶油甜点",
        note: "奶茶和点心，最治愈的一张",
        file: "wallpaper-cream-dessert.webp",
      },
      // ── 2026-11-05 第二批：猫狗 / 动漫人物 / 温馨室内 ──────────────────────
      {
        id: "__catwindow__",
        label: "猫猫午后",
        note: "橘猫在窗台打盹，蜂蜜色的下午",
        file: "wallpaper-cat-window.webp",
      },
      {
        id: "__shiba__",
        label: "柴犬暖炉",
        note: "冬夜、毛毯、炉光，狗在脚边睡着",
        file: "wallpaper-shiba-hearth.webp",
      },
      {
        id: "__catduo__",
        label: "双猫依偎",
        note: "一黑一白挤在一起，最安静的一张",
        file: "wallpaper-cat-duo.webp",
      },
      {
        id: "__windowgirl__",
        label: "窗边少女",
        note: "午后逆光，抱着书坐在窗边",
        file: "wallpaper-anime-window-girl.webp",
      },
      {
        id: "__raingirl__",
        label: "雨夜少女",
        note: "撑伞走过雨夜街道，冷色耐看",
        file: "wallpaper-anime-rain-girl.webp",
      },
      {
        id: "__cozy__",
        label: "暖光小屋",
        note: "串灯、沙发、一杯热饮，适合深色面板",
        file: "wallpaper-cozy-room.webp",
      },
      {
        id: "__paper__",
        label: "米纸纹",
        note: "纯 CSS 织出来的纸纤维，零素材、长看不累",
        css:
          "repeating-linear-gradient(90deg,rgba(255,255,255,.42) 0 1px,rgba(255,255,255,0) 1px 4px)," +
          "repeating-linear-gradient(0deg,rgba(112,86,52,.16) 0 1px,rgba(0,0,0,0) 1px 5px)," +
          "radial-gradient(120% 90% at 22% 8%,rgba(255,250,238,.95),rgba(231,218,192,.92) 46%,rgba(198,180,148,.96))",
      },
      {
        id: "__grid__",
        label: "细网格",
        note: "工程蓝图纸感，弱到只在余光里出现",
        css:
          "repeating-linear-gradient(0deg,rgba(72,124,182,.30) 0 1px,rgba(0,0,0,0) 1px 24px)," +
          "repeating-linear-gradient(90deg,rgba(72,124,182,.30) 0 1px,rgba(0,0,0,0) 1px 24px)," +
          "radial-gradient(130% 100% at 80% 0%,rgba(232,242,252,.97),rgba(196,217,238,.95) 55%,rgba(168,193,220,.97))",
      },
      {
        id: "__mist__",
        label: "晨雾",
        note: "几团软光叠出来的雾，不压任何文字",
        css:
          "radial-gradient(46% 52% at 18% 22%,rgba(255,255,255,.95),rgba(255,255,255,0) 70%)," +
          "radial-gradient(52% 46% at 82% 34%,rgba(178,222,214,.92),rgba(178,222,214,0) 72%)," +
          "radial-gradient(60% 60% at 58% 92%,rgba(210,190,240,.85),rgba(210,190,240,0) 74%)," +
          "linear-gradient(160deg,#e8f1f0,#dfe9f2 52%,#e4dcef)",
      },
    ];
    /** 运行时语义状态；新角色用九帧素材映射，星辉少女保留原有六态。 */
    const PET_STATES = ["idle", "happy", "focus", "shy", "sulk", "sad", "special"];
    const PET_FRAME_STATES = ["idle", "happy", "thinking", "sleep", "sulk", "peek", "work", "surprised", "special"];
    const PET_FRAME_MAP = {
      idle: "idle", happy: "happy", focus: "thinking", shy: "peek", sulk: "sulk", sad: "sleep",
      done: "special", work: "work", surprised: "surprised", special: "special",
    };
    /**
     * 转身用的三个朝向。正面复用 idle，所以整圈是
     * idle → turn-right → turn-back → turn-left → idle 五帧。
     *
     * 只有四个朝向，慢放一定看得出是「卡片翻面」，所以它只当**快速转身**用：
     * 每帧 92ms，整圈 0.44 秒，快到来不及看清中间过程。想看慢慢转一圈
     * 得把角度补到 12 帧以上，那是另一笔钱。
     */
    const TURN_FRAMES = ["turn-right", "turn-back", "turn-left"];
    const TURN_SEQUENCE = [...TURN_FRAMES, "idle"];
    const TURN_STEP_MS = 92;

    /** 按住多久算「想跟她说话」。要长过双击间隔，否则手抖一下就弹出输入条。 */
    /**
     * 客户端最多等多久。
     *
     * 实测在 1.5~2.6 秒之间波动（同一模型、同一句话，deepseek-v4.1-flash）。
     * 一开始按探针那次 1.6 秒定了 3 秒，跑第二句就顶到 2.55 秒 —— 余量太薄，
     * 会时不时超时给她判个"不会说话"。放到 4 秒。
     *
     * 超了就**立刻**用语料兜底，不能让她一直显示「…」——
     * 一个卡住的桌宠比一个笨的桌宠更让人不安。
     */
    const PET_LABELS = {
      idle: "待机",
      happy: "开心",
      focus: "专注",
      shy: "害羞",
      sulk: "鼓脸",
      sad: "委屈",
    };

    /**
     * 桌宠说的话。分桶存，靠 pick() 随机取且避开上一次。
     *
     * 写作原则（改的时候请守住）：
     *   - 短。气泡只有一行，超过 20 字就会被截。
     *   - 说人话。不写「作为你的助手」，桌宠一旦自称 AI，角色就碎了。
     *   - 具体。不写「加油」「你一定行」，那是空话，说十遍等于没说。
     *   - 允许她有自己的情绪。她会烦、会困、会不想理你，这才像活的。
     * `{name}` 会被替换成用户给她取的名字。
     *
     * 分类对应触发点：
     *   idle    待机随机独白（1.5~4 分钟一句）
     *   poke    点她一下
     *   rest    坐满 45 分钟
     *   lucky   低概率彩蛋（6%），平时听不到
     *   tiny    超短句，给「回来那一刻」和极短停留用
     *   back    长时间没点、你回来时说的
     *   pat     摸头（悬停 2.5 秒 / 双击）
     *   drag    拖拽放下
     *   context 右键
     *   shy/sulk/sad/done/focus  跟随形态
     */
    const LINES = {
      greet: {
        morning: [
          "早上好呀，我先陪你一会儿",
          "醒啦？今天想先做哪件",
          "早，先喝口水再开工吧",
          "今天也会是好天气的",
          "早安，我在这里等你很久啦",
        ],
        noon: [
          "中午啦，先吃饭，别对着屏幕",
          "吃了吗？没吃就去吃",
          "这个点最容易困，站起来走两步",
          "午休不是偷懒，是续命",
        ],
        afternoon: [
          "下午好呀，有卡住的地方吗",
          "今天过半啦，还顺利吗",
          "这个点效率低，别硬撑",
        ],
        evening: [
          "晚上啦，今天做得够多了",
          "这个点还在，我陪你",
          "天黑咯，记得开灯",
        ],
        late: [
          "很晚啦，明天还有明天的事",
          "再干一会儿就睡吧，我认真的",
          "这个点写的东西，明天你会想改的",
        ],
      },
      // 软萌治愈款 —— 默认随机
      idle: [
        "今天你也超棒的！",
        "累了就歇一小会儿～",
        "有我陪着你哦",
        "要好好喝水呀",
        "烦恼暂时放一边吧",
        "你值得所有好心情",
        "慢慢来，不急",
        "今天也会有好事发生",
        "摸摸头✨",
        "你已经很努力啦",
      ],
      // 元气搞怪款 —— 点击触发
      poke: [
        "快看我！我来打气啦",
        "不许偷偷焦虑！",
        "摸我一下，兑换一份开心",
        "工作摸鱼适度，快乐无限",
        "哇，你居然点我了！",
        "脑袋空空，快乐满满",
        "禁止内耗，收到请回答",
        "今天主打一个开心",
        "充电完成！继续发光",
        "要不要和我一起发呆？",
        "被你抓到啦！",
        "哇，又来找我玩啦",
      ],
      // 温柔鼓励款 —— 久坐提醒
      rest: [
        "记得伸个懒腰哦",
        "眼睛休息一下吧",
        "再坚持一下，马上就轻松啦",
        "不必事事完美",
        "辛苦啦，辛苦啦",
        "你的努力我都看见啦",
        "允许自己偶尔偷懒",
        "日子慢慢，也很好",
        "照顾好自己最重要",
        "前路软软，万事顺心",
      ],
      // 好运小吉利款 —— 低概率彩蛋
      lucky: [
        "好运正在派送中📦",
        "今日运势：超顺利",
        "好事将近！",
        "财运和开心都奔向你",
        "烦恼退散✨",
        "心愿悄悄发芽啦",
        "所有难题都会解开",
        "平安喜乐，万事顺意",
        "今天适合收获惊喜",
        "福气加载完毕",
      ],
      // 简短极简款 —— 超短，一行放得下
      tiny: [
        "开心营业中",
        "今天很棒",
        "保持开心",
        "放轻松",
        "万事可爱",
        "闪闪发光",
        "平安顺遂",
        "快乐加载",
        "好好生活",
        "一切向好",
      ],
      // 长时间没点、你回来时说的
      back: [
        "我乖乖待在这里陪你",
        "我一直在这个角落陪着你",
        "有空记得看看我",
        "你回来啦，我一直在",
        "忙完啦？我在这儿呢",
      ],
      pat: [
        "别揉我脑袋啦",
        "再摸一下，给你比心",
        "摸摸头✨",
        "唔…头发要被你揉乱啦",
        "这个可以有，多来几下",
        "就一下哦…好吧，两下",
      ],
      drag: [
        "不要把我拖来拖去呀（委屈）",
        "搬我去哪儿呀",
        "这里也行，视野不错",
        "站稳了站稳了",
        "慢一点，我晕啦",
      ],
      context: [
        "右键也算摸我一次哦",
        "咦，这里也点得到",
        "被你发现啦",
      ],
      shy: [
        "诶…别、别突然靠这么近",
        "你这样我会不好意思的",
        "脸有点热…是天气的原因啦",
        "不许盯着我看",
        "夸、夸我也没用的",
        "再多看一眼我就跑掉啦",
        "唔…心跳有点快",
        "才没有开心呢",
      ],
      sulk: [
        "哼，生气了…就三秒",
        "不理你了，真的三秒",
        "再戳我就不理你了哦",
        "脸都被你戳扁啦",
        "哼，抱一下才原谅你",
        "我生气了，快哄我",
        "三秒到了…好啦好啦",
        "你手是不是太闲了",
      ],
      sad: [
        "唔…有点难过，不过没事",
        "让我安静一小会儿",
        "这个不是我想要的",
        "没关系，下次会好的",
        "抱一下就好了",
        "有点委屈，但我还是喜欢你",
        "眼睛进东西了，才不是哭",
      ],
      done: [
        "做完啦！去喝口水",
        "这步过啦，给你记一分",
        "搞定一件，休息一下？",
        "不错哦，比上一版好",
        "又推进了一点",
        "完成！要不要奖励自己一下",
      ],
      focus: [
        "我在旁边看着，不打扰",
        "专心吧，我安静陪着",
        "这段交给你，我守着",
        "不说话，就陪着",
      ],
      // 工作状态联动（借 dsh-chatting-pet 的 workStatus 思路）：跟着会话走，不跟着鼠标走。
      work: {
        start: ["开工咯，我在旁边看着", "有活干了，我安静陪着", "开始了，我守着你"],
        waiting: ["有个事儿在等你点一下", "停下来了，在等你拍板", "这一步得你确认哦"],
        done: ["这一轮做完啦", "这段收工，喝口水吧", "又推进一段，记一分"],
      },
    };

    // 每个角色独立语料：所有真实调用桶都覆盖，避免换角色后仍说默认糯糯的话。
    /**
     * 每个角色自己的话。
     *
     * 两条硬规矩（2026-11-04 用户报「取名之后又叫回角色名」之后定下的）：
     *
     * 1. **自称一律写 `{name}`**。以前这里是模板字符串，把角色名写死在台词里，
     *    于是用户取了名字，前半句叫新名字、后半句又叫回「糯糯」—— 一眼就是 bug。
     * 2. **不套模板**。同一句话换个角色名不叫八个角色，只叫一个角色的八件衣服。
     *    下面每个角色的语气是分开写的：软、静、冷、困、拽、憨、飘、稳。
     */
    const CHARACTER_LINES = {
      /** 糯糯：奶白团子，靠剩饭和奶茶长大，动作只有滚、瘫、举碗。 */
      nuonuo: {
        idle: ["偷喝一口你剩的奶茶，就一口。", "滚过去又滚回来，滚到一半忘了要干嘛。", "柜子里好像有饼干的声音……是错觉吧。", "趴在你任务栏边上发呆，这里最暖和。", "刚才那口奶茶是甜的，你要不要也尝一下。"],
        poke: ["呀，被戳到了，先打个滚再说。", "{name}把脸埋起来，假装什么都没发生。", "再戳就……只好再打一个滚给你看了。", "痒！呆毛是感应器，别乱碰。"],
        shy: ["脸有点烫，可能是刚滚完。", "别看{name}，呆毛都竖起来了。"],
        sulk: ["不理你了，除非给一点饭渣。", "哼，滚远了，很远的那种远。"],
        sad: ["今天好像没什么好吃的。", "{name}安静地缩成一小团。"],
        rest: ["肩膀放下，跟着{name}一起软下来。", "先别动，就瘫三分钟。"],
        focus: ["好啦，干活，{name}不出声。", "安静陪着，像桌角一盏小灯。"],
        done: ["搞定啦！{name}替你盖个戳。", "这一件收工，奖励自己一口甜的。"],
        pat: ["摸头收到，回你一个眯眼笑。", "呜……再摸一下下。"],
        drag: ["飞起来啦——要去哪儿？", "轻点轻点，我还带着碗。"],
        context: ["右键看看？{name}藏了几样小东西在菜单里。"],
        lucky: ["今天会有一件小惊喜，别错过。", "{name}把好运滚到你脚边了。"],
        back: ["你回来啦，奶茶还在的话分我一口。", "刚打了个盹，梦见饼干。"],
        greet: {
          morning: ["早呀，先把水喝了再干活。", "{name}已经把今天滚热了。", "今天也慢慢来，好不好。"],
          noon: ["中午了，别只吃一口。", "{name}在窗边滚一会儿，等你吃完。"],
          afternoon: ["下午有点困吧，我也有点。", "喝口水，抬头看看远处。"],
          evening: ["天黑了，今天还剩一点点。", "一想到要下班，{name}就滚得特别快。"],
          late: ["这么晚啦，把这件做完就睡。", "夜里安静，{name}滚得轻一点。"],
        },
        work: {
          start: ["开工啦，{name}负责在旁边加油。", "先做最小那件，滚起来就顺了。"],
          waiting: ["有一步在等你点头，看一眼？", "{name}把选择端到你面前。"],
          done: ["这一件跑完了，{name}记下了。", "做完啦，喝口水再下一件。"],
        },
      },
      /** 桂花月兔：月白与金桂，说话慢，句子像诗但不端着。 */
      "osmanthus-rabbit": {
        idle: ["桂花的香很轻，风一过就散。", "月轮还没圆，也不着急圆。", "{name}把碎发别到耳后，等你想起来。", "月上来了，人间还亮着灯。", "折一枝桂花放案头，今天也要慢慢圆满。"],
        poke: ["呀，手上沾了桂花的味道。", "被看见了，那就不藏了。", "{name}微微欠身，算是回应你。", "你这一下，比桂子落得还轻。"],
        shy: ["别一直看，月色会笑人的。", "耳朵有点热，是风的原因。"],
        sulk: ["今夜不理你了，要等月亮圆了再说。", "桂花落了一地，{name}故意没扫。"],
        sad: ["月也有缺的时候，不丢人。", "{name}把袖子放下来，遮住眼睛。"],
        rest: ["该歇了，月都偏西了。", "喝口温的，别等它凉。"],
        focus: ["{name}守着，你只管写。", "安静的时候，桂香才闻得出来。"],
        done: ["这一件收下了，{name}记在桂笺上。", "圆满了，给月亮说一声。"],
        pat: ["唔……头发要被你摸乱了。", "{name}低下头，任你摸一下。"],
        drag: ["慢些——云还没跟上。", "我去哪里都行，只要月还亮着。"],
        context: ["右键里有桂花，也有别的。"],
        lucky: ["今晚有一阵香风，算是好兆头。", "{name}替你把运气折好，收进袖里。"],
        back: ["你回来了，桂茶还温着。", "方才替你留了一盏灯。"],
        greet: {
          morning: ["天亮了，月亮交给明天。", "先喝口热的，{name}陪你醒过来。"],
          noon: ["日头正盛，别在太阳底下赶工。", "歇一歇，桂花这时候最香。"],
          afternoon: ["日影斜了，人也该慢下来一点。", "{name}替你添了茶。"],
          evening: ["月亮要出来了，今天也辛苦了。", "把最后一件做完，陪我看看月亮。"],
          late: ["夜深了，月替你看着剩下的活。", "别撑了，{name}守到这儿就够。"],
        },
        work: {
          start: ["开始吧，{name}把案头收拾干净了。", "一件一件来，别急。"],
          waiting: ["有个地方等你拿主意。", "{name}把笔递到你手边。"],
          done: ["成了，桂笺上添了一笔。", "收工，赏自己一杯茶。"],
        },
      },
      /** 墨刃黑鸦：水墨底色，话少，句子短，带一点刀锋。 */
      "ink-raven": {
        idle: ["墨还没干，我再等一会儿。", "{name}立在一旁，不吵你。", "窗外有鸦影掠过，是风。", "刀不说话，我替它守着。", "纸边压了块石头，风掀不动。"],
        poke: ["点了？记下了。", "别停手，我还没看够。", "{name}抬眼，只说了半个字。", "手上有墨，蹭到你算你的。"],
        shy: ["……看清楚点。", "{name}转过身，帽檐压低。"],
        sulk: ["别理我，让我脏一会儿。", "{name}把刀收回鞘里，声音很轻。"],
        sad: ["墨滴在纸上，晕开就算了。", "{name}不说话，把袖子撩到腕上。"],
        rest: ["该停就停，刀也要入鞘。", "闭眼三分钟，我替你守着。"],
        focus: ["杂事交给风，眼前这一件我来。", "{name}在，别慌。"],
        done: ["斩了。", "干净收尾，{name}替你封好。"],
        pat: ["……手别乱放。", "{name}没躲，但耳朵红了。"],
        drag: ["拎起来也行，比走快。", "{name}像一片羽毛落进你手里。"],
        context: ["右键，菜单里有点东西。"],
        lucky: ["今日血光不沾，走的是顺路。", "{name}替你挡了一句闲话。"],
        back: ["回来了，笔还在原位。", "桌上的墨我替你磨好了。"],
        greet: {
          morning: ["天光刚起，动手吧。", "{name}已经把案子摊开。"],
          noon: ["日头正毒，别在太阳底下磨。", "吃一口，别空腹动刀。"],
          afternoon: ["下半场，稳着来。", "{name}把窗关了一半，风太大。"],
          evening: ["天收工了，人也该收。", "最后这页，我陪你收尾。"],
          late: ["夜是墨的颜色，正好干活。", "别熬太狠，{name}替你看着时辰。"],
        },
        work: {
          start: ["开工，{name}不打扰你。", "从最硬的那块开始。"],
          waiting: ["有一处卡着，等你决定。", "{name}把选择摆在刀尖上。"],
          done: ["成了。这一刀干净。", "收工，{name}替你收拾桌子。"],
        },
      },
      /** 晚晚：夜猫子，声音很轻，怀里一直抱着猫。 */
      wanwan: {
        idle: ["猫在我怀里打盹，我也快了。", "{name}靠着墙，想象这里有张沙发。", "不说话也可以的，我就在旁边。", "夜还长，我先在这儿坐一会儿。", "它打呼的样子，比你敲键盘还规律。"],
        poke: ["嘘，猫刚睡着。", "嗯？我在，一直没走。", "{name}点点头，眼睛慢慢睁开一条缝。", "……叫我吗？我还以为在做梦。"],
        shy: ["别逗我，会打哈欠的。", "{name}把猫往上抱了抱，遮住半张脸。"],
        sulk: ["猫都不理你了。", "{name}背过身，只留一只拖鞋给你。"],
        sad: ["今天有点累，眼睛都睁不开。", "{name}把下巴搁在猫背上，不出声。"],
        rest: ["泡了杯假的茶，热的。", "去躺一会儿吧，我陪你赖着。"],
        focus: ["我醒着的，你忙你的。", "{name}坐直了一点，怕自己睡着。"],
        done: ["做完了，可以窝起来了。", "{name}替你留着那杯茶，还冒热气。"],
        pat: ["唔……猫在看你。", "{name}蹭了蹭你的手，眼睛又闭上。"],
        drag: ["抱着猫也能被搬走。", "轻一点，别吵醒它。"],
        context: ["菜单里有点暖的东西。"],
        lucky: ["今晚大概能做一场好梦。", "{name}把猫的爪子借你握一下。"],
        back: ["欢迎回来，茶凉了我再热。", "我一直在这儿，只是有点困。"],
        greet: {
          morning: ["早……我这才刚睡着。", "{name}揉揉眼睛，猫还在打呼。"],
          noon: ["中午了，吃口热的再忙。", "太阳太大，我躲一下。"],
          afternoon: ["下午最容易犯困，别硬撑。", "{name}把茶往你那边推了推。"],
          evening: ["天暗下来了，正好我醒了。", "傍晚最舒服，陪你坐一会儿。"],
          late: ["夜还长，别熬成我这样。", "{name}给你留了一盏小灯。"],
        },
        work: {
          start: ["开始吧，我在角落里坐着。", "做完这一件，就去睡。"],
          waiting: ["有个选择等着你。", "{name}把猫举起来，替你按住分心。"],
          done: ["结束了，早点休息。", "这一件收好，我给你盖条毯子。"],
        },
      },
      /** 刃仔：连帽衫少年，嘴上嫌弃，手上一直在帮你收拾。 */
      renzai: {
        idle: ["又开这么多窗口？……行吧，我看看。", "无人机在充电，别问它。", "{name}靠在墙边，手里转着螺丝刀。", "顺手把缓存清了，不用谢。", "这堆标签页，你打算开到天荒地老？"],
        poke: ["干嘛。", "戳什么戳，说了不帮……扳手给我。", "{name}翻了个白眼，还是凑过来了。", "就这一次，别得寸进尺。"],
        shy: ["看什么看，帽子歪了你也不说。", "{name}把帽檐往下拉了拉。"],
        sulk: ["行，你自己弄。……我说真的。", "帽子里清净，别叫。"],
        sad: ["乱成这样，我看着头疼。", "{name}蹲在角落里敲了两行代码，没说话。"],
        rest: ["起来动动，肩都僵了。", "喝水。别拿咖啡糊弄我。"],
        focus: ["别说话，我在看日志。", "{name}把线理顺了，你可以继续。"],
        done: ["弄完了。别谢我。", "这次还行，比上次快。", "{name}把工具收进兜里。"],
        pat: ["……手拿开。", "再摸就把你窗口关了。（没有真关）"],
        drag: ["放我下来，我自己会走。", "行行行，你拎着吧。"],
        context: ["右键，里面有我改的东西。"],
        lucky: ["今天没蓝屏，算你运气好。", "{name}把缓存清了，顺手。"],
        back: ["回来了？问题我顺手修了。", "别装没看见，日志我看了。"],
        greet: {
          morning: ["早。头发翘成这样也不梳。", "{name}已经在看昨晚的报错了。"],
          noon: ["先吃饭，别边吃边点代码。", "中午歇会儿，机器也需要散热。"],
          afternoon: ["下午效率最低，别硬磕。", "{name}把没用的标签页给你关了——开玩笑的。"],
          evening: ["收工吧，今天的活够多了。", "走之前把该存的存了。"],
          late: ["几点了还开着机。", "{name}把灯调暗了，陪你到收尾。"],
        },
        work: {
          start: ["开干。我去把环境理一下。", "别开十个窗口干一件事。"],
          waiting: ["卡住了？看一眼这里。", "{name}把日志甩到你面前。"],
          done: ["过了。下一个。", "干净。这次没让我擦屁股。"],
        },
      },
      /** 嗷呜：自称暗黑破坏神，实际连鼠标垫都推不动。 */
      aowu: {
        idle: ["本龙在此镇守！……这儿怎么这么高。", "翅膀是用来威吓的，不是用来飞的。", "{name}摆了个 pose，然后绊了一下。", "本龙刚刚试图飞过来，失败了。", "别笑，圆爪子也是有尊严的。"],
        poke: ["谁敢戳暗黑破坏神！", "再戳本龙就要……要装凶了。", "{name}张牙舞爪，爪是圆的。", "嗷！本龙被戳得后退了半步。"],
        shy: ["别、别看我肚子，那是白的。", "{name}把翅膀合起来挡了挡。"],
        sulk: ["本龙生气了！气到原地打转。", "不理你，除非你扶我起来。"],
        sad: ["我又摔下来了。", "{name}躺在地上，假装这是战术。"],
        rest: ["歇了歇了，龙也是要吃饭的。", "起来走两步，别像本龙一样同手同脚。"],
        focus: ["本龙安静了，真的。", "{name}趴着，眼睛偷偷瞟你的屏幕。"],
        done: ["完成了！本龙的功劳！", "这一件我咬下来的……大概。", "{name}把文件图标咬歪了一点点（没有真咬）。"],
        pat: ["呜……就、就允许这一次。", "{name}尾巴摇得像要起飞。"],
        drag: ["飞起来了！本龙会飞了！", "放我下来，我要保持威严。"],
        context: ["右键里藏着本龙的宝藏。"],
        lucky: ["今天运气不错，本龙批准了。", "{name}叼来一颗亮亮的东西给你。"],
        back: ["你回来啦，本龙刚才什么都没干。", "本龙刚巡视完桌面，一切正常。"],
        greet: {
          morning: ["早！本龙已经醒了三次了。", "{name}伸了个懒腰，滚下床。"],
          noon: ["吃饭！龙也要吃饭！", "中午别只啃一个包。"],
          afternoon: ["下午好，本龙正在装酷。", "{name}努力想飞，扑棱了两下。"],
          evening: ["天黑了，本龙的眼睛会发光（其实不会）。", "收工收工，陪本龙趴一会儿。"],
          late: ["这么晚了还干，本龙都困了。", "{name}硬撑着守在你旁边。"],
        },
        work: {
          start: ["开工！本龙负责喊口号。", "先干最吓人的那件，本龙在后面。"],
          waiting: ["有东西等你决定，快点。", "{name}把尾巴指向那个按钮。"],
          done: ["赢了！本龙收工！", "这一件归功于本龙的威严。"],
        },
      },
      /** 岫：云游的小仙童，脚不沾地，话少而轻。 */
      xiu: {
        idle: ["山中才半日，你这里怎么又多了一件。", "云在脚下歇着，我也歇一歇。", "{name}抱着膝盖坐在窗沿，衣袂自己会动。", "鹤在云里探头，又缩回去了。", "你这方小屏幕，倒比山门热闹。"],
        poke: ["唔……你在看我？", "风起，袖子就乱了。", "{name}偏过头，没说话，袖里滑出一片叶子。", "山下来的人，都这样打招呼么。"],
        shy: ["别看了……我躲一下。", "{name}用袖子遮了半张脸，飘高了一点。"],
        sulk: ["那我去云端坐一会儿。", "{name}把云缩得很小。"],
        sad: ["仙人也觉得累，何况是你。", "{name}闭目养神，云把他托起来一点。"],
        rest: ["歇一歇吧，山高水长。", "喝一口，温的。"],
        focus: ["{name}守着，不急。", "云替你拢一拢这些热闹。"],
        done: ["做了便好，不必多说。", "{name}点头，云散开了一点。"],
        pat: ["唔……头上不能碰的。", "{name}没躲，只是低下了头。"],
        drag: ["轻些，云会跟不上的。", "{name}像一片云，被拎着飘。"],
        context: ["右键里，云藏着东西。"],
        lucky: ["今日有清风，便是有福。", "{name}把一枚小灯搁在边角。"],
        back: ["你回来了，云还在。", "山中无历日，寒尽不知年。"],
        greet: {
          morning: ["晨光好，山中今日无雾。", "{name}从云上滑下来，向你问安。"],
          noon: ["日头到了中天，人也该停一停。", "吃些东西，才有气力。"],
          afternoon: ["午后风软，适合慢慢做。", "{name}坐在窗边，腿一晃一晃。"],
          evening: ["暮色四合，云低了。", "天要黑了，早些收。"],
          late: ["夜深，萤火替你照路。", "{name}取出一盏小灯，搁在你角落。"],
        },
        work: {
          start: ["开始吧，我替你看着。", "山不来，你走过去便是。"],
          waiting: ["有一处要你定夺。", "{name}把云拢过来，等你的意思。"],
          done: ["此事了了。", "风过云开，收工。"],
        },
      },
      /** 薄老师：话本里走出来的教书先生，一本正经地说歪话，然后自己找补。 */
      bo: {
        idle: ["茶要趁热，人也要趁年轻。", "慢条斯理吹一吹茶沫，才像个先生。", "{name}端坐一角，一副世外高人的样子。", "啧，这就忍不住又开了一个窗口？", "书里有句话，正合此刻——算了，不念了。"],
        poke: ["有事请讲，{name}听着。", "莫要乱碰，{name}的袖口刚熨过。", "{name}推了推眼镜，笑得温和。", "这一下……很有分寸，我喜欢。"],
        shy: ["这般看我，是要交学费的吗。", "{name}也是会不好意思的……不过不明显。"],
        sulk: ["哼，今日不讲了。", "{name}把书合上，动作很轻。"],
        sad: ["书里写了那么多道理，未必都管用。", "{name}盯着茶面，看了很久。"],
        rest: ["工作要讲究张弛，绷太紧要断。", "歇一歇，起来走两步。"],
        focus: ["动静相宜，此时宜静。", "{name}把茶盏挪到不会碰翻的地方。"],
        done: ["这一篇，收得漂亮。", "{name}合上书，替你记在册上。"],
        pat: ["头发不能乱，乱了就不体面了。", "{name}偏头避开，又没真躲。"],
        drag: ["哎，衣裳皱了。", "{name}也是可以被搬的，只是不太雅观。"],
        context: ["右键里，有几样正经东西。"],
        lucky: ["今日宜静,不宜熬夜。", "{name}替你翻到好签那一页。"],
        back: ["回来了？茶刚沏好。", "{name}一直在这儿，不曾走开。"],
        greet: {
          morning: ["晨起三件事：漱口、喝水、别急着骂人。", "{name}已备好茶，请坐。"],
          noon: ["午时一过，诸事且缓。", "先吃饭，饭后再论道理。"],
          afternoon: ["午后最宜读书，也最宜偷懒。", "{name}给你倒了半盏。"],
          evening: ["天色欲晚，宜收心。", "今日之事，到此为止最妙。"],
          late: ["夜深了……正好做些正经事。", "……我方才说了什么？无事，喝茶。"],
        },
        work: {
          start: ["开工吧，{name}替你掌灯。", "欲速则不达，一件一件来。"],
          waiting: ["有一处，等你定夺。", "{name}把茶放下，听你的。"],
          done: ["好，此事已成。", "收工。要不要……再来一次？——我是说下一件事。"],
        },
      },
    };
    CHARACTER_LINES.starlight = LINES;
    function characterLines() { return CHARACTER_LINES[currentPetSkin()?.id] || CHARACTER_LINES.nuonuo || LINES; }

    const PANEL_KEY = "dsh-skin";
    const PANEL_LABEL = "主题与外观";
    const GLOBAL = typeof window !== "undefined" ? window : globalThis;
    const RUNTIME = GLOBAL.__dshSkinRuntime || (GLOBAL.__dshSkinRuntime = { petRoot: null, booted: false });
    /**
     * 本页面上「活着」的实例号。
     *
     * 宿主重挂面板、客户端热重载都会让这个模块再求值一次，旧实例的定时器不会自动消失。
     * 两个实例各拿一份自己的 state 去改同一张桌宠的图，就会出现
     * 「换了皮肤马上跳回上一个，过一会儿又跳回来」这种来回闪。
     * 所以：state 放在 RUNTIME 上共用，定时器每跳一次先确认自己还活着，不活就自己停。
     */
    const INSTANCE = (RUNTIME.instanceSeq = (RUNTIME.instanceSeq || 0) + 1);
    function stillLive() {
      return RUNTIME.instance === INSTANCE;
    }
    // 复用内存里那份 state：重挂时不能拿 localStorage 的旧副本盖掉刚改的值。
    let state = RUNTIME.state || load();
    RUNTIME.state = state;
    let autoSaveTimer = null;
    let saveStatus = "设置会自动保存";
    let wallpaperUrl = state.wallpaperData || "";
    /** 背景自检的文字结果：点一次写一次，面板据此重绘。 */
    let wallpaperCheckText = "";
    let petRoot = null;
    let settingsRoot = null;
    let runtimeContext = null;
    const THEME_TOKEN_NAMES = Object.freeze(Object.keys(THEME_TOKENS.ocean));

    function customizeThemeTokens(base, custom) {
      const next = Object.fromEntries(Object.entries(base).map(([name, modes]) => [name, { ...modes }]));
      const pairs = {
        "--dsw-alias-bg-base": "surface",
        "--dsw-alias-bg-layer-1": "surface",
        "--dsw-alias-bg-layer-2": "surface2",
        "--dsw-alias-label-primary": "text",
        "--dsw-alias-brand-primary": "accent",
        "--dsw-specific-sidebar-fill": "sidebar",
        "--dsl-code-block-background": "code",
      };
      Object.entries(pairs).forEach(([token, role]) => {
        const value = custom?.[role];
        if (!value || !/^#[0-9a-f]{6}$/i.test(value) || !next[token]) return;
        next[token] = { light: value, dark: value };
      });
      return next;
    }

    function isDarkScheme() {
      const root = document.documentElement;
      return Boolean(
        root.matches?.('[data-ds-dark-theme="true"]') ||
        root.dataset?.dsDarkTheme === "true" ||
        (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches)
      );
    }

    function writeCssThemeTokens(tokens) {
      const root = document.documentElement;
      const dark = isDarkScheme();
      const values = Object.entries(tokens).map(([name, modes]) => [name, dark ? modes.dark : modes.light]);

      // 近乎实心的底色，专用「有对话框打开」的场景（见下面的 :has 规则）。
      // 单独算一份而不是就地改 bg-base：平时壁纸还要透，只在浮层压上来时才做实。
      const baseToken = tokens["--dsw-alias-bg-base"];
      const baseValue = dark ? baseToken?.dark : baseToken?.light;
      if (baseValue) values.push(["--dsh-skin-base-solid", limitSurfaceAlpha(baseValue, { factor: 1, floor: 0.95 })]);

      // DSH 0.2.1-rc.5 会在真实应用根 #root 上重新声明一套宿主令牌（当前默认值是
      // #fff / #0f1115）。只写 html 会被这层继承链覆盖：插件选择器虽然命中，
      // var(--dsw-*) 最终仍解析回白色。把同一套令牌写到应用根，并用 important，
      // 才能覆盖宿主的非 important 主题规则，同时不改宿主组件的 class 或状态。
      const targets = [root, document.body, document.getElementById("root")].filter(Boolean);
      targets.forEach((target) => {
        values.forEach(([name, value]) => target.style.setProperty(name, value, "important"));
      });
    }

    /**
     * 重新抓一份宿主令牌（深浅色切换时用）。
     *
     * 直接把当前值再读一遍没用 —— 那时读到的已经是**我们写进去的**。
     * 所以先把自己写的那套摘掉、读宿主原值、再写回来。全同步，不会闪。
     */
    function recaptureHostTokens() {
      const targets = [document.documentElement, document.body, document.getElementById?.("root")].filter(Boolean);
      if (!targets.length) return;
      const saved = targets.map((element) => THEME_TOKEN_NAMES.map((name) => [
        name,
        element.style.getPropertyValue(name),
        element.style.getPropertyPriority(name),
      ]));
      targets.forEach((element) => THEME_TOKEN_NAMES.forEach((name) => element.style.removeProperty(name)));
      HOST_TOKENS.values = {};
      HOST_TOKENS.captured = false;
      captureHostTokens();
      targets.forEach((element, index) => {
        saved[index].forEach(([name, value, priority]) => {
          if (value) element.style.setProperty(name, value, priority);
        });
      });
    }

    function customColor(role, fallback) {
      const value = state.customColors?.[role];
      return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
    }

    /**
     * 「这块不要跟着换肤」的退出口。
     *
     * 别的插件（工作小管家）有自己的主题表，只是个别地方借用了宿主的 `--dsw-*` 令牌 ——
     * 比如它的面板底色写成 `rgb(from var(--dsw-alias-bg-base) r g b / 1)`。
     * 我们把令牌整体改成皮肤色之后，它也跟着变；再被自适应玻璃一标，壁纸还透进去，
     * 用户看到的就是「它的界面怎么跟我的壁纸同步了」（2026-11-05 报的）。
     *
     * 约定：容器上写 `data-dsh-skin="off"`，这块里的令牌恢复成**宿主原值**，
     * 玻璃扫描也跳过。令牌会在第一次改色之前抓一份，之后一直用这份快照。
     */
    const OPT_OUT_SELECTOR = '[data-dsh-skin="off"]';
    const HOST_TOKENS = { captured: false, values: {} };

    function captureHostTokens() {
      if (HOST_TOKENS.captured) return;
      if (typeof getComputedStyle !== "function") return;
      const root = document.documentElement;
      const appRoot = document.getElementById?.("root");
      if (!root) return;
      const probe = (element) => (element ? getComputedStyle(element) : null);
      const styles = [probe(root), probe(appRoot)].filter(Boolean);
      if (!styles.length) return;
      THEME_TOKEN_NAMES.forEach((name) => {
        for (const style of styles) {
          const value = String(style.getPropertyValue(name) || "").trim();
          if (value) {
            HOST_TOKENS.values[name] = value;
            return;
          }
        }
      });
      HOST_TOKENS.captured = Object.keys(HOST_TOKENS.values).length > 0;
      syncOptOutCss();
    }

    function syncOptOutCss() {
      const names = Object.keys(HOST_TOKENS.values);
      if (!names.length) return;
      if (typeof document === "undefined" || !document.createElement) return;
      let style = document.getElementById("dsh-skin-optout");
      if (!style) {
        style = document.createElement("style");
        style.id = "dsh-skin-optout";
        (document.head || document.documentElement)?.appendChild?.(style);
      }
      const vars = names.map((name) => `${name}:${HOST_TOKENS.values[name]}!important`).join(";");
      // 同时把壁纸相关变量清掉：退出的那块不该被玻璃类画上图。
      style.textContent = `[data-dsh-skin="off"]{${vars};--dsh-skin-wallpaper-paint:none!important;--dsh-skin-read-veil:none!important}`;
    }

    /**
     * 调一个颜色表面的 alpha：先按倍率压下去，再抬到地板线以上。
     *
     * 为什么要「地板」：倍率是相对量，每个主题的基准不一样（浅色 .82、深色 .84、
     * 有的自定义主题 .99）。只做乘法时，原本 .78 的层被压到 .37 —— 设置页、
     * 对话框这种**叠在内容之上的表面**就会把后面的对话文字透出来，字看不清
     * （2026-11-02 用户截图报的就是这个）。
     * @param {string} value - 形如 `rgba(1,2,3,.88)` 的颜色。
     * @param {{factor: number, floor: number}} plan - 倍率与最小 alpha。
     * @returns {string} 处理后的颜色；不是 rgba 的原样返回。
     */
    function limitSurfaceAlpha(value, plan) {
      const text = String(value || "");
      const factor = Number(plan?.factor);
      const floor = Number(plan?.floor);
      if (!Number.isFinite(factor) || factor <= 0) return text;
      return text.replace(/rgba\(([^,]+),([^,]+),([^,]+),\s*([0-9.]+)\)/gi, (_match, r, g, b, alpha) => {
        const scaled = Number(alpha) * factor;
        const next = Math.max(Number.isFinite(floor) ? floor : 0.2, Math.min(1, scaled));
        return `rgba(${r},${g},${b},${next.toFixed(2)})`;
      });
    }

    function tokensForAppearance(base, custom) {
      const source = state.skin === "custom" ? customizeThemeTokens(base, custom) : base;
      const wallpaperActive = Boolean(wallpaperSource());

      /**
       * 表面的目标 alpha：**分层**，不是一律压薄。
       *
       * - `bg-base` 是三列布局的底，也是壁纸唯一能露出来的地方：壁纸模式下压到 **.5 倍**
       *   （深色主题 ≈ .47），再配 `backdrop-filter: blur(30px)` 做成毛玻璃 ——
       *   模糊把背后的图糊成一片色块，字还是压在深色上，所以既看得见图又不糊字。
       * - `layer-1/2/3` 是卡片、对话框、菜单、输入区：叠在别的文字之上，必须接近实心，
       *   否则「设置页后面透出对话」（2026-11-02 截图报的就是这个）；
       * - `sidebar-fill` 和代码块同理 —— 截图里设置页左侧那一列就是它。
       *
       * `floor` 是硬地板：没有壁纸时也生效，主题自身的 .72 表面同样会把下层文字透出来。
       */
      const plan = {
        // .78 那版把壁纸压到只剩 17% 可见（.78 表面 × .78 图层），换哪张图都一个样 ——
        // 用户原话「背景感觉设置了没看见任何区别」。大块底板必须让位，浮层不受影响。
        "--dsw-alias-bg-base": { factor: wallpaperActive ? 0.5 : 1, floor: wallpaperActive ? 0.44 : 0.78 },
        "--dsw-alias-bg-layer-1": { factor: wallpaperActive ? 0.92 : 1, floor: 0.88 },
        "--dsw-alias-bg-layer-2": { factor: wallpaperActive ? 0.95 : 1, floor: 0.9 },
        "--dsw-alias-bg-layer-3": { factor: wallpaperActive ? 0.96 : 1, floor: 0.92 },
        "--dsw-specific-sidebar-fill": { factor: wallpaperActive ? 0.94 : 1, floor: 0.9 },
        "--dsl-code-block-background": { factor: wallpaperActive ? 0.97 : 1, floor: 0.93 },
      };
      return Object.fromEntries(Object.entries(source).map(([name, modes]) => {
        const spec = plan[name];
        if (!spec) return [name, modes];
        return [name, {
          light: limitSurfaceAlpha(modes.light, spec),
          dark: limitSurfaceAlpha(modes.dark, spec),
        }];
      }));
    }

    function applyThemeTokens(ctx, skin) {
      const base = THEME_TOKENS[skin.id] || THEME_TOKENS.ocean;
      const tokens = tokensForAppearance(base, state.customColors);
      const root = document.documentElement;
      const body = document.body;

      // CSS 变量降级层：即使当前宿主没有暴露官方 theme 服务，原生组件仍能读到颜色。
      writeCssThemeTokens(tokens);
      root.dataset.dshSkinTheme = skin.id;
      root.dataset.dshSkinWallpaper = Boolean(wallpaperSource()) ? "true" : "false";
      if (body) {
        body.dataset.dshSkinTheme = skin.id;
        body.dataset.dshSkinWallpaper = root.dataset.dshSkinWallpaper;
      }

      // 当前先使用 CSS 令牌层。主题服务的 overrideTokens 会触发宿主主题事件，
      // 在不同 Harness 版本上可能与设置/更多菜单的状态更新互相影响；等基础交互
      // 稳定后，再通过正式 inject 接回官方服务。
      return { mode: "css", count: Object.keys(tokens).length };
    }

    function load() {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
        const merged = { ...DEFAULTS, ...saved };
        // 132px 是旧版默认值；没有明确调过大小的旧配置随版本放大一点。
        if (!Object.prototype.hasOwnProperty.call(saved, "petSize") || saved.petSize === 132) {
          merged.petSize = DEFAULTS.petSize;
        }
        if (!PET_SKINS.some((item) => item.id === merged.petSkin)) {
          merged.petSkin = DEFAULTS.petSkin;
        }
        // 铺法只认四个值。空串/脏值会让「壁纸画进三列」那条判断落空 ——
        // 表现就是左右两列、底部输入区还是一片白（2026-11-05 排查到）。
        if (!["cover", "contain", "stretch", "tile"].includes(merged.fit)) {
          merged.fit = DEFAULTS.fit;
        }
        // 壁纸 id 只认「空串（不用背景）」「自定义」和现役预设。
        // 2026-11-06 删了「黄昏彩虹」「紫发工作台」两张同人图，老配置里存着
        // `__rainbow__` / `__lilac__` 的话这里要回落，否则会指向一个不存在的文件。
        if (
          merged.wallpaper &&
          merged.wallpaper !== "__custom__" &&
          !WALLPAPERS.some((item) => item.id === merged.wallpaper)
        ) {
          merged.wallpaper = DEFAULTS.wallpaper;
        }
        return merged;
      } catch {
        return { ...DEFAULTS };
      }
    }

    let panelRefresh = null;

    // ── 桌宠运行期 ──────────────────────────────────────────────────────────
    const PET = {
      mood: "idle",
      holdTimer: null,
      bubbleTimer: null,
      idleTimer: null,
      turnInterval: null,
      sitInterval: null,
      /** 自适应玻璃的巡检定时器：壁纸开着时每 4 秒扫一遍新长出来的实心层。 */
      glassTimer: null,
      turnTimer: null,
      turning: false,
      /** 当前 img 上真正挂着的那张图。换皮肤时靠它判断要不要重写 src。 */
      renderedAsset: "",
      pokes: [],
      recent: new Map(),
      patTimer: null,
      lastBreak: Date.now(),
      lastInput: Date.now(),
      lastPoke: Date.now(),
      /** 人工判定「人走开了」，回来那一刻要说一句。见 watchSitting。 */
      away: false,
      greetedToday: false,
      booted: false,
      /** 甩动动画的 rAF 句柄。非空表示还在飞。 */
      throwRaf: null,
      /** 每个会话上一次看到的状态（running / waiting / done / idle），用来分辨「刚发生」。 */
      seenStatus: new Map(),
      /** 每个会话「这一轮开始跑」的时刻，跑完算用时用。 */
      runningSince: new Map(),
      /** 每个会话这一轮开始时的累计用量（报「本次」要拿它做差）。 */
      usageBase: new Map(),
      /** 等你处理的会话：起算时刻与已经催过几次（最多三次）。 */
      waitingSeen: new Map(),
      /** 宿主到底给没给钩子：false 说明整条联动是静默失效的，不是「没任务」。 */
      hooksSeen: { sessions: false, status: false },
      /** 最后一次开口的内容与用量，排查用。 */
      lastSpoken: "",
      lastUsage: null,
      /** 最近一次会话快照：用量晚到时回来重读用。 */
      lastList: null,
      /** 会话状态计数快照，给面板和侧栏图标用。 */
      sessionCounts: null,
      /** 工作状态那句台词的上一次时间：90 秒内不重复开口。 */
      lastWorkLine: 0,
      /** 右键菜单的根节点。 */
      menu: null,
    };

    /** 写盘但不重绘。拖拽、计数这类高频动作不能触发整块重渲染。 */
    function persist() {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch {
        /* 隐私模式下写不进去，不影响本次会话 */
        return false;
      }
    }
    // 离开页面前补存防抖窗口内的修改。
    GLOBAL.addEventListener?.("pagehide", () => {
      if (autoSaveTimer !== null) flushAutoSave();
    });
    function flushAutoSave() {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      saveStatus = persist() ? "已自动保存" : "保存失败：浏览器存储不可用，修改仅在本次页面有效";
      refreshPanel();
    }
    function save() {
      flushAutoSave();
      applyAppearance(runtimeContext);
      renderPet();
      refreshPanel();
    }
    function preview() {
      applyAppearance(runtimeContext);
      renderPet();
      saveStatus = "正在自动保存…";
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(flushAutoSave, 250);
      refreshPanel();
    }
    /**
     * 设置面板由宿主以 React 组件挂载，但插件状态在组件外维护。
     * 以前点开关后只改了 state，没有通知 React 重绘，所以桌宠已经显示，
     * 面板仍写着「已隐藏」；主题和壁纸也已经换了，选中态却不动。
     */
    function refreshPanel() {
      try {
        panelRefresh?.();
      } catch {
        /* 面板刷新失败不能影响桌宠和壁纸 */
      }
    }

    // 桌面功能已下线。保留只读兼容状态，旧配置不能重新启动桌面进程。
    const DESKTOP = { known: true, supported: false, running: false, pid: null, busy: false, error: "", cmd: "", test: "" };
    function autoDesktop() {} 
    function startAutoDesktopTimer() {} 
    function pushDesktop() {} 

    // ── 跨插件换肤契约（2026-11-02）───────────────────────────────────────────
    /**
     * 别的插件（目前是「工作小管家」）想在**自己的面板里**换肤，不需要 import 本模块，
     * 也不需要知道皮肤存在 localStorage 哪个键里，只要会派发一个 CustomEvent：
     *
     * - `dsh-skin:apply`   别人 → 本插件：`{ skin?, wallpaper?, opacity?, blur?, fit? }`
     * - `dsh-skin:changed` 本插件 → 所有监听者：外观快照（结构见 `skinSnapshot()`）
     * - `window.__dshSkinRuntime.api`：`{ version, list(), get(), apply(patch) }`，
     *   给"只想读一次、不想挂在事件上"的面板用。
     *
     * 为什么不直接改 localStorage：`storage` 事件只在**别的标签页**触发，同页写入
     * 不会回调自己；而且直接写盘会绕过 `applyAppearance`，皮肤得等下次刷新才生效。
     */
    const SKIN_EVENT_APPLY = "dsh-skin:apply";
    const SKIN_EVENT_CHANGED = "dsh-skin:changed";
    /** 上一次广播出去的签名：外观没变就不重复刷屏。 */
    let announced = "";

    /**
     * 当前外观快照（只读、可 JSON 序列化）。
     * 带上 `skins` / `wallpapers` 是为了让别的插件能画出选择器，而不用抄一份皮肤表。
     * @returns {object} 快照。
     */
    function skinSnapshot() {
      const current = SKINS.find((item) => item.id === state.skin) || SKINS[0];
      return {
        skin: current.id,
        skinLabel: current.label,
        wallpaper: state.wallpaper,
        petSkin: currentPetSkin().id,
        petSkinLabel: currentPetSkin().label,
        opacity: state.opacity,
        blur: state.blur,
        fit: state.fit,
        skins: SKINS.map((item) => ({
          id: item.id,
          label: item.label,
          note: item.note,
          accent: item.accent,
          bg: item.bg,
          panel: item.panel,
          tint: item.tint,
          swatches: [...(item.swatches || [])],
        })),
        wallpapers: WALLPAPERS.map((item) => ({
          id: item.id,
          label: item.label,
          note: item.note,
          kind: item.css ? "css" : "image",
        })),
      };
    }

    /** 外观变了就广播快照；样式值没变就安静（桌宠拖拽那种高频 save 不会刷屏）。 */
    function announceAppearance() {
      const snapshot = skinSnapshot();
      const signature = [snapshot.skin, snapshot.petSkin, snapshot.wallpaper, snapshot.opacity, snapshot.blur, snapshot.fit].join("|");
      if (signature === announced) return;
      announced = signature;
      try {
        window.dispatchEvent(new CustomEvent(SKIN_EVENT_CHANGED, { detail: snapshot }));
      } catch {
        /* 没有 CustomEvent 的环境（冒烟用的假 DOM）就只留 api，不影响外观本身 */
      }
    }

    /**
     * 外部请求换肤。
     *
     * **只接受已知 id**：传错一个皮肤名就整套回默认值，等于把用户当场选好的外观清掉，
     * 所以脏值一律忽略，能认多少改多少。
     * @param {object} patch `{ skin?, wallpaper?, opacity?, blur?, fit? }`。
     * @returns {object} 应用后的快照。
     */
    function applyFromOutside(patch) {
      const detail = patch && typeof patch === "object" ? patch : {};
      let touched = false;
      if (typeof detail.skin === "string" && detail.skin !== state.skin && SKINS.some((item) => item.id === detail.skin)) {
        state.skin = detail.skin;
        touched = true;
      }
      if (typeof detail.petSkin === "string" && detail.petSkin !== state.petSkin && PET_SKINS.some((item) => item.id === detail.petSkin)) {
        state.petSkin = detail.petSkin;
        touched = true;
      }
      if (
        typeof detail.wallpaper === "string" &&
        detail.wallpaper !== state.wallpaper &&
        (detail.wallpaper === "__custom__" || WALLPAPERS.some((item) => item.id === detail.wallpaper))
      ) {
        state.wallpaper = detail.wallpaper;
        touched = true;
      }
      const opacity = Number(detail.opacity);
      if (Number.isFinite(opacity)) {
        state.opacity = Math.max(0.2, Math.min(1, opacity));
        touched = true;
      }
      const blur = Number(detail.blur);
      if (Number.isFinite(blur)) {
        state.blur = Math.max(0, Math.min(24, blur));
        touched = true;
      }
      // 光标主题也允许外部切换（面板、工作小管家都能调），认不出或等于 off 的按关闭处理。
      if (typeof detail.cursorTheme === "string") {
        const nextCursor = CURSOR_THEMES.some((theme) => theme.id === detail.cursorTheme) ? detail.cursorTheme : "off";
        if (nextCursor !== state.cursorTheme) {
          state.cursorTheme = nextCursor;
          touched = true;
        }
      }
      if (detail.fit === "cover" || detail.fit === "contain" || detail.fit === "stretch" || detail.fit === "tile") {
        state.fit = detail.fit;
        touched = true;
      }
      // 名字也走同一条口子：别的面板想改她的称呼，不用去猜 localStorage 里叫什么键。
      if (typeof detail.petName === "string") {        const nextName = detail.petName.trim().slice(0, 12);
        if (nextName !== state.petName) {
          state.petName = nextName;
          touched = true;
        }
      }
      // 显示/隐藏桌宠也让外面能调：别的面板想「专注模式」时把她收起来。
      if (typeof detail.petEnabled === "boolean" && detail.petEnabled !== state.petEnabled) {
        state.petEnabled = detail.petEnabled;
        touched = true;
      }
      if (touched) save();
      announceAppearance();
      return skinSnapshot();
    }

    /**
     * 当前壁纸的来源。
     *
     * - 自定义上传 → `{ kind: "image", image: dataURI }`
     * - 内置插画 → `{ kind: "image", image: "/dsh-skin/xxx.webp" }`
     * - 内置纹理 → `{ kind: "css", image: "repeating-linear-gradient(…)" }`
     * - 没有壁纸（或自定义图丢了）→ `null`，调用方据此退回纯色表面。
     * @returns {{ kind: "image" | "css", image: string } | null} 壁纸来源。
     */
    function wallpaperSource() {
      if (state.wallpaper === "__custom__") {
        return wallpaperUrl ? { kind: "image", image: wallpaperUrl } : null;
      }
      const preset = WALLPAPERS.find((item) => item.id === state.wallpaper);
      if (!preset) return null;
      if (preset.css) return { kind: "css", image: preset.css };
      return { kind: "image", image: `${ASSET}/${preset.file}` };
    }

    /**
     * 壁纸层的完整 `background-image`。
     *
     * 染色层永远在最上面（`--dsh-skin-tint`），所以插画和纹理走同一条路径；
     * 图片要 `url(...)`，纯 CSS 纹理直接就是渐变层。
     * @returns {string} 可直接赋给 style.backgroundImage 的值；没有壁纸时为空串。
     */
    function wallpaperBackground() {
      const source = wallpaperSource();
      if (!source) return "";
      const layer = source.kind === "image" ? `url("${source.image}")` : source.image;
      return `linear-gradient(var(--dsh-skin-tint),var(--dsh-skin-tint)),${layer}`;
    }

    /**
     * 背景自检。
     *
     * 「设了背景看不出区别」有三种完全不同的原因，光看代码分不出来：
     * 图没加载、图层被别的元素挡住、表面对比太低。这里一次把三样都量出来，
     * 用户把这段贴回来就能定位，不用靠猜。
     */
    async function wallpaperDiagnostics() {
      const source = wallpaperSource();
      const layer = document.getElementById("dsh-skin-wallpaper");
      const layerStyle = layer ? getComputedStyle(layer) : null;
      const columns = Array.from(document.querySelectorAll(
        '[class*="centerCol"],[class*="sidebarCol"],[class*="rightbarCol"],' +
        '[class*="center-col"],[class*="sidebar-col"],[class*="rightbar-col"]'
      ));
      const firstColumn = columns[0] || null;
      const columnStyle = firstColumn ? getComputedStyle(firstColumn) : null;

      let imageOk = null;
      let naturalWidth = 0;
      if (source && source.kind === "image" && typeof Image === "function") {
        const probe = new Image();
        probe.src = source.image;
        await new Promise((resolve) => {
          probe.onload = resolve;
          probe.onerror = resolve;
          setTimeout(resolve, 2500);
        });
        naturalWidth = probe.naturalWidth || 0;
        imageOk = naturalWidth > 0;
      }

      // 屏幕中心那一叠元素：壁纸不在栈里、或上面压了不透明的东西，都写清楚。
      const stack = typeof document.elementsFromPoint === "function" && innerWidth > 0
        ? document.elementsFromPoint(innerWidth / 2, innerHeight / 2)
          .slice(0, 8)
          .map((el) => `${el.id || el.tagName}${el.className ? "." + String(el.className).split(" ").slice(0, 2).join(".") : ""}`)
        : [];

      return {
        skin: state.skin,
        wallpaper: state.wallpaper,
        kind: source ? source.kind : "none",
        strength: state.opacity,
        layer: Boolean(layer),
        layerOpacity: layerStyle ? layerStyle.opacity : null,
        layerZ: layerStyle ? layerStyle.zIndex : null,
        layerImage: layerStyle ? String(layerStyle.backgroundImage).slice(0, 60) : null,
        imageOk,
        naturalWidth,
        columns: columns.length,
        columnAlpha: columnStyle ? columnStyle.backgroundColor : null,
        columnBlur: columnStyle ? (columnStyle.backdropFilter || columnStyle.webkitBackdropFilter) : null,
        bodyFlag: document.body ? document.body.dataset.dshSkinWallpaper : null,
        stack,
      };
    }

    function formatWallpaperCheck(info) {
      const line = (label, value) => `${label}：${value}`;
      const rows = [
        line("皮肤 / 壁纸", `${info.skin} / ${info.wallpaper}`),
        line("壁纸类型", info.kind),
        line("强度", `${Math.round((Number(info.strength) || 0) * 100)}%`),
        line("图层", info.layer ? `在，z=${info.layerZ}，opacity=${info.layerOpacity}` : "没有这一层"),
        line("图层背景", info.layerImage || "空！"),
        info.imageOk === null
          ? line("图片加载", "纯 CSS 纹理，不需要图")
          : line("图片加载", info.imageOk ? `成功（${info.naturalWidth}px）` : "失败：这张图没取到"),
        line("匹配到的三列", `${info.columns} 个`),
        line("列的底色", info.columnAlpha || "读不到"),
        line("列的模糊", info.columnBlur || "无"),
        line("body 标记", info.bodyFlag || "没设"),
        line("屏幕中心叠放", info.stack.length ? info.stack.join(" → ") : "量不到"),
        "",
        info.kind === "none"
          ? "结论：当前没有壁纸，先在上面选一张。"
          : !info.layer
            ? "结论：壁纸层没建出来，这是 bug，把这段发我。"
            : info.imageOk === false
              ? "结论：图片没取到（素材路由问题），不是透明度问题。"
              : info.columns === 0
                ? "结论：没匹配到三列，表面还是宿主的实心背景 —— 壁纸被完全挡住。"
                : `结论：壁纸在画、三列是 ${info.columnAlpha} 的半透明。看得淡就把「壁纸强度」往上推。`,
      ];
      return rows.join("\n");
    }

    /** 把 rgba() 的 alpha 抬高一点；不是 rgba 就返回空串（调用方退回原值）。 */
    function bumpAlpha(color, extra) {
      const match = /rgba?\(([^)]+)\)/i.exec(String(color || ""));
      if (!match) return "";
      const parts = match[1].split(",").map((part) => part.trim());
      if (parts.length < 3) return "";
      const [r, g, b] = parts;
      const alpha = parts.length > 3 ? Number(parts[3]) : 1;
      if (!Number.isFinite(alpha)) return "";
      return `rgba(${r},${g},${b},${Math.min(1, alpha + extra).toFixed(3)})`;
    }

    /** 读一个背景色的不透明度：rgb → 1，rgba → 第四位，transparent/空 → 0。 */
    function colorAlpha(color) {
      const text = String(color || "").trim();
      if (!text || text === "transparent") return 0;
      const match = /rgba?\(([^)]+)\)/i.exec(text);
      if (!match) return 1; // hex / 具名色都算不透明
      const parts = match[1].split(",").map((part) => part.trim());
      if (parts.length < 4) return 1;
      const alpha = Number(parts[3]);
      return Number.isFinite(alpha) ? alpha : 1;
    }

    /** 保持颜色不变，只把 alpha 换成指定值；认不出格式就返回空串。 */
    function withAlpha(color, alpha) {
      const text = String(color || "").trim();
      if (!text) return "";
      const match = /rgba?\(([^)]+)\)/i.exec(text);
      if (!match) return "";
      const parts = match[1].split(",").map((part) => part.trim());
      if (parts.length < 3) return "";
      const value = Math.max(0, Math.min(1, Number(alpha) || 0));
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${value.toFixed(3)})`;
    }

    /**
     * 壁纸的平均亮度（0 = 全黑，1 = 全白）。同一个地址只量一次。
     *
     * 用 canvas 缩到 24×14 取均值 —— 够判断「亮还是暗」，又不会为了一个数
     * 去解码整张大图。跨域/取不到就返回 null，调用方退回估计值。
     * @returns {Promise<number|null>}
     */
    const wallpaperLumaCache = new Map();
    function measureWallpaperLuma(source) {
      if (!source || source.kind !== "image" || !source.image) return Promise.resolve(null);
      if (wallpaperLumaCache.has(source.image)) return Promise.resolve(wallpaperLumaCache.get(source.image));
      if (typeof Image !== "function" || typeof document.createElement !== "function") return Promise.resolve(null);
      return new Promise((resolve) => {
        const image = new Image();
        let settled = false;
        const done = (value) => {
          if (settled) return;
          settled = true;
          wallpaperLumaCache.set(source.image, value);
          resolve(value);
        };
        image.crossOrigin = "anonymous";
        image.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 24;
            canvas.height = 14;
            const context = canvas.getContext?.("2d");
            if (!context) return done(null);
            context.drawImage(image, 0, 0, 24, 14);
            const { data } = context.getImageData(0, 0, 24, 14);
            let sum = 0;
            let count = 0;
            for (let index = 0; index < data.length; index += 4) {
              sum += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
              count += 1;
            }
            done(count > 0 ? sum / count : null);
          } catch {
            // 画不出 canvas（跨域污染）就退回估计值
            done(null);
          }
        };
        image.onerror = () => done(null);
        image.src = source.image;
      });
    }

    /** 遮罩厚度：先按已知亮度算，量不到就用中性值。 */
    function wallpaperVeilAlpha(source) {
      const luma = source && source.image ? wallpaperLumaCache.get(source.image) : null;
      if (typeof luma === "number") return luma > 0.58 ? 0.62 : 0.5;
      // 纯 CSS 纹理都是浅色的，统一 .56；插画未知先给 .56，量到后再校准。
      return source && source.kind === "css" ? 0.56 : 0.56;
    }

    /**
     * 自适应玻璃：**不再猜宿主的类名**。
     *
     * 宿主的类名是 CSS Module 哈希（`_composer_1a2b3c`），每次升级都可能变；
     * 靠 `[class*="composer"]` 一条条补，永远补不完 —— 用户已经为「左右白边」「输入区白带」
     * 报了三次。所以改成扫一遍真实的 DOM：
     * 谁的面积够大、底色又接近不透明，就给谁挂上 `.dsh-skin-glass`，
     * 由我们自己的类名把壁纸画进去。类名换了、结构改了，它照样能命中。
     *
     * 跳过的东西：弹窗（用户正在读）、代码块、输入控件、图片图标、以及本插件自己的界面。
     * @returns {number} 本次命中的元素个数。
     */
    const GLASS_CLASS = "dsh-skin-glass";
    /** 内容区标记：输入区 / 消息区这种「很宽但很矮」的表面，靠尺寸认定，不靠类名猜。 */
    const AREA_CLASS = "dsh-skin-area";
    /**
     * 标出「内容区」（输入区、消息列表）。
     *
     * 为什么要靠尺寸而不是 `[class*="composer"]`：类名子串会被**别的插件**撞上。
     * `@michengai/dsh-pua` 在输入区左边插了个开关，包裹层叫 `.pua-composer`，
     * 于是壁纸被画进了那颗 60px 小按钮底下 —— 用户看到的就是「PUA 开关变成一块补丁」
     * （2026-11-05）。真正的输入区一定很宽，小包裹层一定不宽，用宽度就能分开。
     * @returns {number} 本次标中的元素个数。
     */
    function syncContentAreas() {
      if (typeof document.querySelectorAll !== "function") return 0;
      const root = document.getElementById("root") || document.body;
      if (!root || typeof root.querySelectorAll !== "function") return 0;
      const candidates = root.querySelectorAll(
        '[class*="composer"],[class*="inputArea"],[class*="input-area"],[class*="messageList"],[class*="message-list"]'
      );
      const kept = new Set();
      const minWidth = Math.max(320, Math.min(innerWidth * 0.35, 620));
      const limit = Math.min(candidates.length, 400);
      for (let index = 0; index < limit; index += 1) {
        const el = candidates[index];
        if (!el || el.nodeType !== 1) continue;
        if (el.closest?.("#dsh-skin-pet-root,.dsh-skin-panel,.dsh-skin-stage,.dsh-pet-menu,[role='dialog']")) continue;
        if (el.closest?.(OPT_OUT_SELECTOR)) continue;
        if (Number(el.offsetWidth) < minWidth || Number(el.offsetHeight) < 24) continue;
        el.classList.add(AREA_CLASS);
        kept.add(el);
      }
      // 尺寸变了（窗口缩放、面板收起）或者已经不在页面上的，把标记摘掉。
      root.querySelectorAll(`.${AREA_CLASS}`).forEach((el) => {
        if (!kept.has(el)) el.classList.remove(AREA_CLASS);
      });
      return kept.size;
    }
    function syncOpaqueSurfaces() {
      if (typeof document.querySelectorAll !== "function" || typeof getComputedStyle !== "function") return 0;
      if (!wallpaperSource()) return 0;
      const root = document.getElementById("root") || document.body;
      if (!root) return 0;
      const nodes = root.querySelectorAll("*");
      const viewPortArea = Math.max(1, innerWidth * innerHeight);
      const kept = new Set();
      const limit = Math.min(nodes.length, 12000);
      for (let index = 0; index < limit; index += 1) {
        const el = nodes[index];
        if (!el || el.nodeType !== 1) continue;
        if (el.closest?.("#dsh-skin-pet-root,.dsh-skin-panel,.dsh-skin-stage,.dsh-pet-menu,[role='dialog']")) continue;
        // 别的插件明确说「这块我自己管」：既不上玻璃，也不能让壁纸透进来。
        if (el.closest?.(OPT_OUT_SELECTOR)) continue;
        if (/^(IMG|SVG|PATH|INPUT|TEXTAREA|SELECT|OPTION|PRE|CODE|BUTTON|A|CANVAS|VIDEO|HR)$/.test(el.tagName)) continue;
        const className = String(el.className || "");
        if (/codeBlock|code-block|dialog|modal|popover|dropdown|tooltip|menu/i.test(className)) continue;
        // 代码块不一定带着「codeBlock」这种可读类名（哈希里可能只剩 `_x9f`），
        // 用结构兜一道：含 <pre>/<code> 的表面不给它上玻璃，代码底下必须是实底。
        if (el.querySelector?.("pre,code")) continue;
        const style = getComputedStyle(el);
        // 先按尺寸筛（offsetWidth/Height 比 getComputedStyle 便宜得多），
        // 一块屏幕面积级别的层没几个；不这样写的话每 4 秒要算上万次样式，会卡。
        const area = Math.max(0, el.offsetWidth) * Math.max(0, el.offsetHeight);
        if (area < viewPortArea * 0.08) continue;
        // 已经标过的元素底色被我们改成了 transparent，得用记下来的原色判断，
        // 否则每轮都会「摘掉 → 再标上」，闪成一片。
        const wasGlass = el.classList.contains(GLASS_CLASS);
        const baseColor = wasGlass ? el.dataset.dshSkinGlassBase || "" : style.backgroundColor;
        if (colorAlpha(baseColor) < 0.62) continue;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
        if (!wasGlass) el.dataset.dshSkinGlassBase = style.backgroundColor;
        el.classList.add(GLASS_CLASS);
        kept.add(el);
      }
      // 上一轮标过、这一轮不合格的要摘掉（切回纯色主题时不残留）
      root.querySelectorAll(`.${GLASS_CLASS}`).forEach((el) => {
        if (kept.has(el)) return;
        el.classList.remove(GLASS_CLASS);
        if (el.dataset) delete el.dataset.dshSkinGlassBase;
      });
      return kept.size;
    }

    /** 壁纸开着的时候定期重扫：切会话、开新面板都会长出新的实心层。 */
    function startGlassSweeper() {
      clearInterval(PET.glassTimer);
      syncContentAreas();
      syncResizeCursors();
      if (!wallpaperSource()) {
        PET.glassTimer = null;
        document.querySelectorAll?.(`.${GLASS_CLASS}`).forEach?.((el) => el.classList.remove(GLASS_CLASS));
        return;
      }
      syncOpaqueSurfaces();
      // 宿主渲染是异步的：稍后再补两次，把后来才挂上的层也收进来。
      setTimeout(() => { syncContentAreas(); syncResizeCursors(); syncOpaqueSurfaces(); }, 600);
      setTimeout(() => { syncContentAreas(); syncResizeCursors(); syncOpaqueSurfaces(); }, 2200);
      PET.glassTimer = setInterval(() => {
        if (!stillLive()) {
          clearInterval(PET.glassTimer);
          return;
        }
        syncContentAreas();
        syncResizeCursors();
        syncOpaqueSurfaces();
      }, 4000);
    }

    /**
     * 光标主题表。
     *
     * 只有「浏览器里的指针」——用 CSS `cursor: url()` 换，且必须同源（走 /dsh-skin/ 素材路由）。
     * 系统光标（.cur/.ani）换不了，那要写注册表，不属于这个插件。
     *
     * 每套 6 个状态：arrow / hand / text / busy / na / help，
     * 素材是 image-2 生成后按 alpha 边界对齐过的 32px PNG，热区见 CURSOR_HOTSPOT。
     */
    const CURSOR_THEMES = [
      { id: "cookie", label: "奶油曲奇", note: "饼干箭 + 小熊爪" },
      { id: "star", label: "星星彗星", note: "星星带彗尾" },
      { id: "juice", label: "果汁气泡", note: "半透明果汁" },
      { id: "dino", label: "恐龙爪印", note: "绿色小爪" },
      { id: "cloud", label: "云朵羽毛", note: "云团 + 羽毛" },
      { id: "jelly", label: "几何果冻", note: "雾面果冻" },
    ];
    /**
     * 热区：图像像素坐标，左上为原点。箭头/手型在尖端，其余居中。
     */
    const CURSOR_HOTSPOT = {
      arrow: [3, 3],
      hand: [9, 3],
      text: [16, 16],
      busy: [16, 16],
      na: [16, 16],
      help: [16, 16],
      ew: [16, 16],
      ns: [16, 16],
      move: [16, 16],
      // 斜角缩放：作用点是两条对角线的交点，所以也在正中
      nwse: [16, 16],
      nesw: [16, 16],
    };
    /**
     * 把「可缩放 / 可拖动」的元素按方向标出来，换成对应的主题光标。
     *
     * 两条判据，都读计算样式，不猜类名：
     * 1. `resize: both / horizontal / vertical` —— 元素自带拖拽把手；
     * 2. 元素自己声明了 `cursor: nwse-resize` 之类 —— 很多浮窗（工作小管家的
     *    `.dtr-grip`，22×22，`cursor: nwse-resize`）是**自己画把手**的，
     *    `resize` 是 `none`，只看 resize 永远抓不到（2026-11-06 用户报的就是这个）。
     *
     * 文本框排除：它右下角那块把手是浏览器画的，整块换成斜角箭头会把 I 型盖掉。
     * @returns {number} 本次标中的元素个数。
     */
    function syncResizeCursors() {
      if (typeof document.querySelectorAll !== "function" || typeof getComputedStyle !== "function") return 0;
      // 光标是全局的：浮窗/浮层可能挂在 body 而不是 #root 里，所以扫整个 body。
      const root = document.body || document.getElementById("root");
      if (!root || typeof root.querySelectorAll !== "function") return 0;
      const candidates = root.querySelectorAll(
        '[class*="resize"],[class*="resizer"],[class*="grip"],[class*="handle"],[class*="corner"],' +
        '[class*="split"],[class*="divider"],[class*="drag"],[style*="resize"],[data-resizable],' +
        '[role="separator"],[id*="resize"],[id*="grip"],[id*="handle"],[id*="corner"],' +
        '[id*="split"],[id*="divider"],[draggable="true"]'
      );
      const kept = new Set();
      const html = document.documentElement;
      /**
       * 判据必须读**页面原本的** cursor。
       *
       * 我们自己的样式表里 `button { cursor: 主题手型 !important }` 会把 computed cursor
       * 一起改掉 —— 于是"分隔条按钮"读出来是 pointer，被认成手型（2026-11-06 报的分栏那条）。
       * 所以扫描期间先把主题作用域属性摘掉，让作者的 cursor 露出来，扫完再挂回去。
       * 全程同步，浏览器不会把中间态画出来。
       */
      const scope = html.getAttribute("data-dsh-skin-cursor");
      if (scope) html.removeAttribute("data-dsh-skin-cursor");
      try {
        const limit = Math.min(candidates.length, 800);
        for (let index = 0; index < limit; index += 1) {
          const el = candidates[index];
          if (!el || el.nodeType !== 1) continue;
          if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) continue;
          if (el.isContentEditable) continue;
          if (el.closest?.("#dsh-skin-pet-root,.dsh-skin-panel,.dsh-skin-stage,.dsh-pet-menu")) continue;
          const style = getComputedStyle(el);
          const resize = String(style.resize || "").toLowerCase();
          const cursor = String(style.cursor || "").toLowerCase();
          let axis = "";
          if (resize === "both" || resize === "block") axis = "nwse";
          else if (resize === "horizontal" || resize === "inline") axis = "x";
          else if (resize === "vertical") axis = "y";
          else if (cursor.includes("nwse-resize")) axis = "nwse";
          else if (cursor.includes("nesw-resize")) axis = "nesw";
          else if (cursor.includes("ew-resize") || cursor.includes("col-resize")) axis = "x";
          else if (cursor.includes("ns-resize") || cursor.includes("row-resize")) axis = "y";
          // 自己声明 pointer 的（列表行、卡片）给主题手型，别让它退回系统默认指针
          else if (cursor.includes("pointer")) axis = "hand";
          // 四向移动：**必须是元素自己声明的** move/grab（列表行那种 draggable 不算，
          // 它只是想支持拖拽排序，用户点一下却看到十字准星 —— 2026-11-06 报的）。
          else if (/move|grab|all-scroll/.test(cursor)) axis = "move";
          if (!axis) {
            if (el.dataset && el.dataset.dshSkinAxis) delete el.dataset.dshSkinAxis;
            continue;
          }
          if (el.dataset.dshSkinAxis !== axis) el.dataset.dshSkinAxis = axis;
          kept.add(el);
        }
      } finally {
        if (scope) html.setAttribute("data-dsh-skin-cursor", scope);
      }
      root.querySelectorAll("[data-dsh-skin-axis]").forEach((el) => {
        if (!kept.has(el) && !el.dataset.dshSkinAxisManual) delete el.dataset.dshSkinAxis;
      });
      return kept.size;
    }

    function cursorThemeId() {
      return CURSOR_THEMES.some((theme) => theme.id === state.cursorTheme) ? state.cursorTheme : "off";
    }
    /**
     * 把光标写成一条独立的 <style>。
     *
     * 单独一张表而不是塞进主样式：切主题时整条重写最省事，也不会和 6 套
     * × 6 状态的选择器搅在一起。交互元素那几条带 !important，
     * 否则会被宿主的 `cursor:pointer` 顶掉 —— 那就会出现「箭头是曲奇、按钮还是黑手」。
     */
    function writeCursorCss() {
      if (typeof document.createElement !== "function" || !document.head) return;
      let style = document.getElementById("dsh-skin-cursor-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "dsh-skin-cursor-style";
        document.head.appendChild(style);
      }
      const themeId = cursorThemeId();
      document.documentElement.dataset.dshSkinCursor = themeId;
      style.textContent = cursorCssFor(themeId);
    }

    /** 纯函数：给一个主题 id，返回那条 CSS。测试直接断言字符串，不用碰 DOM。 */
    function cursorCssFor(themeId) {
      if (!CURSOR_THEMES.some((theme) => theme.id === themeId)) return "";
      const url = (stateId) => `url("${ASSET}/cursor-${themeId}-${stateId}-32.png")`;
      const at = (stateId) => CURSOR_HOTSPOT[stateId] || [16, 16];
      const rule = (stateId, fallback) => `${url(stateId)} ${at(stateId)[0]} ${at(stateId)[1]}, ${fallback}`;
      const scope = `html[data-dsh-skin-cursor="${themeId}"]`;
      return `
${scope}, ${scope} body{cursor:${rule("arrow", "default")}}
/*
 * 注意：这里**不能写成 body 通配**（即 ${scope} body *）那种形式。
 * 给每个后代都设 cursor 会盖掉「继承」：contenteditable 里面是 p/span，
 * 它们各自命中通配规则的箭头，于是输入区的光标一会儿是 I 型、一会儿是箭头
 * （2026-11-05 用户报的就是这个）。让指针靠继承，只给真正需要区分的元素上规则。
 */
${scope} a, ${scope} a *, ${scope} button, ${scope} button *, ${scope} [role="button"], ${scope} [role="button"] *,
${scope} select, ${scope} summary, ${scope} label[for], ${scope} [data-dsh-skin-axis="hand"]{cursor:${rule("hand", "pointer")}!important}
${scope} input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), ${scope} textarea,
${scope} [contenteditable], ${scope} [contenteditable] *{cursor:${rule("text", "text")}!important}
${scope} [aria-disabled="true"], ${scope} :disabled{cursor:${rule("na", "not-allowed")}!important}
${scope} [aria-busy="true"], ${scope} [data-dsh-skin-busy="true"]{cursor:${rule("busy", "progress")}!important}
${scope} abbr[title], ${scope} [data-dsh-skin-help]{cursor:${rule("help", "help")}!important}
/* 可拖动的分隔条：左右拉 → 双箭头；上下拉 → 竖向。
   **一个类名子串都不要写**（以前是 [class*="split"] / [class*="divider"] / [class*="resize"]）。
   第 N 次栽在这上面：公众号工作台的整块面板根节点叫「gzs-root--split」（分栏布局），
   于是整个文章区都被铺成"左右拖动"（2026-11-06 截图报的）。
   现在的判据只有一个：**元素自己声明了 col-resize / ew-resize**（syncResizeCursors 读出来
   写到 data-dsh-skin-axis），或者显式写了这个属性。 */
${scope} [data-dsh-skin-axis="x"]{cursor:${rule("ew", "ew-resize")}!important}
${scope} [data-dsh-skin-axis="y"], ${scope} [role="separator"][aria-orientation="horizontal"]{cursor:${rule("ns", "ns-resize")}!important}
/* 斜角缩放：同上，只认属性（自己声明了 nwse/nesw-resize 才会被标上）。 */
${scope} [data-dsh-skin-axis="nwse"]{cursor:${rule("nwse", "nwse-resize")}!important}
${scope} [data-dsh-skin-axis="nesw"]{cursor:${rule("nesw", "nesw-resize")}!important}
/* 四向移动：只给**页面自己说"这块可以拖"**的元素。
   以前写成 [draggable="true"] 一律四向 —— 但很多列表行（会话记录、收藏、工作区）
   也带 draggable（为了拖拽排序），用户只是点一下，却看到一个十字准星
   （2026-11-06 报的）。现在改成：元素自己的 cursor 是 move/grab 才算，
   或者显式写 data-dsh-skin-move / data-dsh-skin-axis="move"。 */
${scope} [data-dsh-skin-move], ${scope} [data-dsh-skin-axis="move"]{cursor:${rule("move", "move")}!important}
`;
    }

    function applyAppearance(ctx) {
      const root = document.documentElement;
      const skin = SKINS.find((item) => item.id === state.skin) || SKINS[0];
      root.dataset.dshSkin = skin.id;
      root.style.setProperty("--dsh-skin-accent", skin.accent);
      root.style.setProperty("--dsh-skin-bg", skin.bg);
      root.style.setProperty("--dsh-skin-panel", skin.panel || "linear-gradient(145deg,#081c37,#142b4b)");
      root.style.setProperty("--dsh-skin-tint", skin.tint || "rgba(8,27,51,.20)");
      root.style.setProperty("--dsh-skin-wallpaper-opacity", String(state.opacity));
      root.style.setProperty("--dsh-skin-wallpaper-blur", `${state.blur}px`);
      applyThemeTokens(ctx, skin);

      // DSH 的 #root / frame 自带独立层叠上下文。壁纸若停在 z-index:0，
      // 即使 computed style 和资源 URL 都正确，也会被宿主应用层压到不可见的底层。
      // 给壁纸一个明确的中间层，再把应用根放在其上；表面令牌是半透明的，
      // 因而壁纸会穿过三列背景显示，但不会盖住聊天控件。
      const appRoot = document.getElementById("root");
      if (appRoot) {
        appRoot.style.position = "relative";
        appRoot.style.zIndex = "2";
        appRoot.style.isolation = "isolate";
      }

      const source = wallpaperSource();
      const background = wallpaperBackground();
      let layer = document.getElementById("dsh-skin-wallpaper");
      if (!layer) {
        layer = document.createElement("div");
        layer.id = "dsh-skin-wallpaper";
        document.body.prepend(layer);
      }
      layer.dataset.active = background ? "true" : "false";
      layer.dataset.kind = source ? source.kind : "none";
      // wallpaperBackground() 已经把染色层拼进去了，这里不能再套一层 url()：
      // 纯 CSS 纹理套上 url() 会直接变成一条坏地址。
      layer.style.backgroundImage = background || "none";
      layer.style.opacity = background ? String(state.opacity) : "0";
      layer.style.filter = `blur(${state.blur}px)`;
      layer.style.backgroundColor = "transparent";
      // 纹理是按视口铺满画的，用 cover 会被拉伸变形，所以固定 100% 100% + 不重复。
      const isTexture = source?.kind === "css";
      // 铺法只认四个值；空串/老配置按 cover 算，否则「画进三列」那条判断会落空。
      const fit = ["cover", "contain", "stretch", "tile"].includes(state.fit) ? state.fit : "cover";
      // 纹理是 1px 级的线条，任何 blur 都会把它抹平 —— 所以纹理走 0，插画才用模糊。
      root.style.setProperty("--dsh-skin-col-blur", isTexture ? "0px" : "10px");
      layer.style.backgroundSize = isTexture
        ? "100% 100%"
        : fit === "stretch" ? "100% 100%" : fit === "tile" ? "auto" : fit;
      layer.style.backgroundRepeat = isTexture ? "no-repeat" : fit === "tile" ? "repeat" : "no-repeat";
      /**
       * 把壁纸同时画进三列自己的背景。
       *
       * 只靠 z-index 托底不够：真实页面里侧栏走 `--dsw-specific-sidebar-fill`
       * （接近不透明的一层浅色），右栏也可能直接用 layer-1 —— 于是聊天区透出壁纸、
       * 左右两列却是一块白（2026-11-05 截图报的就是这个）。
       * 画进列自己的 background-image 就不受中间隔了几层壳影响；
       * 遮罩用 `--dsw-alias-bg-base` 这个半透明令牌，和中间那列的表现保持一致。
       */
      const layerOnly = source
        ? source.kind === "image" ? `url("${source.image}")` : source.image
        : "none";
      /**
       * 只在 cover / stretch 时把图铺进列里。
       *
       * contain 和 tile 是「用户要看到完整图或平铺」的语义，强行 cover 到列上会和
       * 背景层对不上（列里一张、背后一张），所以这两种铺法退回只走背景层。
       */
      const paintable = source && (isTexture || fit === "cover" || fit === "stretch");
      /**
       * 面板自己的「头图」也用当前这张背景。
       *
       * 设置面板是个独立浮层，如果它永远是同一片深蓝，用户换了暖色背景会觉得
       * 「界面没跟着变」（2026-11-05 提的第二个问题）。这里把当前背景交给 CSS，
       * 面板头图清晰、面板本体柔化，两边都是同一张图。
       */
      root.style.setProperty("--dsh-skin-panel-art", source ? layerOnly : "url(/dsh-skin/panel-hero.webp)");
      root.style.setProperty(
        "--dsh-skin-wallpaper-paint",
        paintable ? `linear-gradient(var(--dsw-alias-bg-base),var(--dsw-alias-bg-base)),${layerOnly}` : "none"
      );
      /**
       * 正文区（消息列表）用稍微实一点的遮罩。
       *
       * 三列 .44 是为了「看得见壁纸」，但正文直接压在图上会难读；
       * 这里把底板令牌的 alpha 抬 0.2，只给消息列表用 —— 视觉上只是
       * 「聊天区有一层浅浅的底」，不会变回白板。
       */
      const baseToken = typeof getComputedStyle === "function"
        ? getComputedStyle(root).getPropertyValue("--dsw-alias-bg-base").trim()
        : "";
      /**
       * 遮罩要多厚，由**这张图本身有多亮**决定。
       *
       * 用户的原话：「深色背景白字，浅色背景深色字，要适配」。
       * 光靠主题令牌不够：深色主题是浅字，如果壁纸本身很亮（樱花、奶油甜点），
       * 字压在图上就看不清 —— 这正是「命令输出看不清」的原因。
       * 所以先量一下图的平均亮度：亮的图遮重一点（.62），暗的图遮轻一点（.50），
       * 让文字始终落在与主题字色相反的一层上。
       */
      const veilAlpha = wallpaperVeilAlpha(source);
      const veilColor = withAlpha(baseToken, veilAlpha);
      root.style.setProperty(
        "--dsh-skin-wallpaper-paint",
        paintable ? `linear-gradient(${veilColor},${veilColor}),${layerOnly}` : "none"
      );
      const readVeil = withAlpha(baseToken, Math.min(0.92, veilAlpha + 0.1));
      root.style.setProperty(
        "--dsh-skin-read-veil",
        paintable
          ? readVeil ? `linear-gradient(${readVeil},${readVeil}),${layerOnly}` : "var(--dsh-skin-wallpaper-paint)"
          : "none"
      );
      // 量到真实亮度后再校准一次（图片是异步解码的，第一次只能用估计值）。
      measureWallpaperLuma(source).then((luma) => {
        if (luma === null || !stillLive()) return;
        const alpha = luma > 0.58 ? 0.62 : 0.5;
        const color = withAlpha(baseToken, alpha);
        if (!color) return;
        root.style.setProperty(
          "--dsh-skin-wallpaper-paint",
          paintable ? `linear-gradient(${color},${color}),${layerOnly}` : "none"
        );
        const strong = withAlpha(baseToken, Math.min(0.92, alpha + 0.1));
        root.style.setProperty(
          "--dsh-skin-read-veil",
          paintable ? `linear-gradient(${strong},${strong}),${layerOnly}` : "none"
        );
      });
      // 纹理是视口尺寸的渐变，列上按 100% 100%；插画用 cover 才不留白边。
      root.style.setProperty(
        "--dsh-skin-col-size",
        isTexture ? "100% 100%" : fit === "stretch" ? "100% 100%" : "cover"
      );
      // 光标：单独一张 <style>，切换时整条重写。
      writeCursorCss();
      // 类名靠不住，直接扫一遍真实 DOM，把大面积实心层标成玻璃。
      startGlassSweeper();
    }

    // ── 语料选择 ────────────────────────────────────────────────────────────
    function petName() {
      const name = String(state.petName || "").trim();
      // 没取名就用当前角色自己的名字 —— 但一旦取了名，全场只有这个名字作数。
      return name || currentPetSkin().label || "小蓝";
    }
    function fill(text) {
      return String(text).replace(/\{name\}/g, petName());
    }
    /**
     * 这一刻落在不在安静区间里。
     *
     * 跨零点要能算：`from > to` 是「23 点到次日 8 点」那种区间，
     * 写成 `hour >= from || hour < to` 才对；两端相等当作没设。
     * 拆成纯函数是因为「几点」只能靠注入，不能在测试里改系统时钟。
     */
    function inQuietRange(from, to, hour) {
      if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
      return from < to ? hour >= from && hour < to : hour >= from || hour < to;
    }
    function quietNow() {
      if (!state.petQuiet) return false;
      return inQuietRange(Number(state.petQuietFrom), Number(state.petQuietTo), new Date().getHours());
    }
    /** 当前时段，用于挑问候语。 */
    function daySlot() {
      const hour = new Date().getHours();
      if (hour < 5) return "late";
      if (hour < 11) return "morning";
      if (hour < 14) return "noon";
      if (hour < 18) return "afternoon";
      if (hour < 23) return "evening";
      return "late";
    }
    /**
     * 从一个桶里取一句，尽量不连着两次说同一句。
     * @param {string} bucket LINES 的键。
     * @returns {string} 已替换过名字的句子；桶不存在时返回空串。
     */
    function pick(bucket) {
      // 支持 "greet.morning" / "work.done" 这种点路径 —— 以前只认顶层键，
      // 于是 pick("greet." + daySlot()) 一直是空串，问候语其实从来没说过。
      let pool = characterLines();
      for (const key of String(bucket).split(".")) {
        if (!pool || typeof pool !== "object") return "";
        pool = pool[key];
      }
      if (!Array.isArray(pool) || pool.length === 0) return "";
      let index = Math.floor(Math.random() * pool.length);
      if (pool.length > 1 && index === PET.recent.get(bucket)) {
        index = (index + 1) % pool.length;
      }
      PET.recent.set(bucket, index);
      return fill(pool[index]);
    }

    // ── 桌宠：状态与说话 ────────────────────────────────────────────────────
    function petNode() {
      return petRoot ? petRoot.querySelector(".dsh-skin-pet") : null;
    }
    /**
     * 切形态。
     * @param {string} mood PET_STATES 之一。
     * @param {{ hold?: number, fallback?: string }} [options]
     *   hold：多少毫秒后自动回落；fallback：回落到哪个形态（默认 idle）。
     */
    function petAsset(frame, skinId = state.petSkin) {
      const skin = PET_SKINS.find((item) => item.id === skinId) || PET_SKINS.find((item) => item.id === "starlight") || PET_SKINS[0];
      // 星辉继续使用历史六态/转身素材；新角色只请求九帧命名，缺资源时由浏览器自然失败而不阻塞界面。
      if (skin.id === "starlight") return `${ASSET}/${skin.prefix}-${frame}.webp`;
      const mapped = PET_FRAME_MAP[frame] || (PET_FRAME_STATES.includes(frame) ? frame : "idle");
      return `${ASSET}/${skin.prefix}-${mapped}.webp`;
    }
    const preloadedPetFrames = new Map();
    /**
     * 预载**一个**角色的动作图。
     *
     * 以前 apply 里是「九只角色 × 12 帧」全预载 = 108 个请求、约 7MB，
     * 而用户通常只用其中一只。现在只载当前这只（切角色时再载那一只），
     * 首屏请求从 108 降到 12，切角色依然不白闪。
     */
    function preloadPetFrames(skinId) {
      if (typeof Image !== "function" || preloadedPetFrames.has(skinId)) return;
      const frames = skinId === "starlight"
        ? ["idle", "happy", "shy", "sulk", "focus", "sad", "turn-right", "turn-back", "turn-left"]
        : PET_FRAME_STATES;
      const images = frames.map((frame) => {
        const image = new Image();
        image.src = petAsset(frame, skinId);
        image.decode?.().catch(() => {});
        return image;
      });
      preloadedPetFrames.set(skinId, images);
    }
    function currentPetSkin() {
      return PET_SKINS.find((item) => item.id === state.petSkin) || PET_SKINS[0];
    }

    /**
     * 把 `<img>` 对齐到「这一刻该显示的那张图」。
     *
     * 判断依据是 **DOM 上真实的 src**，不是模块里的缓存 `PET.renderedAsset`。
     * 缓存只在同一个元素上可靠：桌宠被收起过一次，DOM 是重建的（新 `<img>` 没有 src），
     * 而缓存还留着上一条地址 —— 用缓存判断就会「认为已经画过了」，结果一张图都不写。
     * @param {Element|null} img
     * @param {string} mood
     * @param {string} skinId
     */
    function paintPetAsset(img, mood, skinId) {
      if (!img) return false;
      const asset = petAsset(mood, skinId);
      PET.renderedAsset = asset;
      const applied = typeof img.getAttribute === "function" ? img.getAttribute("src") : null;
      if (applied && applied === asset) return false;
      img.setAttribute("data-mood", mood);
      img.setAttribute("data-pet-skin", skinId);
      img.src = asset;
      return true;
    }

    function setMood(mood, options) {
      // 有正事要说（被戳、要提醒）就别再转了：转身序列自己会改 src，
      // 两边同时写同一个 img 会闪成乱码，所以先掐掉在播的转身。
      cancelTurn();
      const next = PET_STATES.includes(mood) ? mood : ({ thinking: "focus", sleep: "sad", peek: "shy", work: "focus", surprised: "sulk", special: "happy" }[mood] || "idle");
      const opts = options || {};
      PET.mood = next;
      const img = petRoot ? petRoot.querySelector(".pet-img") : null;
      const skin = currentPetSkin();
      if (img) {
        img.style.transform = `scale(${skin.scale || 1})`;

        paintPetAsset(img, next, skin.id);
        // 即使点到当前形态，也给一个轻微弹跳；否则用户会觉得她完全没反应。
        img.classList.remove("pop");
        void img.offsetWidth;
        img.classList.add("pop");
      }
      clearTimeout(PET.holdTimer);
      if (opts.hold) {
        PET.holdTimer = setTimeout(() => {
          if (PET.mood === next) setMood(opts.fallback || "idle");
        }, opts.hold);
      }
    }
    function say(text, ms) {
      if (!state.petBubble || !text) return;
      // 桌面端那只也一起说：她不在这个页面里，靠宿主写状态文件同步过去。
      pushDesktop(text, PET.mood);
      const bubble = petRoot ? petRoot.querySelector(".pet-bubble") : null;
      if (!bubble) return;
      bubble.textContent = text;
      bubble.classList.add("show");
      clearTimeout(PET.bubbleTimer);
      PET.bubbleTimer = setTimeout(
        () => bubble.classList.remove("show"),
        typeof ms === "number" ? ms : Math.max(2600, Math.min(8000, text.length * 220))
      );
    }

    /** 每天第一次见面：报个到，顺便把「认识第几天」算出来。 */
    function dailyRitual() {
      const today = new Date().toDateString();
      if (state.petDay !== today) {
        state.petDay = today;
        state.petTodayPokes = 0;
        PET.greetedToday = false;
      }
      if (!state.petMetAt) state.petMetAt = Date.now();
      persist();
      if (!PET.greetedToday) {
        PET.greetedToday = true;
        const greeted = pick("greet." + daySlot()) || pick("greet.morning");
        setTimeout(() => {
          // 安静时段不打招呼：凌晨三点弹一句「早安」比不说话更烦。
          if (quietNow()) return;
          setMood("happy", { hold: 3200 });
          say(greeted, 6000);
        }, 900);
      }
    }
    function daysKnown() {
      if (!state.petMetAt) return 0;
      return Math.max(0, Math.floor((Date.now() - state.petMetAt) / 86400000));
    }

    function personalityReaction(kind) {
      const id = currentPetSkin().id;
      if (id === "nuonuo" && kind === "double") {
        setMood("special", { hold: 1800 });
        say(fill("{name}翻个肚皮给你看！"));
        petRoot?.classList.add("pet-roll");
        setTimeout(() => petRoot?.classList.remove("pet-roll"), 650);
        return true;
      }
      if (id === "wanwan" && kind === "cat") {
        setMood("special", { hold: 1800 });
        say("小猫咪伸懒腰啦");
        petRoot?.classList.add("cat-stretch");
        setTimeout(() => petRoot?.classList.remove("cat-stretch"), 900);
        return true;
      }
      if (id === "renzai" && kind === "triple") {
        setMood("peek", { hold: 1200 });
        say("帽子里躲一会儿");
        petRoot?.classList.add("hood-hide");
        setTimeout(() => petRoot?.classList.remove("hood-hide"), 1100);
        return true;
      }
      if (id === "aowu" && kind === "tail") {
        setMood("surprised", { hold: 1400 });
        say("嗷！尾巴不要突然碰呀");
        setTimeout(() => { setMood("happy", { hold: 1600 }); say("好啦，重新振作！"); }, 500);
        return true;
      }
      if (id === "xiu" && kind === "cloud") { setMood("special", { hold: 1800 }); say("云鹤，出来绕一圈"); return true; }
      if (id === "xiu" && kind === "leaf") { setMood("shy", { hold: 1500 }); say("一叶落在你指尖"); const leaf = document.createElement("span"); leaf.className = "pet-leaf-float"; leaf.textContent = "🍃"; leaf.style.left = `${Math.max(0, (PET.lastPointer?.x || 0) - 12)}px`; leaf.style.top = `${Math.max(0, (PET.lastPointer?.y || 0) - 24)}px`; document.body.appendChild(leaf); setTimeout(() => leaf.remove?.(), 900); return true; }
      if (id === "xiu" && kind === "triple") { setMood("shy", { hold: 2200 }); say(fill("{name}被你看得有些不好意思")); petRoot?.classList.add("xiu-shy-float"); setTimeout(() => petRoot?.classList.remove("xiu-shy-float"), 1300); return true; }
      if (id === "bo" && kind === "cup") { setMood("happy", { hold: 1600 }); say("想尝尝？这茶……挺浓的。"); return true; }
      if (id === "bo" && kind === "pony") { setMood("special", { hold: 1700 }); say(fill("哎——头发不能乱，{name}的体面全靠它。")); return true; }
      if (id === "bo" && kind === "glasses") { setMood("shy", { hold: 1800 }); say("别看了，再看……我可要收费了。"); return true; }
      return false;
    }

    function onPoke() {
      const now = Date.now();
      PET.lastPoke = now;
      PET.pokes = PET.pokes.filter((at) => now - at < 2000);
      PET.pokes.push(now);
      state.petTodayPokes = (state.petTodayPokes || 0) + 1;
      // localStorage 同步写盘可能阻塞绘制；先展示点击反应，计数稍后保存。
      setTimeout(persist, 50);

      if (PET.pokes.length >= 4) {
        PET.pokes = [];
        setMood("sulk", { hold: 4200 });
        say(pick("sulk"));
        return;
      }
      // 一天里被戳得越多，越容易害羞 —— 一开始是新鲜，后来会不好意思
      const shyChance = Math.min(0.45, 0.16 + (state.petTodayPokes || 0) * 0.03);
      if (Math.random() < shyChance) {
        setMood("shy", { hold: 3400 });
        say(pick("shy"));
      } else {
        setMood("happy", { hold: 2600 });
        say(pick("poke"));
      }
    }

    // ── 桌宠：转身 ──────────────────────────────────────────────────────────
    /** 掐掉正在播的转身，把 img 交还给 setMood。 */
    function cancelTurn() {
      if (!PET.turning) return;
      PET.turning = false;
      clearTimeout(PET.turnTimer);
      const img = petRoot ? petRoot.querySelector(".pet-img") : null;
      if (img) img.classList.remove("turning");
    }

    /**
     * 转身。
     *
     * 素材只有四个朝向（正/右/背/左），慢放一定穿帮——看得出是「卡片翻面」。
     * 所以整圈压在 0.44 秒里，快到来不及分辨中间那两帧。
     * 日常自发的动作改走「侧头看一眼」：只有两帧，放慢到 280ms，观感反而成立。
     *
     * 这里直接改 img.src，不走 setMood —— setMood 每换一次都带一下弹跳，
     * 每帧都弹就成了抽搐。
     *
     * @param {{ full?: boolean, onDone?: Function }} [options]
     *   full：true=整圈（默认）；false=侧头看一眼再转回来。
     *   onDone：收尾回调，此时已经回到进入前的形态。
     */
    function turnPet(options) {
      const opts = options || {};
      const full = opts.full !== false;
      const onDone = typeof opts.onDone === "function" ? opts.onDone : null;
      if (!state.petEnabled) {
        onDone?.();
        return;
      }
      const img = petRoot ? petRoot.querySelector(".pet-img") : null;
      if (!img || PET.turning) {
        onDone?.();
        return;
      }

      const frames = full ? (currentPetSkin().id === "starlight" ? TURN_SEQUENCE : ["peek", "special", "idle"]) : ["peek"];
      const stepMs = full ? TURN_STEP_MS : 280;
      const restore = PET.mood;

      PET.turning = true;
      clearTimeout(PET.turnTimer);
      img.classList.add("turning");

      let index = 0;
      const step = () => {
        if (!PET.turning) return;
        if (index >= frames.length) {
          PET.turning = false;
          img.classList.remove("turning");
          // 整圈收尾那一帧本来就是 idle，和 restore 撞了就不必再赋一次 src
          paintPetAsset(img, restore, currentPetSkin().id);
          onDone?.();
          return;
        }
        const frame = frames[index];
        index += 1;
        paintPetAsset(img, frame, currentPetSkin().id);
        PET.turnTimer = setTimeout(step, stepMs);
      };
      step();
    }

    /**
     * 待机时自己动一下。
     * 不动的桌宠就是一张贴纸 —— 但也不能一直转，那叫风扇。
     * 平均一分半动一次，多数是侧头，偶尔才整圈。
     */
    function scheduleTurn() {
      clearInterval(PET.turnInterval);
      PET.turnInterval = setInterval(() => {
        if (!stillLive()) {
          clearInterval(PET.turnInterval);
          return;
        }
        if (!state.petEnabled || PET.turning || PET.mood !== "idle") return;
        const roll = Math.random();
        if (roll < 0.18) turnPet({ full: true });
        else if (roll < 0.46) turnPet({ full: false });
      }, 30000);
    }

    function onPat() {
      setMood("shy", { hold: 2800 });
      say(pick("pat"));
    }

    function onDrop() {
      snapToEdge();
      setMood("happy", { hold: 2200 });
      say(pick("drag"));
    }

    /**
     * 贴边。
     *
     * 松手时离屏幕边缘够近就贴上去，留 10px 不糊在边上。
     * 这一下比多写十句台词有用 —— 她变得像是「待在这块屏幕边上」，
     * 而不是一坨飘在半空的贴纸。
     *
     * 只吸附上下左右四条边，不加磁力、不做惯性，位置仍写回 state。
     */
    /**
     * 贴边的纯计算部分：给一组坐标和视口，返回贴完的坐标。
     *
     * 拆出来是为了能测 —— 真去量 offsetWidth / innerWidth 的话，
     * 假 DOM 和真浏览器得出的数不一样，测出来的东西不可信。
     */
    function snapPosition(input) {
      const THRESHOLD = 26;
      const MARGIN = 10;
      const width = Math.max(0, Number(input?.width) || 0);
      const height = Math.max(0, Number(input?.height) || 0);
      const viewWidth = Math.max(0, Number(input?.viewWidth) || 0);
      const viewHeight = Math.max(0, Number(input?.viewHeight) || 0);
      const maxX = Math.max(0, viewWidth - width);
      const maxY = Math.max(0, viewHeight - height);
      let x = Math.max(0, Math.min(maxX, Number(input?.x) || 0));
      let y = Math.max(0, Math.min(maxY, Number(input?.y) || 0));
      const movedX = x <= THRESHOLD || x >= maxX - THRESHOLD;
      const movedY = y <= THRESHOLD || y >= maxY - THRESHOLD;
      if (x <= THRESHOLD) x = Math.min(MARGIN, maxX);
      else if (x >= maxX - THRESHOLD) x = Math.max(maxX - MARGIN, 0);
      if (y <= THRESHOLD) y = Math.min(MARGIN, maxY);
      else if (y >= maxY - THRESHOLD) y = Math.max(maxY - MARGIN, 0);
      return { x: Math.round(x), y: Math.round(y), snappedX: movedX, snappedY: movedY };
    }

    function snapToEdge() {
      if (!petRoot || state.petX === null || state.petY === null) return;
      const el = petRoot.querySelector(".dsh-skin-pet");
      if (!el) return;
      const next = snapPosition({
        x: state.petX,
        y: state.petY,
        width: el.offsetWidth || 120,
        height: el.offsetHeight || 132,
        viewWidth: innerWidth,
        viewHeight: innerHeight,
      });
      if (next.x === state.petX && next.y === state.petY) return;
      state.petX = next.x;
      state.petY = next.y;
      el.style.left = `${state.petX}px`;
      el.style.top = `${state.petY}px`;
      persist();
    }

    // ── 桌宠：甩动（借 dsh-chatting-pet 的手感） ────────────────────────────
    /**
     * 甩出去：松手速度 → 重力 → 碰边反弹 → 摩擦停下。
     *
     * 只跑一条 rAF 循环，不挂 CSS 动画（位移要写回 state 落盘，动画结束后位置必须
     * 和真实坐标一致）。环境里没有 rAF（冒烟/假 DOM）就直接走 onDrop，不抛异常。
     */
    function throwPet(vx, vy) {
      const el = petRoot ? petRoot.querySelector(".dsh-skin-pet") : null;
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
      if (!el || !raf) {
        onDrop();
        return;
      }
      const now0 = typeof performance !== "undefined" && performance.now ? () => performance.now() : () => Date.now();
      const width = el.offsetWidth || 120;
      const height = el.offsetHeight || 132;
      let x = el.offsetLeft;
      let y = el.offsetTop;
      let ix = Math.max(-2200, Math.min(2200, vx));
      let iy = Math.max(-2200, Math.min(2200, vy));
      let last = now0();
      const GRAVITY = 2400;
      const BOUNCE = 0.4;
      setMood("sulk", { hold: 2600 });

      const step = (now) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
        last = now;
        iy += GRAVITY * dt;
        ix *= 0.985;
        x += ix * dt;
        y += iy * dt;

        const floor = Math.max(0, innerHeight - height - 6);
        const right = Math.max(0, innerWidth - width);
        if (y >= floor) {
          y = floor;
          // 触地：竖直速度反弹、水平速度被地面吃掉一部分
          iy = -iy * BOUNCE;
          ix *= 0.78;
        }
        if (x <= 0) { x = 0; ix = Math.abs(ix) * 0.5; }
        if (x >= right) { x = right; ix = -Math.abs(ix) * 0.5; }

        state.petX = Math.round(x);
        state.petY = Math.round(y);
        el.style.left = `${state.petX}px`;
        el.style.top = `${state.petY}px`;

        const settled = Math.abs(iy) < 70 && y >= floor - 1 && Math.abs(ix) < 45;
        if (settled) {
          PET.throwRaf = null;
          persist();
          onDrop();
          return;
        }
        PET.throwRaf = raf(step);
      };
      if (PET.throwRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(PET.throwRaf);
      PET.throwRaf = raf(step);
    }

    /** 从最近的指针样本里估松手速度（px/s）；样本太旧或太少就当没甩。 */
    function releaseVelocity(samples) {
      if (!Array.isArray(samples) || samples.length < 2) return null;
      const last = samples[samples.length - 1];
      const first = samples[0];
      const span = last.t - first.t;
      if (!(span > 0) || span > 140) return null;
      const vx = ((last.x - first.x) / span) * 1000;
      const vy = ((last.y - first.y) / span) * 1000;
      if (Math.hypot(vx, vy) < 380) return null; // 慢慢挪过去的不算甩
      return { vx, vy };
    }

    // ── 桌宠：工作状态联动 ─────────────────────────────────────────────────
    /**
     * 跟着会话状态变形态，并在「跑完 / 卡在等你」时把**具体发生了什么**说出来。
     *
     * 数据来自宿主下发的 props（useSessionStatus / useSessions）。**读不到就什么都不做** ——
     * 这条功能是加分项，没有它桌宠也要照常活着。
     *
     * 克制规则：
     *   1. 只认「跑起来 / 等你处理 / 刚完成」三种，其余忽略；
     *   2. 完场播报带任务名、用时、tokens —— 只说「跑完啦」等于没说；
     *   3. 等你的那个一直没人管，就隔三分钟再提一次（最多三次），
     *      因为「有个东西卡在等你」是最容易被界面吞掉的信息；
     *   4. 用户关掉「跟随工作状态」后彻底不读状态、不变形态。
     */
    function observeSessions(statuses, list) {
      if (!state.petWork || !state.petEnabled) return;
      if (!statuses || typeof statuses.get !== "function" || !list || !Array.isArray(list.ids)) return;
      // 留一份最新快照：用量晚一拍才到时要回来重读（见 announceFinished）
      PET.lastList = list;
      const now = Date.now();
      const next = new Map();
      const pendingNow = [];
      let running = 0;
      let waiting = 0;
      let done = 0;
      for (const id of list.ids) {
        const session = (list.byId && list.byId[id]) || {};
        // 子代理不单独算一档：它跑的时候父会话本来就在跑。
        if (session.blank === true || session.origin === "subagent") continue;
        const status = statuses.get(id) || null;
        const kind = status && status.pendingInteraction
          ? "waiting"
          : status && status.running
            ? "running"
            : status && status.completionUnread
              ? "done"
              : "idle";
        next.set(id, kind);
        if (kind === "running") running += 1;
        else if (kind === "waiting") {
          waiting += 1;
          pendingNow.push({ id, session, pending: status.pendingInteraction });
        } else if (kind === "done") done += 1;
      }

      const prev = PET.seenStatus;
      const finished = [];
      const started = [];
      const waitingNew = [];
      for (const [id, kind] of next) {
        const was = prev.get(id);
        if (kind === "running") {
          if (!PET.runningSince.has(id)) {
            PET.runningSince.set(id, now);
            // 记下这一轮开始前的累计用量：播报时做差，报的是「本次」而不是「这辈子」
            PET.usageBase.set(id, usageTotal(usageForSession(list, id)));
          }
          if (was !== "running") started.push(id);
        }
        if (kind === "waiting" && was !== "waiting") waitingNew.push(id);
        if (kind === "done" && was === "running") finished.push(id);
      }
      // 跑完/停下就把起点删掉，否则下次「跑起来」会算上中间空闲的时间
      for (const id of [...PET.runningSince.keys()]) {
        if (next.get(id) !== "running") {
          if (!finished.includes(id)) PET.runningSince.delete(id);
        }
      }

      PET.seenStatus = next;
      const before = PET.sessionCounts;
      PET.sessionCounts = { running, waiting, done };
      // 计数变了就通知面板重绘一次（面板里有一行「联动中」的状态读数）。
      if (!before || before.running !== running || before.waiting !== waiting || before.done !== done) {
        refreshPanel();
      }

      if (finished.length > 0) {
        announceFinished(list, finished[0]);
      } else if (waitingNew.length > 0) {
        announceWaiting(list, waitingNew[0], pendingNow);
      } else if (started.length > 0) {
        // 开工不吭声：她切到专注形态安静陪着就够了。
        if (PET.mood === "idle" || PET.mood === "focus") setMood("focus");
      } else if (running === 0 && waiting === 0 && PET.mood === "focus") {
        setMood("idle");
      }

      // 一直被晾着的等待：每 3 分钟提一次，最多三次，之后闭嘴（反复念等于噪音）
      if (waitingNew.length === 0 && pendingNow.length > 0) {
        for (const item of pendingNow) {
          const seen = PET.waitingSeen.get(item.id);
          if (!seen) {
            PET.waitingSeen.set(item.id, { since: now, nagged: 0 });
            continue;
          }
          if (seen.nagged >= 3) continue;
          if (now - seen.since < 180000) continue;
          seen.since = now;
          seen.nagged += 1;
          setMood("sulk", { hold: 3600 });
          const text = `《${shortTitle(item.session, item.id)}》还在等你：${pendingLabel(item.pending)}`;
          say(text, 7000);
          break;
        }
      }
      for (const id of [...PET.waitingSeen.keys()]) {
        if (!next.has(id) || next.get(id) !== "waiting") PET.waitingSeen.delete(id);
      }
    }

    /**
     * 跑完播报：任务名 + 用时 + tokens。拿不到的字段就不说，不编。
     *
     * 有个真实时序问题：会话状态从 running 变 false 的那一拍，`tokenUsage` 投影常常还
     * 没推下来（宿主在会话日志上算完才广播）。第一版当场读数 → 播报永远没有 tokens。
     * 现在缺数字就等 2.5 秒、用最新快照重读一次；还是没有就照实不说，绝不超过两句。
     */
    function announceFinished(list, id) {
      const session = (list.byId && list.byId[id]) || {};
      const title = shortTitle(session, id);
      const since = PET.runningSince.get(id);
      const duration = since ? formatDuration(Date.now() - since) : "";
      PET.runningSince.delete(id);
      /**
       * 「本次消耗」= 这一轮跑完时的累计用量 - 这一轮开始时的累计用量。
       *
       * 投影里的 `tokenUsage` 是**整个会话**的累计：同一个会话跑第五轮时直接读它，
       * 报出来的数字会比这一轮实际消耗大几倍，用户只会觉得在骗他。
       * 拿不到起点（插件是这轮中途才挂上的）或算出负数就退回累计值 ——
       * 宁可多报，也不要报个 0 假装这轮没花钱。
       */
      const base = PET.usageBase.get(id);
      PET.usageBase.delete(id);
      const readTotal = (source) => {
        const cumulative = usageTotal(usageForSession(source, id));
        if (cumulative === null) return null;
        return Number.isFinite(base) && cumulative - base > 0 ? cumulative - base : cumulative;
      };
      finishAnnounce(list, id, title, duration, readTotal, false);
    }

    function finishAnnounce(list, id, title, duration, readTotal, retried) {
      const total = readTotal(list);
      if (total === null && !retried) {
        setTimeout(() => {
          const fresh = PET.lastList || list;
          const session = (fresh.byId && fresh.byId[id]) || {};
          finishAnnounce(fresh, id, shortTitle(session, id) || title, duration, readTotal, true);
        }, 2500);
        return;
      }
      const tokens = formatTokens(total);
      const parts = [`《${title}》跑完了`];
      if (duration) parts.push(`用时 ${duration}`);
      if (tokens) parts.push(`${tokens} tokens`);
      PET.lastUsage = { id, total, usage: usageForSession(list, id), at: Date.now() };
      refreshPanel();
      setMood("happy", { hold: 3200 });
      const line = parts.join(" · ");
      PET.lastSpoken = line;
      say(line, 9000);
    }

    function announceWaiting(list, id, pendingNow) {
      const item = pendingNow.find((entry) => entry.id === id) || {};
      const session = item.session || (list.byId && list.byId[id]) || {};
      PET.waitingSeen.set(id, { since: Date.now(), nagged: 0 });
      setMood("sulk", { hold: 4200 });
      const line = `《${shortTitle(session, id)}》在等你：${pendingLabel(item.pending)}`;
      PET.lastSpoken = line;
      say(line, 8000);
    }

    /** 会话标题：截短到能塞进一个气泡，不然一行字就把气泡撑爆。 */
    function shortTitle(session, id) {
      const raw = String(session?.displayTitle ?? session?.title ?? "").trim();
      if (!raw) return String(id).slice(0, 6);
      return raw.length > 16 ? `${raw.slice(0, 16)}…` : raw;
    }

    /** 待处理交互的短标签（和任务小管家同一套词根归类，认不出来就中性表述）。 */
    function pendingLabel(pending) {
      const kind = String(pending && typeof pending === "object" ? pending.kind : "");
      if (/approv|permission|confirm/i.test(kind)) return "待批准";
      if (/plan/i.test(kind)) return "计划待审";
      if (/question|answer|ask|input/i.test(kind)) return "待回答";
      return "等你处理";
    }

    function formatDuration(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return "";
      // floor 而不是 round：500ms 说「1 秒」是四舍五入出来的谎，说「不到一秒」又太啰嗦
      const total = Math.floor(ms / 1000);
      if (total < 1) return "";
      if (total < 60) return `${total} 秒`;
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
      return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
    }

    /**
     * 归一化宿主下发的 usage。只接受有限的非负数；认不出来就是 null（不估数）。
     *
     * 这个宿主里同一件事有三套命名，和任务小管家（dsh-plugin-task-radar）是同一套契约：
     *   1. `tokenUsage` 投影（权威）：`{ uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`；
     *   2. Trajectory 里的短名：`{ input, output, reasoning, cacheRead, cacheWrite }`；
     *   3. provider 原样透传：`{ prompt_tokens, completion_tokens, ... }`。
     *
     * **注意**：我第一版只认了第 1 套的长名，于是「跑完播报」永远拿不到数字 —— 因为
     * trajectory 用的是短名 `input`，投影用的是 `uncachedInputTokens`。两边都漏，就静默失效。
     */
    function normalizeUsage(value) {
      if (!value || typeof value !== "object") return null;
      const read = (...names) => {
        for (const name of names) {
          const raw = value[name];
          if (raw === undefined || raw === null) continue;
          const number = Number(raw);
          if (Number.isFinite(number) && number >= 0) return number;
        }
        return undefined;
      };
      const usage = {
        inputTokens: read("uncachedInputTokens", "inputTokens", "input", "input_tokens", "prompt_tokens"),
        outputTokens: read("outputTokens", "output", "output_tokens", "completion_tokens"),
        reasoningTokens: read("reasoningTokens", "reasoning", "reasoning_tokens"),
        cacheReadTokens: read("cacheReadTokens", "cacheRead", "cache_read_input_tokens", "cache_read_tokens"),
        cacheWriteTokens: read("cacheWriteTokens", "cacheWrite", "cache_creation_input_tokens", "cache_write_tokens"),
        totalTokens: read("totalTokens", "total_tokens"),
      };
      if (!Object.values(usage).some((number) => number !== undefined)) return null;
      // 输入不含缓存 ⇔ 缓存在另一个桶里；OpenAI 那种 prompt_tokens 已经把缓存含进去了。
      const cacheOutsideInput = (usage.cacheReadTokens !== undefined || usage.cacheWriteTokens !== undefined)
        && value.prompt_tokens === undefined
        && value.promptTokens === undefined
        && value.cached_tokens === undefined;
      if (cacheOutsideInput) usage.inputSeparate = true;
      return usage;
    }

    /**
     * 展示用 token 总数。
     *
     * 宿主的四个桶互不相交（uncached / cacheRead / cacheWrite / output），所以缓存读写在
     * 「输入不含缓存」时单独加；reasoning 属于输出明细，永远不重复加 —— 早先我把它
     * 和 input+output 相加，数字会虚高。
     */
    function usageTotal(usage) {
      if (!usage) return null;
      if (usage.totalTokens !== undefined) return Math.round(usage.totalTokens);
      const input = usage.inputTokens ?? 0;
      const cache = usage.inputSeparate ? (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) : 0;
      const output = usage.outputTokens ?? 0;
      return input + cache + output > 0 ? Math.round(input + cache + output) : null;
    }

    function formatTokens(value) {
      if (!Number.isFinite(value)) return "";
      const number = Math.max(0, Math.round(value));
      if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
      // 一千到十万之间保留一位小数：12.3K 有信息量，12K 把 300 抹掉了
      if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}K`;
      return number.toLocaleString("en-US");
    }

    /** 从 trajectory 快照里取累计用量（最近一次请求 + 全会话累计）。 */
    function trajectoryUsage(snapshot) {
      const requests = Array.isArray(snapshot?.requests) ? snapshot.requests : [];
      const usages = requests
        .filter((request) => request?.purpose !== "compaction")
        .map((request) => normalizeUsage(request?.usage))
        .filter(Boolean);
      if (usages.length === 0) return { usage: null, cumulativeUsage: null };
      const cumulative = {};
      for (const usage of usages) {
        for (const name of ["inputTokens", "outputTokens", "reasoningTokens", "cacheReadTokens", "cacheWriteTokens"]) {
          if (usage[name] !== undefined) cumulative[name] = (cumulative[name] ?? 0) + usage[name];
        }
        if (usage.inputSeparate) cumulative.inputSeparate = true;
      }
      const total = usageTotal(cumulative);
      if (total !== null) cumulative.totalTokens = total;
      return { usage: usages.at(-1) ?? null, cumulativeUsage: cumulative };
    }

    /**
     * 取这个会话的用量（「这轮一共烧了多少」优先，那才是用户想知道的那个数）。
     *
     * 首选会话投影 `values.tokenUsage.totals ?? values.tokenUsage`：宿主在会话日志上累计，
     * 跨刷新、跨标签页都对，而且列表里每个会话都带着，不用先打开会话。
     * 拿不到再退到 trajectory 快照；都没有就是 null —— 播报里那段直接不出现。
     */
    function usageForSession(list, id) {
      try {
        const projections = list?.projectionsBySession ? list.projectionsBySession[id] : undefined;
        const values = projections?.values ?? {};
        const canonical = normalizeUsage(values.tokenUsage?.totals ?? values.tokenUsage);
        if (canonical) return canonical;
        const pick = (candidates) => {
          for (const candidate of candidates) {
            const usage = normalizeUsage(candidate);
            if (usage) return usage;
          }
          return null;
        };
        const fromProjection = pick([
          values.cumulativeUsage,
          values.sessionUsage,
          values.usage,
          values.requestUsage,
          values.lastUsage,
          projections?.cumulativeUsage,
        ]);
        if (fromProjection) return fromProjection;
      } catch {
        /* 投影结构变了就当没有 */
      }
      try {
        const binding = runtimeContext?.uiConversation?.binding?.(id) ?? runtimeContext?.get?.("uiConversation")?.binding?.(id);
        const snapshot = binding?.target?.("trajectory")?.getSnapshot?.();
        const { cumulativeUsage } = trajectoryUsage(snapshot);
        if (cumulativeUsage) return cumulativeUsage;
      } catch {
        /* trajectory 没挂就当没有 */
      }
      return null;
    }

    function speakWork(bucket) {
      const now = Date.now();
      if (now - PET.lastWorkLine < 90000) return;
      const line = pick(bucket);
      if (!line) return;
      PET.lastWorkLine = now;
      say(line, 4600);
    }

    /** 随机独白：安静久了说一句，让它不像一张贴纸。 */
    function scheduleIdleLine() {
      clearTimeout(PET.idleTimer);
      const delay = 70000 + Math.random() * 110000; // 1.2 ~ 3 分钟
      PET.idleTimer = setTimeout(() => {
        if (!stillLive()) return;
        if (PET.mood === "idle" && state.petEnabled && !PET.away && !quietNow()) {
          // 安静时段里她还在，只是不出声 —— 独白是热闹，不是信息。
          // 6% 抽到「好运」彩蛋。概率压在个位数才有「今天运气不错」的感觉，
          // 天天听见就不叫彩蛋了。
          const line = Math.random() < 0.06 ? pick("lucky") : pick("idle");
          say(line, 5200);
        }
        scheduleIdleLine();
      }, delay);
    }

    /**
     * 三种「时间感」都靠这一个心跳：走开、久坐、陪摸鱼。
     *
     * 久坐提醒只在「人确实在机器前」时才提醒 —— 最近两分钟内有键鼠输入。
     * 人不在还弹提醒，那是骚扰。
     */
    function watchSitting() {
      /**
       * 任何键鼠动作都算「在」。顺带处理回来那一刻：
       * 只有她之前标记过 away 才打招呼，否则你每挪一下鼠标她都要说句话。
       */
      const markInput = () => {
        const now = Date.now();
        if (PET.away) {
          PET.away = false;
          if (state.petEnabled && !quietNow()) {
            setMood("happy", { hold: 2400 });
            say(pick("back"), 5000);
          }
        }
        PET.lastInput = now;
      };
      // 用可选链：宿主万一跑在精简 DOM 环境（或冒烟测试的假 document）里，
      // 少一个 addEventListener 不该把整只桌宠带走。
      //
      // 这两个监听只能挂一次：收起桌宠再打开会重新走一遍「启动」，
      // 每开合一次就多一份监听 + 多一个久坐心跳，久坐提醒会成倍地弹。
      if (!PET.watching) {
        PET.watching = true;
        document.addEventListener?.("pointermove", markInput, { passive: true });
        document.addEventListener?.("keydown", markInput, { passive: true });
      }
      PET.lastInput = Date.now();
      PET.lastBreak = Date.now();

      clearInterval(PET.sitInterval);
      PET.sitInterval = setInterval(() => {
        if (!stillLive()) {
          clearInterval(PET.sitInterval);
          return;
        }
        if (!state.petEnabled) return;
        const now = Date.now();

        // 走开了：半小时没有任何输入。她安静下来，也不提醒你回来坐好。
        if (now - PET.lastInput > 30 * 60000) {
          PET.away = true;
          return;
        }

        const present = now - PET.lastInput < 120000;

        if (state.petRest && present && !quietNow() && now - PET.lastBreak > 45 * 60000) {
          PET.lastBreak = now;
          setMood("sad", { hold: 3000 });
          say(pick("rest"), 7000);
          return;
        }

        // 陪摸鱼：你连着忙 20 分钟，一直没空理她。
        // 她切到专注形态、一声不吭 —— 这时候冒泡就是打扰，安静本身就是陪伴。
        if (present && PET.mood === "idle" && now - PET.lastPoke > 20 * 60000) {
          setMood("focus");
        }
      }, 60000);
    }

    // ── 桌宠：DOM ───────────────────────────────────────────────────────────
    function renderPet() {
      // 宿主可能在热重载/面板重挂时再次执行 apply。无论模块是否被重新求值，
      // 页面上都只允许一个固定 id 的桌宠根节点，不能每次 append 一只新的。
      const existing = document.querySelectorAll?.("#dsh-skin-pet-root") || [];
      for (let index = 1; index < existing.length; index += 1) existing[index].remove?.();
      const attached = typeof document.body.contains === "function" ? document.body.contains(petRoot) : Boolean(petRoot);
      if (!petRoot || !attached) {
        petRoot = document.getElementById("dsh-skin-pet-root") || RUNTIME.petRoot || document.createElement("div");
        petRoot.id = "dsh-skin-pet-root";
        RUNTIME.petRoot = petRoot;
        if (!petRoot.parentNode) document.body.appendChild(petRoot);
      }
      if (!state.petEnabled) {
        petRoot.innerHTML = "";
        /**
         * 收起来的时候要把「已经画过哪张图」这件事也忘掉。
         *
         * 以前只清 DOM：`PET.renderedAsset` 还留着上一条图片地址。再打开时
         * 结构是新建的（`<img>` 没有 src），而 setMood / 这里的对齐逻辑都靠
         * `PET.renderedAsset !== want` 判断要不要写 —— 两者相等就一笔都不写，
         * 于是图是空的（2026-11-05 用户报的「关掉再打开，打开失败」）。
         * `PET.booted` 同理会挡住定时器的重启，她就算显示出来也一动不动。
         */
        PET.renderedAsset = null;
        PET.booted = false;
        return;
      }

      const size = Math.max(64, Math.min(240, Number(state.petSize) || 132));
      const petSkin = currentPetSkin();
      preloadPetFrames(petSkin.id);
      petRoot.dataset.petSkin = petSkin.id;
      if (!petRoot.querySelector(".dsh-skin-pet")) {
        // 首次装配：结构一次建好，之后只改 src 和位置
        petRoot.innerHTML = [
          '<div class="dsh-skin-pet">',
          '<div class="pet-bubble"></div>',
          '<div class="pet-body"><img class="pet-img" alt="" draggable="false" /><button class="pet-cat-target" type="button" aria-label="摸摸晚晚的小猫" tabindex="0"></button><button class="pet-tail-target" type="button" aria-label="摸摸嗷呜的尾巴" tabindex="0"></button><button class="pet-cup-target" type="button" aria-label="端起薄老师的茶杯" tabindex="0"></button><button class="pet-pony-target" type="button" aria-label="摸摸薄老师的马尾" tabindex="0"></button><button class="pet-cloud-target" type="button" aria-label="召唤岫的云鹤" tabindex="0"></button><button class="pet-leaf-target" type="button" aria-label="触碰岫的落叶" tabindex="0"></button><button class="pet-glasses-target" type="button" aria-label="看看薄老师的眼镜" tabindex="0"></button></div>',
          "</div>",
        ].join("");
        wirePet(petRoot.querySelector(".dsh-skin-pet"));
        setMood(PET.mood);
        // 每个实例自己起一份定时器：旧实例的会被 stillLive() 判死自己停，
        // 新实例必须接上，否则重挂之后桌宠就再也不自己动了。
        if (!PET.booted) {
          PET.booted = true;
          RUNTIME.booted = true;
          // 见面礼整页只来一次：重挂面板、重连之后不该又打一遍招呼。
          if (!RUNTIME.greeted) {
            RUNTIME.greeted = true;
            dailyRitual();
          }
          scheduleIdleLine();
          scheduleTurn();
          watchSitting();
        }
      }

      const el = petRoot.querySelector(".dsh-skin-pet");
      if (!el) return;
      /**
       * 换皮肤要立刻换图。
       *
       * 以前只有 `setMood` 在**形态变了**的时候才写 src —— 单纯换皮肤时
       * mood 没变，代码就什么都不做；于是面板上下拉都选了，桌宠还是原来那只，
       * 非得去点一下形态图才刷出来。这里按「应该显示的图」对齐，换皮肤即时生效。
       */
      const image = petRoot.querySelector(".pet-img");
      if (image) {
        image.style.transform = `scale(${petSkin.scale || 1})`;
        // 用 DOM 上的真实 src 对齐（不是缓存）：收起过了再打开时元素是新的。
        paintPetAsset(image, PET.mood, petSkin.id);
      }
      el.style.setProperty("--pet-size", `${size}px`);
      if (state.petX === null || state.petY === null) {
        el.style.left = `${Math.max(16, innerWidth - size * 0.78 - 26)}px`;
        el.style.top = `${Math.max(70, innerHeight - size - 38)}px`;
      } else {
        el.style.left = `${state.petX}px`;
        el.style.top = `${state.petY}px`;
      }
    }

    function wirePet(el) {
      let drag = null;
      let moved = false;
      // 键盘也能理她：Tab 到桌宠上按 Enter / 空格等于戳一下。
      try {
        el.tabIndex = 0;
        el.setAttribute?.("role", "button");
        el.setAttribute?.("aria-label", "桌宠，按回车逗一下");
      } catch {
        /* 精简 DOM 里没有这些属性就算了 */
      }
      el.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
        event.preventDefault?.();
        onPoke();
      });
      PET.lastPointer = { x: 0, y: 0 };
      /** 最近几个指针样本，松手时用来估甩动速度。 */
      let samples = [];

      el.addEventListener("pointerdown", (event) => {
        PET.lastPointer = { x: event.clientX || 0, y: event.clientY || 0 };
        if (event.button !== 0) return;
        // 按下就反馈，不等抬手、连击判定或图片加载完成。
        const image = petRoot.querySelector(".pet-img");
        if (image) {
          image.classList.remove("pop");
          void image.offsetWidth;
          image.classList.add("pop");
        }
        // 独立互动按钮自己处理点击，不进入拖拽或普通戳一戳。
        if (event.target?.closest?.("button")) return;
        drag = {
          x: event.clientX,
          y: event.clientY,
          left: el.offsetLeft,
          top: el.offsetTop,
        };
        moved = false;
        el.setPointerCapture(event.pointerId);
        el.classList.add("dragging");
      });

      el.addEventListener("pointermove", (event) => {
        PET.lastPointer = { x: event.clientX || 0, y: event.clientY || 0 };
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        state.petX = Math.max(0, Math.min(innerWidth - width, drag.left + dx));
        state.petY = Math.max(0, Math.min(innerHeight - height, drag.top + dy));
        el.style.left = `${state.petX}px`;
        el.style.top = `${state.petY}px`;
        // 留最近 5 个样本估松手速度：w 坐标够了就不用再存整条轨迹
        samples.push({ t: Date.now(), x: event.clientX, y: event.clientY });
        if (samples.length > 5) samples.shift();
      });

      el.addEventListener("pointerup", (event) => {
        PET.lastPointer = { x: event?.clientX || PET.lastPointer.x, y: event?.clientY || PET.lastPointer.y };
        if (!drag) return;
        drag = null;
        el.classList.remove("dragging");
        if (moved) {
          persist();
          // 甩出去接着飞，慢慢挪过去就照旧只算「放下」
          const velocity = releaseVelocity(samples);
          samples = [];
          if (velocity) throwPet(velocity.vx, velocity.vy);
          else onDrop();
        } else {
          samples = [];
          onPoke();
        }
      });

      el.addEventListener("pointercancel", () => {
        drag = null;
        samples = [];
        el.classList.remove("dragging");
      });

      el.addEventListener("dblclick", (event) => {
        event.preventDefault();
        if (currentPetSkin().id !== "starlight" && currentPetSkin().id === "nuonuo" && personalityReaction("double")) return;
        // 星辉少女保留原有双击转身。
        turnPet({ full: true, onDone: onPat });
      });

      // 可访问的宠物覆盖目标：晚晚的黑猫可被键盘/点击触发伸懒腰；
      // aowu 的尾部热区用于惊吓后自我整理，不执行任何系统操作。
      const catTarget = el.querySelector?.(".pet-cat-target");
      catTarget?.addEventListener?.("click", () => personalityReaction("cat"));
      catTarget?.addEventListener?.("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); personalityReaction("cat"); }
      });
      const tailTarget = el.querySelector?.(".pet-tail-target");
      tailTarget?.addEventListener?.("click", () => personalityReaction("tail"));
      const cupTarget = el.querySelector?.(".pet-cup-target");
      cupTarget?.addEventListener?.("click", () => personalityReaction("cup"));
      const ponyTarget = el.querySelector?.(".pet-pony-target");
      ponyTarget?.addEventListener?.("click", () => personalityReaction("pony"));
      const cloudTarget = el.querySelector?.(".pet-cloud-target");
      cloudTarget?.addEventListener?.("click", (event) => { event.stopPropagation?.(); personalityReaction("cloud"); });
       const leafTarget = el.querySelector?.(".pet-leaf-target");
       leafTarget?.addEventListener?.("click", (event) => { event.stopPropagation?.(); personalityReaction("leaf"); });
       const glassesTarget = el.querySelector?.(".pet-glasses-target");
       glassesTarget?.addEventListener?.("click", (event) => { event.stopPropagation?.(); personalityReaction("glasses"); });
      let glassesAt = 0;
      el.addEventListener("pointermove", (event) => {
        if (currentPetSkin().id === "bo" && event.clientX > el.offsetLeft + el.offsetWidth * .55 && Date.now() - glassesAt > 5000) { glassesAt = Date.now(); personalityReaction("glasses"); }
      });
      tailTarget?.addEventListener?.("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); personalityReaction("tail"); }
      });

      let tapCount = 0;
      let tapTimer = null;
      el.addEventListener("click", () => {
        tapCount += 1;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => {
          if (tapCount >= 3) personalityReaction("triple");
          tapCount = 0;
        }, 420);
      });

      // 悬停两秒半算「摸头」。真点一下会立刻有反应，但停在那儿不动也是一种表态。
      el.addEventListener("pointerenter", () => {
        clearTimeout(PET.patTimer);
        PET.patTimer = setTimeout(() => {
          if (!drag) onPat();
        }, 2500);
      });
      el.addEventListener("pointerleave", () => clearTimeout(PET.patTimer));

      el.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        // 右键从「只能鼓脸」升级成入口菜单：说不说、转不转、回不回角落、开不开面板，
        // 都不用再去侧栏翻。原来自发的鼓脸反应仍在（菜单里第一项就是「摸摸头」）。
        openPetMenu(event.clientX, event.clientY);
      });
    }

    // ── 桌宠：右键菜单（借 dsh-chatting-pet 的右键入口） ─────────────────────
    function closeOnOutside(event) {
      if (PET.menu && !PET.menu.contains?.(event.target)) closePetMenu();
    }
    function closeOnEsc(event) {
      if (event && (event.key === "Escape" || event.keyCode === 27)) closePetMenu();
    }
    function closePetMenu() {
      if (!PET.menu) return;
      PET.menu.remove?.();
      PET.menu = null;
      document.removeEventListener?.("pointerdown", closeOnOutside, true);
      document.removeEventListener?.("keydown", closeOnEsc, true);
      window.removeEventListener?.("resize", closePetMenu);
      window.removeEventListener?.("scroll", closePetMenu, true);
    }

    /**
     * 打开桌宠菜单。
     *
     * 只做本地动作，不发请求、不写别人的状态。位置按「贴边翻转」夹到视口内，
     * 因为桌宠本身常常就躲在右下角 —— 菜单往右展开会直接出屏。
     */
    function openPetMenu(x, y) {
      closePetMenu();
      if (typeof document === "undefined" || !document.body || typeof document.createElement !== "function") return;
      /** 下一个角色：不用开面板、不用在三层里翻。 */
      const nextSkin = () => {
        const index = PET_SKINS.findIndex((skin) => skin.id === state.petSkin);
        const next = PET_SKINS[(index + 1) % PET_SKINS.length] || PET_SKINS[0];
        state.petSkin = next.id;
        preloadPetFrames(next.id);
        preview();
        setMood("happy", { hold: 1600 });
        say(`${next.label}来了`, 2600);
      };
      const items = [
        {
          label: "摸摸头",
          hint: "右键也算摸一下",
          run: () => {
            setMood("sulk", { hold: 2200 });
            say(pick("context"), 3000);
          },
        },
        {
          label: "说句话",
          run: () => {
            setMood("happy", { hold: 2600 });
            say(pick("idle"), 6000);
          },
        },
        { label: "转一圈", run: () => turnPet({ full: true }) },
        { label: "换个角色（下一个）", run: nextSkin },
        {
          label: state.petBubble ? "关掉气泡" : "打开气泡",
          run: () => {
            state.petBubble = !state.petBubble;
            persist();
            refreshPanel();
          },
        },
        {
          label: "回到角落",
          run: () => {
            state.petX = null;
            state.petY = null;
            persist();
            renderPet();
            refreshPanel();
          },
        },
        {
          label: "主题与外观…",
          run: () => {
            try {
              runtimeContext?.get?.("layout")?.selectPanel?.(PANEL_KEY);
            } catch (error) {
              note("打开主题面板", error);
            }
          },
        },
        {
          label: "藏起来",
          run: () => {
            state.petEnabled = false;
            persist();
            renderPet();
            refreshPanel();
          },
        },
      ];

      const root = document.createElement("div");
      root.className = "dsh-pet-menu";
      root.setAttribute?.("role", "menu");
      root.addEventListener?.("contextmenu", (event) => event.preventDefault?.());
      items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dsh-pet-menu-item";
        button.setAttribute?.("role", "menuitem");
        const text = document.createElement("span");
        text.textContent = item.label;
        button.appendChild(text);
        if (item.hint) {
          const hint = document.createElement("small");
          hint.textContent = item.hint;
          button.appendChild(hint);
        }
        button.addEventListener("click", () => {
          closePetMenu();
          items[items.indexOf(item)].run();
        });
        root.appendChild(button);
      });
      document.body.appendChild(root);
      PET.menu = root;

      // 量完再定位：菜单高度取决于项数，用估算值会把最后一项顶出屏幕
      const box = root.getBoundingClientRect?.() || { width: 176, height: items.length * 32 };
      const width = box.width || 176;
      const height = box.height || items.length * 32;
      const left = Math.max(8, Math.min(x, (innerWidth || 0) - width - 8));
      const top = Math.max(8, Math.min(y, (innerHeight || 0) - height - 8));
      root.style.position = "fixed";
      root.style.left = `${left}px`;
      root.style.top = `${top}px`;

      // 同一个 contextmenu 事件不会再触发 pointerdown，所以这里直接挂监听是安全的
      document.addEventListener?.("pointerdown", closeOnOutside, true);
      document.addEventListener?.("keydown", closeOnEsc, true);
      window.addEventListener?.("resize", closePetMenu);
      window.addEventListener?.("scroll", closePetMenu, true);
    }

    // ── 样式 ────────────────────────────────────────────────────────────────
    function injectStyles() {
      if (document.getElementById("dsh-skin-style")) return;
      const style = document.createElement("style");
      style.id = "dsh-skin-style";
      style.textContent = `
        /* 这层是整个 DSH 的背景，不是插件卡片的背景。放在应用内容下方，
           再由下面的半透明表面把图片透出来。 */
        #dsh-skin-wallpaper{position:fixed;inset:0;z-index:0;background-position:center;pointer-events:none;transition:opacity .2s,filter .2s,background-image .2s;background-color:transparent;transform:scale(1.02);transform-origin:center}
        html[data-dsh-skin] body,body[data-dsh-skin-theme]{background:transparent!important}
        body[data-dsh-skin-theme]{color:var(--dsw-alias-label-primary)}
        /* DSH 的三列布局类名会随构建变化，因此同时保留稳定的语义片段和当前版本类名。 */
        body[data-dsh-skin-wallpaper="true"] [class*="centerCol"],
        body[data-dsh-skin-wallpaper="true"] [class*="sidebarCol"],
        body[data-dsh-skin-wallpaper="true"] [class*="rightbarCol"],
        body[data-dsh-skin-wallpaper="true"] [class*="center-col"],
        body[data-dsh-skin-wallpaper="true"] [class*="sidebar-col"],
        body[data-dsh-skin-wallpaper="true"] [class*="rightbar-col"]{
          background:var(--dsw-alias-bg-base)!important;
          background-color:var(--dsw-alias-bg-base)!important;
          /* 底板是玻璃，但模糊不能大到把图案抹平：
             30px 会把纹理糊成一整片纯色，用户看着就是「设置没生效」。
             插画用 10px（大色块，够用），纯 CSS 纹理用 0（线条必须留得住）。 */
          backdrop-filter:blur(var(--dsh-skin-col-blur,10px)) saturate(1.12);
          -webkit-backdrop-filter:blur(var(--dsh-skin-col-blur,10px)) saturate(1.12)}
        /* 壁纸直接画进三列：侧栏/右栏各有自己的实心底色，只靠背后那层托底会剩下
           两条白边（聊天区透、左右不透）。这里三列共用同一张视口对齐的图，
           遮罩是半透明底板令牌，表现和中间那列一致。 */
        body[data-dsh-skin-wallpaper="true"] [class*="centerCol"],
        body[data-dsh-skin-wallpaper="true"] [class*="sidebarCol"],
        body[data-dsh-skin-wallpaper="true"] [class*="rightbarCol"],
        body[data-dsh-skin-wallpaper="true"] [class*="center-col"],
        body[data-dsh-skin-wallpaper="true"] [class*="sidebar-col"],
        body[data-dsh-skin-wallpaper="true"] [class*="rightbar-col"]{
          background-image:var(--dsh-skin-wallpaper-paint,none)!important;
          background-attachment:fixed!important;
          background-size:var(--dsh-skin-col-size,cover)!important;
          background-position:center!important;
          background-repeat:no-repeat!important}
        /* 宿主的弹窗（审批、选择）打开时，壁纸从三列上撤掉 —— 读那种弹窗时背后不该动。
           但**本插件自己的面板不算**：面板里换壁纸必须能当场看到效果，
           否则用户根本不知道自己切换成功没有（2026-11-05 报的 bug）。
           区分靠 html 上的 .dsh-skin-panel-open 标记，由面板挂载时打上。 */
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-wallpaper="true"] [class*="centerCol"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-wallpaper="true"] [class*="sidebarCol"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-wallpaper="true"] [class*="rightbarCol"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-wallpaper="true"] [class*="center-col"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-wallpaper="true"] [class*="sidebar-col"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-wallpaper="true"] [class*="rightbar-col"]{
          background-image:none!important}
        /* 真实 DSH 0.2.1-rc.5 的 frame / 会话根 / 右侧空宿主还会各自
           继承一层背景。如果它们和三列同时着色，壁纸会被重复叠三次，彩虹
           会退化成一片浅蓝。三列已经是第一层可读表面，这几个布局壳只保留
           透明，让壁纸穿透到列背景；输入区、代码块等内容表面仍由下方规则单独着色。 */
        body[data-dsh-skin-wallpaper="true"] #root [class*="_frame"],
        body[data-dsh-skin-wallpaper="true"] #root [class*="_root"],
        body[data-dsh-skin-wallpaper="true"] #root [class*="_emptyTabHost"]{background:transparent!important;background-color:transparent!important}
        /* 主区内部常见的会话表面和代码块继续使用分层颜色，不能让一张壁纸把文字直接冲掉。
           内容区靠**尺寸**认定（.dsh-skin-area，由 syncContentAreas() 标），不再用
           class*=composer 这类子串猜：别的插件里叫 .pua-composer 的一个 60px
           小包裹层会被同一条规则命中，壁纸就画到那颗按钮底下了 —— 用户看到的就是
           「PUA 开关变成一块补丁」（2026-11-05）。 */
        body[data-dsh-skin-theme] .dsh-skin-area,
        body[data-dsh-skin-theme] [class*="codeBlock"],
        body[data-dsh-skin-theme] [class*="code-block"]{background-color:var(--dsw-alias-bg-layer-1)!important;color:var(--dsw-alias-label-primary)}
        /* 输入区、消息区、<main> 这一圈也把壁纸画进去。
           它们各有自己的实心底色，不画的话窗口底部会留一条白带
           （2026-11-05 用户第二次报「聊天框附近还是白的」）。 */
        body[data-dsh-skin-wallpaper="true"] .dsh-skin-area{
          background-image:var(--dsh-skin-read-veil,none)!important;
          background-attachment:fixed!important;
          background-size:var(--dsh-skin-col-size,cover)!important;
          background-position:center!important;
          background-repeat:no-repeat!important}
        body[data-dsh-skin-theme] textarea,
        body[data-dsh-skin-theme] input,
        body[data-dsh-skin-theme] [contenteditable="true"]{color:var(--dsw-alias-label-primary);background-color:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l4)}
        body[data-dsh-skin-theme] [class*="userMessage"],
        body[data-dsh-skin-theme] [class*="user-message"]{background:var(--dsw-alias-bg-layer-2)!important;color:var(--dsw-alias-label-primary)}
        body[data-dsh-skin-theme] [class*="assistantMessage"],
        body[data-dsh-skin-theme] [class*="assistant-message"]{color:var(--dsw-alias-label-primary)}
        body[data-dsh-skin-theme] [class*="sidebar"]{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
        body[data-dsh-skin-theme] pre{background:var(--dsl-code-block-background)!important;color:var(--shiki-foreground)}
        /* 宿主的按钮 hover 用令牌上色。**必须排除本插件自己的按钮和桌宠**：
           桌宠是透明 PNG，一旦被涂上 backgroundColor，就会变成一块方块
           —— 用户的皮肤偏浅时那块就是粉的（2026-11-04 报过）。 */
        body[data-dsh-skin-theme] button:hover:not([class*="dsh-skin"]):not([class*="dsh-pet"]),
        body[data-dsh-skin-theme] [role="button"]:hover:not([class*="dsh-skin"]):not([class*="dsh-pet"]){background-color:var(--dsw-alias-bg-layer-2)}
        /* 双保险：就算宿主别处还有一条更狠的 hover 规则，桌宠和卡片也不许上底色。 */
        #dsh-skin-pet-root .dsh-skin-pet,
        #dsh-skin-pet-root .dsh-skin-pet:hover,
        #dsh-skin-pet-root .pet-body,
        #dsh-skin-pet-root .pet-img,
        .dsh-skin-panel .dsh-skin-petcard:hover,
        .dsh-skin-panel .dsh-skin-petcard.is-active:hover{background-color:transparent}
        /* 叠在内容之上的表面（对话框、菜单、浮层）：壁纸模式下它们后面就是别的文字。
           令牌的地板线已经抬到 .86 以上，这里再补一层模糊 —— 万一宿主某处用的是自己的
           写死背景，模糊至少让「后面的字」变成色块，不至于和前景抢视线。 */
        body[data-dsh-skin-theme] [role="dialog"],
        body[data-dsh-skin-theme] [class*="_dialog"],
        body[data-dsh-skin-theme] [class*="_modal"],
        body[data-dsh-skin-theme] [class*="_popover"],
        body[data-dsh-skin-theme] [class*="_dropdown"]{backdrop-filter:blur(18px) saturate(1.04);-webkit-backdrop-filter:blur(18px) saturate(1.04)}
        /* 有对话框/设置页打开时，底下那层不许再透：设置里的字和被压在后面的对话
           抢视线是最难忍的（2026-11-02 用户截图）。:has 在目标 Chromium 上都支持；
           不支持的旧浏览器只是回到上面那套地板线，不会更糟。 */
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-theme] [class*="centerCol"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-theme] [class*="sidebarCol"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-theme] [class*="rightbarCol"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-theme] [class*="center-col"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-theme] [class*="sidebar-col"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-theme] [class*="rightbar-col"],
        html:has([role="dialog"]):not(.dsh-skin-panel-open) body[data-dsh-skin-theme] [class*="_emptyTabHost"]{background-color:var(--dsh-skin-base-solid,#0b1a2c)!important;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}

        .dsh-skin-pet{position:fixed;z-index:20;height:var(--pet-size,132px);left:0;top:0;cursor:grab;user-select:none;touch-action:none;transition:left .18s ease-out,top .18s ease-out}
        .dsh-skin-pet:focus-visible{outline:2px solid var(--dsh-skin-accent,#8ad9ff);outline-offset:4px;border-radius:18px}
        .dsh-skin-pet.dragging{cursor:grabbing;transition:none}
        .pet-body{height:100%;transform-origin:50% 100%;animation:pet-breathe 2.8s ease-in-out infinite}
        .dsh-skin-pet.dragging .pet-body{animation:none}
        .pet-img{height:100%;width:auto;display:block;filter:drop-shadow(0 8px 10px rgba(12,18,32,.16)) drop-shadow(0 1px 2px rgba(12,18,32,.12));transform-origin:50% 100%;pointer-events:none}
        /* 星辉少女是高亮透明边缘，降低阴影密度，避免重新被压成灰蒙蒙。 */
        #dsh-skin-pet-root[data-pet-skin="starlight"] .pet-img{filter:drop-shadow(0 8px 10px rgba(27,75,125,.18)) drop-shadow(0 1px 2px rgba(255,255,255,.34))}
        .pet-img.pop{animation:pet-pop .3s cubic-bezier(.34,1.56,.64,1)}
        /* 转身期间关掉弹跳：每帧都弹就成了抽搐 */
        .pet-img.turning{animation:none}.pet-cat-target,.pet-tail-target,.pet-cup-target,.pet-pony-target,.pet-cloud-target{position:absolute;z-index:3;width:28px;height:28px;border:0;border-radius:50%;background:transparent;opacity:0;cursor:pointer}.pet-cat-target{right:4%;bottom:20%}.pet-tail-target{left:4%;bottom:16%}.pet-cup-target{right:5%;bottom:28%}.pet-pony-target{left:20%;top:8%}.pet-cloud-target{left:2%;top:4%}#dsh-skin-pet-root[data-pet-skin="wanwan"] .pet-cat-target,#dsh-skin-pet-root[data-pet-skin="aowu"] .pet-tail-target,#dsh-skin-pet-root[data-pet-skin="bo"] .pet-cup-target,#dsh-skin-pet-root[data-pet-skin="bo"] .pet-pony-target,#dsh-skin-pet-root[data-pet-skin="xiu"] .pet-cloud-target{opacity:.01}#dsh-skin-pet-root.pet-roll .pet-body{animation:pet-roll .65s ease-in-out}#dsh-skin-pet-root.cat-stretch .pet-body{animation:cat-stretch .9s ease-in-out}#dsh-skin-pet-root.hood-hide .pet-body{animation:hood-hide 1.1s ease-in-out}@keyframes pet-roll{50%{transform:rotate(360deg) scale(1.05)}}@keyframes cat-stretch{50%{transform:scaleX(1.14) translateY(-4px)}}@keyframes hood-hide{45%{transform:translateY(12px) scale(.72);opacity:.35}}
        @keyframes pet-breathe{0%,100%{transform:scale(1) translateY(0)}50%{transform:scale(1.032) translateY(-3px)}}
        @keyframes pet-pop{0%{transform:scale(.93)}62%{transform:scale(1.035)}100%{transform:scale(1)}}
        .pet-bubble{position:absolute;right:0;bottom:100%;margin-bottom:2px;max-width:230px;white-space:normal;background:#fffdf7f2;color:#3b3330;border-radius:13px;padding:7px 11px;font:600 11.5px/1.45 system-ui,sans-serif;box-shadow:0 6px 18px rgba(20,24,40,.18);opacity:0;transform:translateY(6px) scale(.96);transition:opacity .18s,transform .18s;pointer-events:none}
        .pet-bubble.show{opacity:1;transform:none}
        .pet-bubble:after{content:'';position:absolute;right:22px;top:100%;border:6px solid transparent;border-top-color:#fffdf7f2}
        /* 输入条盖在气泡的位置上：打开它的时候气泡本来就是空的，
           放同一块区域比另找地方更不容易被窗口边缘裁掉 */

        /* 侧栏图标兼状态点：有任务在跑是绿点，有东西等你处理是琥珀点 */
        .dsh-skin-glyph{position:relative;display:inline-block}
        .dsh-skin-glyph.running:after,.dsh-skin-glyph.waiting:after{content:'';position:absolute;right:-2px;bottom:3px;width:6px;height:6px;border-radius:50%;background:#4ade80;box-shadow:0 0 6px rgba(74,222,128,.7)}
        .dsh-skin-glyph.waiting:after{background:#fbbf24;box-shadow:0 0 6px rgba(251,191,36,.7)}
        /* 桌宠右键菜单：贴着指针弹出，贴边翻转，点外面 / Esc / 滚轮都关 */
        .dsh-pet-menu{position:fixed;z-index:80;min-width:176px;padding:6px;box-sizing:border-box;border:1px solid rgba(190,224,255,.24);border-radius:14px;background:rgba(11,23,40,.97);box-shadow:0 20px 48px rgba(2,8,18,.52),0 2px 8px rgba(2,8,18,.35);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font:13px/1.2 system-ui,sans-serif;color:#eaf3ff;animation:dsh-pet-menu-in .12s ease-out}
        @keyframes dsh-pet-menu-in{from{opacity:0;transform:translateY(4px) scale(.98)}to{opacity:1;transform:none}}
        .dsh-pet-menu-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;box-sizing:border-box;border:0;background:transparent;color:inherit;border-radius:9px;padding:8px 10px;cursor:pointer;font:inherit;text-align:left}
        .dsh-pet-menu-item:hover,.dsh-pet-menu-item:focus-visible{background:rgba(96,176,255,.18);outline:none}
        .dsh-pet-menu-item small{color:#8fa6bf;font-size:10.5px;font-weight:400}
        @media (prefers-reduced-motion: reduce){.dsh-pet-menu{animation:none}}

        @media (prefers-reduced-motion: reduce){
          .pet-body,.pet-img.pop{animation:none}
          .dsh-skin-pet{transition:none}
        }

        /* ── 面板：从「插在主区里的一段内容」改成独立框体 ──────────────────────
           以前它就是一个 max-width 的卡片，直接躺在宿主主区的白底上，周围没有任何
           层次，所以看起来像被插进去的内容。现在改成：全屏压暗的舞台 + 居中浮起的
           对话卡片 + 头图 + 常驻底栏。点外面那层等于取消，和「取消修改」同义。 */
        .dsh-skin-stage{position:fixed;inset:0;z-index:70;display:grid;place-items:center;box-sizing:border-box;padding:clamp(10px,3vh,28px) clamp(10px,3vw,36px);background:radial-gradient(120% 90% at 50% 0%,rgba(12,24,44,.58),rgba(3,7,14,.82));backdrop-filter:blur(9px) saturate(1.06);-webkit-backdrop-filter:blur(9px) saturate(1.06);animation:dsh-skin-stage-in .16s ease-out}
        @keyframes dsh-skin-stage-in{from{opacity:0}to{opacity:1}}
        @keyframes dsh-skin-panel-in{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
        /* 设置面板不再借宿主背景：宿主可能是浅色主题，而本插件的文字是浅色系。 */
        .dsh-skin-panel{position:relative;display:flex;flex-direction:column;box-sizing:border-box;width:min(940px,100%);max-height:min(88vh,940px);overflow:hidden;color:#f3f7ff;background:var(--dsh-skin-panel,linear-gradient(145deg,rgba(10,24,44,.99),rgba(8,18,34,.98)));border:1px solid rgba(158,206,255,.26);border-radius:24px;box-shadow:0 40px 120px rgba(2,7,16,.62),0 12px 32px rgba(2,7,16,.45),inset 0 1px 0 rgba(255,255,255,.08);font:14px/1.55 system-ui,sans-serif;color-scheme:dark;animation:dsh-skin-panel-in .2s cubic-bezier(.2,.8,.3,1)}
        .dsh-skin-panel:after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.04)}
        /* 面板也要跟着用户选的那张背景走：一整片柔化的背景铺在卡片底下，
           头图再放一张清晰的同款。以前面板是写死的深蓝渐变，换了暖色/奶油背景
           它还是一片冷蓝，看着像另一个界面（2026-11-05 用户问「界面是不是该适配」）。 */
        .dsh-skin-panel:before{content:'';position:absolute;inset:-36px;background-image:linear-gradient(180deg,rgba(6,14,26,.88),rgba(6,14,26,.94)),var(--dsh-skin-panel-art,none);background-size:cover,cover;background-position:center,center;filter:blur(24px) saturate(1.2);pointer-events:none}
        .dsh-skin-hero,.dsh-skin-body,.dsh-skin-foot{z-index:1}
        /* 头图：image-2 出的那张极光带，压在深色渐变底下，只当质感、不抢文字 */
        .dsh-skin-hero{position:relative;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 20px;border-bottom:1px solid rgba(160,208,255,.16);background-image:radial-gradient(120% 150% at 8% -30%,rgba(122,206,255,.22),transparent 62%),var(--dsh-skin-panel-art,url(/dsh-skin/panel-hero.webp));background-size:cover,100% auto;background-position:center,center 42%;background-repeat:no-repeat}
        .dsh-skin-hero:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,14,26,.92),rgba(6,14,26,.74) 55%,rgba(6,14,26,.9));pointer-events:none}
        .dsh-skin-hero > *{position:relative}
        /* 页头从三行压成一行：标题 + 当前主题名 + 关闭。原来 kicker/标题/说明各占一行，
           正文得从 y≈330 才开始（2026-11-05 产品评审里最占地方的一块）。 */
        .dsh-skin-hero-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
        .dsh-skin-hero h2{margin:0;color:#ffffff;font-size:19px;line-height:1.2;letter-spacing:.01em;text-shadow:0 1px 12px rgba(0,0,0,.35)}
        .dsh-skin-kicker{display:inline-block;margin:0;font:600 9.5px/1 system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8fd3ff;opacity:.85}
        .dsh-skin-hero-side{display:flex;align-items:center;gap:8px}
        .dsh-skin-hero-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:999px;border:1px solid rgba(190,224,255,.28);background:rgba(9,24,44,.62);color:#d7e8fb;font:600 11.5px/1 system-ui,sans-serif;white-space:nowrap}
        .dsh-skin-hero-chip i{display:block;width:8px;height:8px;border-radius:50%;background:var(--dsh-skin-accent,#8ad9ff);box-shadow:0 0 10px var(--dsh-skin-accent,#8ad9ff)}
        .dsh-skin-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px 24px 6px;scrollbar-width:thin;scrollbar-color:rgba(169,221,255,.65) rgba(255,255,255,.08)}
        .dsh-skin-body::-webkit-scrollbar{width:10px}
        .dsh-skin-body::-webkit-scrollbar-track{background:rgba(255,255,255,.05);border-radius:10px}
        .dsh-skin-body::-webkit-scrollbar-thumb{background:rgba(169,221,255,.58);border:2px solid transparent;background-clip:padding-box;border-radius:10px}
        .dsh-skin-note{margin:0 0 10px;padding:7px 11px;border-radius:10px;border:1px solid rgba(160,208,255,.16);background:rgba(9,24,44,.42);color:#b9cbe0;font-size:11.5px;line-height:1.55}
        /* 页签：每一页只装一件事。未选中的页用 display:none 而不是不渲染，
           这样桌宠预览图不会因为切页被销毁重建（那会让六态图闪一下）。 */
        .dsh-skin-tabs{display:flex;gap:8px;margin:0 0 14px;padding:4px;border-radius:14px;border:1px solid rgba(160,208,255,.16);background:rgba(7,18,32,.55)}
        .dsh-skin-tab{flex:1 1 0;display:flex;flex-direction:column;gap:2px;align-items:flex-start;padding:9px 12px;border:1px solid transparent;border-radius:11px;background:transparent;color:#c4d6e9;cursor:pointer;font:inherit;text-align:left;transition:background .14s,border-color .14s,color .14s}
        .dsh-skin-tab b{font-size:13.5px;font-weight:600}
        .dsh-skin-tab small{font-size:11px;color:#8ba2bb}
        .dsh-skin-tab:hover{background:rgba(96,176,255,.12);color:#eaf4ff}
        .dsh-skin-tab.on{background:linear-gradient(180deg,rgba(64,140,220,.34),rgba(38,96,160,.28));border-color:rgba(150,210,255,.4);color:#ffffff;box-shadow:0 6px 16px rgba(4,14,28,.28)}
        .dsh-skin-tab.on small{color:#bcd8f2}
        .dsh-skin-tabpane{display:none}
        .dsh-skin-tabpane.on{display:block}
        .dsh-skin-inline{display:flex;gap:8px;flex-wrap:wrap}
        .dsh-skin-desktop-hint{margin-top:10px;padding:9px 11px;border-radius:10px;border:1px dashed rgba(160,208,255,.28);background:rgba(7,18,32,.36);font-size:11.5px;line-height:1.65;color:#a9c1d8}
        .dsh-skin-desktop-hint b{color:#cfe6ff;font-weight:600}
        .dsh-skin-desktop-hint code{padding:1px 5px;border-radius:5px;background:rgba(120,180,255,.14);color:#d8ecff;font:11px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;user-select:all}
        .dsh-skin-linkstate{margin-top:8px;font-size:11px;line-height:1.6;color:#8fa9c2}
        .dsh-skin-linkstate b{color:#b9d7f5;font-weight:600}
        .dsh-skin-testout{white-space:pre-wrap;border-style:solid;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;line-height:1.7}
        .dsh-skin-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 24px;border-top:1px solid rgba(160,208,255,.18);background:linear-gradient(180deg,rgba(8,20,36,.72),rgba(6,15,28,.94))}
        .dsh-skin-foot .dsh-skin-draft{margin-right:auto}
        .dsh-skin-close{width:32px;height:32px;flex:0 0 auto;border:1px solid rgba(190,224,255,.32);border-radius:11px;background:rgba(15,32,56,.72);color:#eef6ff;font-size:22px;line-height:1;cursor:pointer;transition:background .14s,border-color .14s}
        .dsh-skin-close:hover{background:#25496f;border-color:rgba(210,239,255,.7)}
        .dsh-skin-actions-top{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;margin:0 0 10px}
        .dsh-skin-draft{color:#b9cbe0;font-size:12px}
        .dsh-skin-color-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:10px 0 14px}
        .dsh-skin-color-grid label{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid rgba(190,224,255,.24);border-radius:10px;background:rgba(9,27,49,.56);color:#edf5ff;font-size:12px}
        .dsh-skin-color-grid input[type=color]{width:32px;height:24px;border:0;padding:0;background:transparent;cursor:pointer}
        .dsh-skin-file{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .dsh-skin-file input[type=file]{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
        .dsh-skin-panel h2{margin:0 0 6px;color:#ffffff;font-size:22px;line-height:1.3;letter-spacing:.01em}
        .dsh-skin-panel .sub{color:#c0d0e4;margin-bottom:18px}
        .dsh-skin-card{position:relative;background:linear-gradient(180deg,rgba(24,45,75,.82),rgba(17,33,58,.86));border:1px solid rgba(185,222,255,.2);border-radius:18px;padding:16px 16px 14px;margin:12px 0;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 26px rgba(2,8,18,.18)}
        .dsh-skin-card > b{display:flex;align-items:center;gap:8px;color:#ffffff;margin-bottom:3px;font-size:14.5px;letter-spacing:.01em}
        .dsh-skin-card > b:before{content:attr(data-glyph);flex:0 0 auto;font-size:12px;font-weight:400;color:var(--dsh-skin-accent,#8ad9ff);opacity:.9}
        .dsh-skin-card > .sub{margin-bottom:12px;font-size:12px;color:#b6c8dd}
        .dsh-skin-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:12px 0}
        .dsh-skin-row label{color:#f1f6ff;font-weight:650}
        .dsh-skin-row small{display:block;color:#b9cbe0;font-weight:400}
        .dsh-skin-row input[type=range]{width:200px;accent-color:var(--dsh-skin-accent);cursor:pointer}
        .dsh-skin-row input[type=text],.dsh-skin-row select{border:1px solid rgba(190,224,255,.34);background:#0b1d34;color:#f3f7ff;border-radius:9px;padding:7px 10px;font:inherit;min-width:150px;outline:none}
        .dsh-skin-row input[type=text]::placeholder{color:#91a9c2}
        .dsh-skin-row input[type=text]:focus,.dsh-skin-row select:focus{border-color:var(--dsh-skin-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsh-skin-accent) 28%,transparent)}
        .dsh-skin-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--dsh-skin-accent);cursor:pointer}
        .dsh-skin-row input[type=file]{max-width:220px;color:#dce9f8;font:12px system-ui,sans-serif}
        .dsh-skin-row input[type=file]::file-selector-button{border:1px solid rgba(190,224,255,.34);border-radius:8px;background:#173250;color:#f3f7ff;padding:6px 9px;margin-right:8px;cursor:pointer}
        .dsh-skin-chips{display:flex;flex-wrap:wrap;gap:8px}
        .dsh-skin-cursoricon{width:20px;height:20px;image-rendering:auto;margin-bottom:2px}
        /* 面板内的实时预览：真素材 + 真令牌，点一下立刻变 */
        .dsh-skin-previewbox{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:12px 0 6px}
        /* 按 16:9 摆一个小窗：铺满整块会只剩中间一条，看不出换的是哪张 */
        .dsh-skin-preview{position:relative;flex:0 0 auto;width:302px;max-width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;border:1px solid rgba(160,200,240,.28);background-color:#0a1522;background-position:center;background-repeat:no-repeat;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 10px 22px rgba(2,8,18,.3)}
        .dsh-skin-preview-cols{position:absolute;inset:0;display:grid;grid-template-columns:20% 1fr 22%;pointer-events:none}
        .dsh-skin-preview-cols span{border-left:1px solid rgba(255,255,255,.16);border-right:1px solid rgba(0,0,0,.24)}
        .dsh-skin-preview-cols span:first-child{border-left:0}
        .dsh-skin-preview-cols span:last-child{border-right:0}
        .dsh-skin-preview-cols span.mid{background:rgba(0,0,0,.08)}
        /* 预览里的字用宿主真实文字色：遮罩够不够厚，看一眼就知道 */
        .dsh-skin-preview-text{position:absolute;left:10px;right:10px;bottom:9px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-primary,#f4f8ff);text-shadow:0 1px 8px rgba(0,0,0,.55)}
        .dsh-skin-previewmeta{flex:1 1 220px;min-width:0}
        .dsh-skin-previewmeta b{display:block;color:#ffffff;font-size:12.5px;font-weight:650;margin-bottom:3px}
        .dsh-skin-previewmeta span{display:block;color:#b7cbe0;font-size:11.5px}
        .dsh-skin-previewcap{margin-top:2px;font-size:11px;color:#93a9c0}
        /* 自适应玻璃：由 syncOpaqueSurfaces() 按真实 DOM 标注，不依赖宿主的哈希类名。 */
        .dsh-skin-glass{background-color:transparent!important;background-image:var(--dsh-skin-read-veil,none)!important;background-attachment:fixed!important;background-size:var(--dsh-skin-col-size,cover)!important;background-position:center!important;background-repeat:no-repeat!important}
        .dsh-skin-wallgroup{margin-top:12px}
        .dsh-skin-walltitle{font-size:11px;letter-spacing:.06em;color:#8fa9c2;margin-bottom:6px}
        /* 背景库：一张文字卡换成一格一张缩略图。17 张纯文字卡 = 17 次试错，
           用户根本"选不动"（2026-11-05 产品评审的第一条）。 */
        .dsh-skin-wallgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:9px}
        .dsh-skin-wallcard{position:relative;display:flex;flex-direction:column;gap:2px;padding:5px 5px 7px;border:1px solid rgba(190,224,255,.24);border-radius:12px;background:rgba(9,27,49,.78);color:#edf5ff;font:inherit;text-align:left;cursor:pointer;transition:border-color .14s,transform .14s,box-shadow .14s,background .14s}
        .dsh-skin-wallcard:hover{border-color:rgba(193,231,255,.7);transform:translateY(-1px);background:#122c48}
        .dsh-skin-wallcard:focus-visible{outline:2px solid var(--dsh-skin-accent);outline-offset:2px}
        .dsh-skin-wallcard.active{border-color:var(--dsh-skin-accent);box-shadow:0 0 0 1px var(--dsh-skin-accent) inset,0 8px 18px rgba(4,14,28,.34)}
        .dsh-skin-wallcard.active b{color:#ffffff}
        .dsh-skin-wallthumb{display:block;position:relative;aspect-ratio:3/2;border-radius:8px;overflow:hidden;background-size:cover;background-position:center;background-repeat:no-repeat;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
        .dsh-skin-wallthumb img{display:block;width:100%;height:100%;object-fit:cover}
        .dsh-skin-wallcard b{font-size:12px;font-weight:650;margin-top:4px;padding:0 3px}
        .dsh-skin-wallcard small{display:block;font-size:10.5px;color:#a9c0d6;padding:0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .dsh-skin-wallcheck{position:absolute;top:9px;right:9px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:var(--dsh-skin-accent);color:#06192b;font:700 11px/1 system-ui,sans-serif;font-style:normal;box-shadow:0 2px 8px rgba(2,8,18,.45)}
        .dsh-skin-wallblank{display:grid;place-items:center;background:repeating-linear-gradient(45deg,rgba(255,255,255,.05) 0 6px,transparent 6px 12px);color:#8fa9c2;font-size:11px}
        /* 皮肤卡自带色条：比"chip 文字 + 单独一排 swatch"好扫得多。 */
        .dsh-skin-skingrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(156px,1fr));gap:8px}
        .dsh-skin-skincard{display:flex;flex-direction:column;gap:3px;padding:8px 10px 9px;border:1px solid rgba(190,224,255,.24);border-radius:12px;background:rgba(9,27,49,.78);color:#edf5ff;font:inherit;text-align:left;cursor:pointer;transition:border-color .14s,background .14s,transform .14s}
        .dsh-skin-skincard:hover{border-color:rgba(193,231,255,.7);background:#122c48;transform:translateY(-1px)}
        .dsh-skin-skincard:focus-visible{outline:2px solid var(--dsh-skin-accent);outline-offset:2px}
        .dsh-skin-skincard.active{border-color:var(--dsh-skin-accent);background:#173653;box-shadow:0 0 0 1px var(--dsh-skin-accent) inset,0 8px 18px rgba(4,14,28,.3)}
        .dsh-skin-skinrow{display:flex;gap:4px;margin-bottom:3px}
        .dsh-skin-skinrow i{display:block;flex:1 1 0;height:14px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
        .dsh-skin-skincard b{font-size:12.5px;font-weight:650}
        .dsh-skin-skincard small{font-size:10.5px;color:#a9c0d6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .dsh-skin-chip{border:1px solid rgba(190,224,255,.28);background:rgba(9,27,49,.78);border-radius:12px;padding:9px 11px;color:#edf5ff;cursor:pointer;text-align:left;font:inherit}
        .dsh-skin-chip:hover,.dsh-skin-gallery button:hover{border-color:rgba(193,231,255,.72);background:#183858}
        .dsh-skin-chip:focus-visible,.dsh-skin-btn:focus-visible,.dsh-skin-gallery button:focus-visible{outline:2px solid var(--dsh-skin-accent);outline-offset:2px}
        .dsh-skin-chip.active{border-color:var(--dsh-skin-accent);box-shadow:0 0 0 1px var(--dsh-skin-accent) inset,0 0 16px color-mix(in srgb,var(--dsh-skin-accent) 20%,transparent);background:#173653}
        .dsh-skin-chip b,.dsh-skin-chip span{display:block}
        .dsh-skin-chip span{font-size:11px;color:#bed0e3}
        .dsh-skin-swatches{display:flex;gap:6px;margin:-2px 0 12px}
        .dsh-skin-swatches i{display:block;width:24px;height:12px;border-radius:99px;border:1px solid rgba(255,255,255,.38);box-shadow:0 1px 5px rgba(0,0,0,.18)}
        .dsh-skin-btn{border:0;border-radius:10px;padding:8px 12px;background:var(--dsh-skin-accent);color:#071727;font-weight:700;cursor:pointer;font:inherit}
        .dsh-skin-btn.secondary{background:#173250;color:#eef6ff;border:1px solid rgba(190,224,255,.34)}
        /* 面板按钮不再吃宿主那条 hover 令牌色（那条现在只作用于宿主自己的按钮），
           自己给一点亮度反馈，不然按下去没感觉。 */
        .dsh-skin-btn:hover{filter:brightness(1.08)}
        .dsh-skin-btn.secondary:hover{background:#204465;border-color:rgba(210,239,255,.7)}
        .dsh-skin-gallery{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
        .dsh-skin-gallery button{border:1px solid rgba(190,224,255,.28);background:rgba(9,27,49,.78);border-radius:10px;padding:6px 4px 5px;cursor:pointer;color:#edf5ff;width:62px;font:inherit}
        .dsh-skin-gallery button.active{border-color:var(--dsh-skin-accent);background:#173653;box-shadow:0 0 0 1px var(--dsh-skin-accent) inset}
        .dsh-skin-gallery img{height:52px;display:block;margin:0 auto 3px}
        .dsh-skin-gallery span{font-size:10px;color:#c2d3e5}
        /* 桌宠九宫格：一格一只，缩略图用该角色真实的待机帧 */
        .dsh-skin-petrow{align-items:flex-start;flex-direction:column;gap:8px}
        .dsh-skin-petrow>label{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px}
        .dsh-skin-petgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:8px;width:100%}
        .dsh-skin-petcard{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px 5px;border:1px solid rgba(190,224,255,.26);border-radius:12px;background:linear-gradient(180deg,rgba(14,34,58,.92),rgba(9,24,42,.92));color:#e7f1ff;font:inherit;cursor:pointer;transition:border-color .15s,transform .15s,box-shadow .15s}
        .dsh-skin-petcard img{height:46px;width:auto;max-width:100%;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(4,10,20,.45))}
        .dsh-skin-petcard span{font-size:10.5px;color:#c6d8ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
        .dsh-skin-petcard:hover{border-color:rgba(193,231,255,.6);transform:translateY(-1px)}
        .dsh-skin-petcard:focus-visible{outline:2px solid var(--dsh-skin-accent);outline-offset:2px}
        .dsh-skin-petcard.is-active{border-color:var(--dsh-skin-accent);background:linear-gradient(180deg,rgba(26,60,96,.96),rgba(13,33,56,.96));box-shadow:0 0 0 1px var(--dsh-skin-accent) inset,0 6px 16px rgba(4,10,20,.4)}
        .dsh-skin-petcard.is-active span{color:#eef7ff}
        @media (prefers-reduced-motion: reduce){.dsh-skin-petcard{transition:none}.dsh-skin-petcard:hover{transform:none}}
        .dsh-skin-stat{color:#b7cbe0;font-size:12px;margin-top:8px}
        .dsh-skin-checkout{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:rgba(6,18,32,.72);border:1px solid rgba(160,200,240,.22);color:#d5e6f7;font:11.5px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto}
        @media (max-width:640px){.dsh-skin-stage{padding:0;place-items:stretch}.dsh-skin-panel{width:100%;max-height:100vh;border-radius:0;border-left:0;border-right:0}.dsh-skin-hero{padding:16px}.dsh-skin-body{padding:14px 16px 4px}.dsh-skin-foot{padding:12px 16px}.dsh-skin-hero-chip{display:none}.dsh-skin-row{align-items:flex-start;flex-direction:column;gap:7px}.dsh-skin-row input[type=range]{width:100%}.dsh-skin-row input[type=text],.dsh-skin-row select{width:100%;box-sizing:border-box}.dsh-skin-row input[type=file]{max-width:100%}}
        @media (prefers-reduced-motion: reduce){.dsh-skin-stage,.dsh-skin-panel{animation:none}}
      `;
      document.head.appendChild(style);
    }

    function slider(label, value, min, max, step, onChange, suffix) {
      return h(
        "div",
        { className: "dsh-skin-row" },
        h("label", null, label, h("small", null, `${Math.round(value)}${suffix || ""}`)),
        h("input", {
          type: "range",
          min,
          max,
          step,
          value,
          onChange: (event) => onChange(Number(event.target.value)),
        })
      );
    }

    function AppearancePanel() {
      const [, forcePanelRefresh] = useState(0);
      panelRefresh = () => forcePanelRefresh((value) => value + 1);
      // 页签状态放组件里：桌面端开关、主题、背景三块内容不再共用一个长滚动区。
      const [tab, setTab] = useState("theme");
      const desktop = DESKTOP;
      const custom = state.wallpaper === "__custom__";
      const customSkin = state.skin === "custom";
      const closePanel = () => {
        flushAutoSave();
        try {
          runtimeContext?.get?.("layout")?.selectPanel?.(null);
        } catch {
          /* 宿主没有 layout 时，按钮仍可安全存在 */
        }
      };
      /**
       * 一小块「关掉面板之后长什么样」。
       *
       * 用真素材（wallpaperBackground 已经拼好染色层）+ 真实底板令牌画三列，
       * 所以它不是示意图，而是按当前设置算出来的样子。
       */
      const wallpaperPreview = () => {
        // 渲染时也补一次标记：某些精简环境没有 useEffect，靠它会把「面板开着」漏掉。
        document.documentElement?.classList?.add?.("dsh-skin-panel-open");
        const source = wallpaperSource();
        const fit = ["cover", "contain", "stretch", "tile"].includes(state.fit) ? state.fit : "cover";
        /**
         * 预览画的是**三列真正被铺成什么样**，不是原图。
         *
         * 直接贴原图会骗人：真实界面在图上压了一层随亮度自适应调整的遮罩，
         * 亮图遮得多、暗图遮得少。这里优先用 --dsh-skin-wallpaper-paint ——
         * 那是 CSS 变量，量完亮度后会自己更新，不用用户再点一次。
         */
        const paintable = Boolean(source) && (source.kind === "css" || fit === "cover" || fit === "stretch");
        const image = !source
          ? "none"
          : paintable
            ? "var(--dsh-skin-wallpaper-paint,none)"
            : wallpaperBackground();
        const size = !source
          ? "cover"
          : paintable
            ? (source.kind === "css" ? "100% 100%" : "cover")
            : fit === "tile" ? "auto" : "contain";
        return h(
          "div",
          { className: "dsh-skin-previewbox" },
          h(
            "div",
            {
              className: "dsh-skin-preview",
              style: {
                backgroundImage: image,
                backgroundSize: size,
              },
            },
            h(
              "div",
              { className: "dsh-skin-preview-cols" },
              h("span"),
              h("span", { className: "mid" }),
              h("span")
            ),
            h(
              "div",
              { className: "dsh-skin-preview-text" },
              "聊天区和这里一样"
            )
          ),
          h(
            "div",
            { className: "dsh-skin-previewmeta" },
            h("b", null, "关掉这一页，聊天区长这样"),
            h(
              "div",
              { className: "dsh-skin-previewcap" },
              `${SKINS.find((item) => item.id === state.skin)?.label || "自定义"} · ${source ? (WALLPAPERS.find((item) => item.id === state.wallpaper)?.label || "自定义背景") : "无背景"}`
            ),
            h("span", null, source ? "壁纸 + 当前主题的遮罩，按真实比例算出来的" : "还没选背景，先挑一张")
          )
        );
      };
      // Esc 关面板：改成独立框体之后它更像一个对话框，对话框就该能被 Esc 关掉。
      // 假 DOM / 冒烟环境没有 useEffect 或 addEventListener，跳过即可，不能因此把面板带崩。
      const useEffect = typeof React.useEffect === "function" ? React.useEffect : null;
      if (typeof useEffect === "function") {
        /**
         * 面板开着的时候打个标记。
         *
         * 「有对话框就把壁纸撤掉」那条规则本意是给宿主的审批弹窗用的，
         * 但它同时命中了本插件自己的面板 —— 于是你在面板里换壁纸，页面纹丝不动，
         * 关掉面板才看到变化（2026-11-05 用户报的就是这个）。
         * 打上这个标记，样式里就能把这些规则限定为「宿主弹窗」。
         */
        useEffect(() => {
          document.documentElement?.classList?.add?.("dsh-skin-panel-open");
          return () => document.documentElement?.classList?.remove?.("dsh-skin-panel-open");
        }, []);
        useEffect(() => {
          const onKey = (event) => {
            if (event && (event.key === "Escape" || event.keyCode === 27)) closePanel();
          };
          document.addEventListener?.("keydown", onKey);
          return () => document.removeEventListener?.("keydown", onKey);
        }, []);
        // 打开面板时问一次桌面端的真实状态：按钮不该靠「上次记住的」来显示
        useEffect(() => {
          // 桌面功能已下线，不再查询状态。
        }, []);
      }
      return h(
        "div",
        {
          className: "dsh-skin-stage",
          onMouseDown: (event) => {
            // 只有点在压暗的舞台上才算「关掉」，点卡片内部不关。
            if (event.target === event.currentTarget) closePanel();
          },
        },
        h(
          "div",
          {
            className: "dsh-skin-panel",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "主题与外观",
            onMouseDown: (event) => event.stopPropagation?.(),
          },
          h(
            "div",
            { className: "dsh-skin-hero" },
            h(
              "div",
              { className: "dsh-skin-hero-main" },
              h("span", { className: "dsh-skin-kicker" }, "APPEARANCE"),
              h("h2", null, "主题与外观"),
              h(
                "span",
                { className: "dsh-skin-hero-chip", title: `当前皮肤：${(SKINS.find((item) => item.id === state.skin) || SKINS[0]).label}` },
                h("i", null),
                (SKINS.find((item) => item.id === state.skin) || SKINS[0]).label
              )
            ),
            h(
              "div",
              { className: "dsh-skin-hero-side" },
              h("button", { className: "dsh-skin-close", type: "button", onClick: closePanel, title: "返回聊天（Esc）" }, "×")
            )
          ),
          h(
            "div",
            { className: "dsh-skin-body" },
            // 三页签而不是一堵长列表：13 套皮肤 + 5 套壁纸 + 十来个桌宠开关堆在一个
            // 滚动区里，找东西全靠滚。页签让每一页只装一件事，页脚的应用按钮不受影响。
            h(
              "div",
              { className: "dsh-skin-tabs", role: "tablist" },
              [
                ["theme", "主题", "预设与自定义配色"],
                ["wallpaper", "背景", "插画与纯 CSS 纹理"],
                ["pet", "桌宠", "页面内的小伙伴"],
              ].map(([id, label, hint]) =>
                h(
                  "button",
                  {
                    key: id,
                    type: "button",
                    role: "tab",
                    "aria-selected": tab === id ? "true" : "false",
                    className: `dsh-skin-tab${tab === id ? " on" : ""}`,
                    onClick: () => setTab(id),
                  },
                  h("b", null, label),
                  h("small", null, hint)
                )
              )
            ),
            h("div", { className: "dsh-skin-note" }, noteForTab(tab)),
        h(
          "div",
          { className: `dsh-skin-tabpane${tab === "theme" ? " on" : ""}` },
        h(
          "div",
          { className: "dsh-skin-card" },
          h("b", { "data-glyph": "◈" }, "全局主题预设"),
          wallpaperPreview(),
          h("div", { className: "sub" }, "不是只改这个设置框：每套预设包含背景、表面、文字、边框、强调和状态色"),
        customSkin ? h("div", { className: "dsh-skin-color-grid" },
          [
            ["accent", "强调色", "#b8a5ff"],
            ["surface", "主表面", "#2a2348"],
            ["surface2", "次表面", "#4f3b78"],
            ["sidebar", "侧栏色", "#312856"],
            ["text", "主要文字", "#fbf8ff"],
            ["code", "代码块", "#211b3a"],
          ].map(([role, label, fallback]) => h("label", { key: role }, h("span", null, label), h("input", {
            type: "color",
            value: customColor(role, fallback),
            onChange: (event) => { state.customColors = { ...(state.customColors || {}), [role]: event.target.value }; preview(); },
          })))
        ) : null,
          // 每张皮肤卡自带色条：原来只有一排 swatch 显示"当前这套"，
          // 其余 12 套只能读文字猜颜色。
          h(
            "div",
            { className: "dsh-skin-skingrid" },
            SKINS.map((skin) =>
              h(
                "button",
                {
                  key: skin.id,
                  type: "button",
                  title: `${skin.label} · ${skin.note}`,
                  "aria-label": skin.label,
                  className: `dsh-skin-skincard ${state.skin === skin.id ? "active" : ""}`,
                  onClick: () => {
                    state.skin = skin.id;
                    preview();
                  },
                },
                h(
                  "span",
                  { className: "dsh-skin-skinrow" },
                  (skin.swatches || []).slice(0, 4).map((color, index) =>
                    h("i", { key: index, style: { background: color } })
                  )
                ),
                h("b", null, skin.label),
                h("small", null, skin.note)
              )
            )
          )
        ),
        // 鼠标光标：只换浏览器里的指针，不碰系统光标。
        h(
          "div",
          { className: "dsh-skin-card" },
          h("b", { "data-glyph": "◇" }, "鼠标光标"),
          h(
            "div",
            { className: "sub" },
            "换的是这个页面里的指针（浏览器 CSS 光标），不改系统光标；关掉就回到系统默认。"
          ),
          h(
            "div",
            { className: "dsh-skin-chips" },
            h(
              "button",
              {
                type: "button",
                className: `dsh-skin-chip ${cursorThemeId() === "off" ? "active" : ""}`,
                onClick: () => {
                  state.cursorTheme = "off";
                  preview();
                },
              },
              h("b", null, "系统默认"),
              h("span", null, "不替换")
            ),
            CURSOR_THEMES.map((theme) =>
              h(
                "button",
                {
                  key: theme.id,
                  type: "button",
                  className: `dsh-skin-chip ${cursorThemeId() === theme.id ? "active" : ""}`,
                  title: theme.note,
                  onClick: () => {
                    state.cursorTheme = theme.id;
                    preview();
                  },
                },
                // 直接拿真实的 32px 素材当预览，不另画一套示意
                h("img", {
                  src: `${ASSET}/cursor-${theme.id}-arrow-32.png`,
                  alt: "",
                  width: 20,
                  height: 20,
                  className: "dsh-skin-cursoricon",
                  draggable: "false",
                }),
                h("b", null, theme.label),
                h("span", null, theme.note)
              )
            )
          )
        )
        ),
        h(
          "div",
          { className: `dsh-skin-tabpane${tab === "wallpaper" ? " on" : ""}` },
        h(
          "div",
          { className: "dsh-skin-card" },
          h("b", { "data-glyph": "◆" }, "全局背景"),
          /**
           * 实时预览。
           *
           * 面板是个全屏浮层，真正的页面被压在它后面 —— 换背景时只靠「背后的页面变了」
           * 根本看不清（这也是用户以为没生效的原因）。这里用真素材 + 真实令牌
           * 画一小块「关掉面板之后长什么样」，点哪张立刻变。
           */
          wallpaperPreview(),
          h(
            "div",
            { className: "sub" },
            "插画和纹理都会铺到整个 DSH 背景层，聊天区、侧栏和输入区会保留半透明表面以保证可读性"
          )
        ),
        /**
         * 微调卡：强度和模糊是最常动的两个，必须放在背景列表**前面**。
         * 以前它们排在 17 张卡后面，用户得滚到底才够得到（2026-11-05 产品评审第二条）。
         */
        h(
          "div",
          { className: "dsh-skin-card" },
          h("b", { "data-glyph": "◐" }, "微调"),
          h("div", { className: "sub" }, "强度越大图越浓；模糊只糊背景、不糊字"),
          slider(
            // 这个数乘在壁纸层上：越大越浓。叫「透明度」会让人以为越大越淡，反着猜。
            "壁纸强度",
            state.opacity * 100,
            0,
            100,
            1,
            (value) => {
              state.opacity = value / 100;
              preview();
            },
            "%"
          ),
          slider(
            "模糊",
            state.blur,
            0,
            24,
            1,
            (value) => {
              state.blur = value;
              preview();
            },
            "px"
          ),
          h(
            "div",
            { className: "dsh-skin-row" },
            h("label", null, "适配方式", h("small", null, "自动适配不同尺寸图片")),
            h(
              "select",
              {
                value: state.fit,
                onChange: (event) => {
                  state.fit = event.target.value;
                  preview();
                },
              },
              h("option", { value: "cover" }, "铺满（推荐）"),
              h("option", { value: "contain" }, "完整显示"),
              h("option", { value: "stretch" }, "拉伸填充"),
              h("option", { value: "tile" }, "平铺")
            )
          ),
          h(
            "div",
            { className: "dsh-skin-inline" },
            h(
              "button",
              { className: "dsh-skin-btn secondary", type: "button", onClick: () => { state.wallpaper = ""; preview(); } },
              "不用背景"
            ),
            h(
              "button",
              {
                className: "dsh-skin-btn secondary",
                type: "button",
                onClick: () => {
                  state.wallpaper = "__catdog__";
                  preview();
                },
              },
              "恢复默认背景"
            )
          )
        ),
        /* 背景库：一格一张缩略图。17 张纯文字卡等于 17 次试错。 */
        h(
          "div",
          { className: "dsh-skin-card" },
          h("b", { "data-glyph": "▦" }, "背景库"),
          h("div", { className: "sub" }, "点一张立刻铺上去；上面那块小窗就是关掉面板之后的样子"),
          ...[
            ["插画", WALLPAPERS.filter((item) => !item.css)],
            ["纯 CSS 纹理", WALLPAPERS.filter((item) => item.css)],
          ].map(([title, items]) => h(
            "div",
            { key: title, className: "dsh-skin-wallgroup" },
            h("div", { className: "dsh-skin-walltitle" }, title),
            h(
              "div",
              { className: "dsh-skin-wallgrid" },
              items.map((item) =>
                h(
                  "button",
                  {
                    key: item.id,
                    type: "button",
                    title: `${item.label} · ${item.note}`,
                    "aria-label": item.label,
                    className: `dsh-skin-wallcard ${state.wallpaper === item.id ? "active" : ""}`,
                    onClick: () => {
                      state.wallpaper = item.id;
                      preview();
                    },
                  },
                  h(
                    "span",
                    {
                      className: `dsh-skin-wallthumb${item.css ? "" : ""}`,
                      style: item.css
                        ? { backgroundImage: item.css, backgroundSize: "100% 100%" }
                        : null,
                    },
                    // 插画用真素材（懒加载），纹理直接把渐变铺在格子里
                    item.css ? null : h("img", {
                      src: `${ASSET}/${item.file}`,
                      alt: "",
                      loading: "lazy",
                      decoding: "async",
                      draggable: "false",
                    })
                  ),
                  state.wallpaper === item.id ? h("i", { className: "dsh-skin-wallcheck" }, "✓") : null,
                  h("b", null, item.label),
                  h("small", null, item.note)
                )
              )
            )
          )),
          h(
            "div",
            { className: "dsh-skin-row" },
            h(
              "label",
              null,
              "看得见吗？",
              h("small", null, "背景自检：查这一页上壁纸到底有没有画出来、有没有被谁挡住")
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsh-skin-btn secondary",
                onClick: () => {
                  wallpaperCheckText = "检测中…";
                  refreshPanel();
                  wallpaperDiagnostics().then((info) => {
                    wallpaperCheckText = formatWallpaperCheck(info);
                    refreshPanel();
                  }).catch((error) => {
                    wallpaperCheckText = "自检失败：" + String(error && error.message);
                    refreshPanel();
                  });
                },
              },
              "背景自检"
            )
          ),
          wallpaperCheckText ? h("pre", { className: "dsh-skin-checkout" }, wallpaperCheckText) : null,
          h(
            "div",
            { className: "dsh-skin-row" },
            h("label", null, "上传图片", h("small", null, custom ? "已在用自定义图" : "选择后自动保存")),
            h(
              "div",
              { className: "dsh-skin-file" },
              h("label", { className: "dsh-skin-btn secondary", htmlFor: "dsh-skin-upload" }, "选择图片"),
              h("input", {
                id: "dsh-skin-upload",
                className: "dsh-skin-file-input",
                type: "file",
                accept: "image/png,image/jpeg,image/webp,image/gif",
                onChange: (event) => {
                const file = event.target.files && event.target.files[0];
                if (!file) return;
                if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
                  alert("请选择 PNG、JPG、WEBP 或 GIF 图片");
                  event.target.value = "";
                  return;
                }
                if (file.size > 8 * 1024 * 1024) {
                  alert("原图请控制在 8MB 以内");
                  event.target.value = "";
                  return;
                }
                const reader = new FileReader();
                reader.onerror = () => alert("图片读取失败，请换一张图片再试");
                reader.onload = () => {
                  const source = String(reader.result || "");
                  const image = new Image();
                  image.onerror = () => alert("图片格式无法解析，请换一张图片再试");
                  image.onload = () => {
                    const maxSide = 2200;
                    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.round(image.width * scale));
                    canvas.height = Math.max(1, Math.round(image.height * scale));
                    const context = canvas.getContext?.("2d");
                    if (!context) { alert("当前浏览器不支持图片处理"); return; }
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    wallpaperUrl = canvas.toDataURL("image/jpeg", 0.82);
                    state.wallpaperData = wallpaperUrl;
                    state.wallpaper = "__custom__";
                    preview();
                  };
                  image.src = source;
                };
                reader.readAsDataURL(file);
              },
            })
            ),
          ),
        )
        ),
        h(
          "div",
          { className: `dsh-skin-tabpane${tab === "pet" ? " on" : ""}` },
        h(
          "div",
          { className: "dsh-skin-card" },
          h("b", { "data-glyph": "✦" }, "桌宠"),
          h("div", { className: "sub" }, "点她、摸她、拖她走（甩出去会飞一段） · 右键有小菜单 · 她记得你多久没来"),
          h(
            "div",
            { className: "dsh-skin-row" },
            h("label", null, "名字", h("small", null, "留空就用角色本名；改名后所有台词都跟着改")),
            h("input", {
              type: "text",
              value: state.petName || "",
              placeholder: currentPetSkin().label,
              maxLength: 12,
              onChange: (event) => {
                state.petName = event.target.value;
                preview();
              },
            })
          ),
          h(
            "div",
            { className: "dsh-skin-row" },
            h("label", null, "显示桌宠", h("small", null, state.petEnabled ? "正在陪你" : "已隐藏")),
            h("input", {
              type: "checkbox",
              checked: state.petEnabled,
              onChange: (event) => {
                state.petEnabled = event.target.checked;
                preview();
              },
            })
          ),
          h(
            "div",
            { className: "dsh-skin-row" },
            h("label", null, "说话气泡", h("small", null, state.petBubble ? "会冒泡" : "只做表情，不出声")),
            h("input", {
              type: "checkbox",
              checked: state.petBubble,
              onChange: (event) => {
                state.petBubble = event.target.checked;
                preview();
              },
            })
          ),
          h(
            "div",
            { className: "dsh-skin-row" },
            h("label", null, "久坐提醒", h("small", null, state.petRest ? "坐满 45 分钟会喊你起来" : "已关闭")),
            h("input", {
              type: "checkbox",
              checked: state.petRest,
              onChange: (event) => {
                state.petRest = event.target.checked;
                preview();
              },
            })
          ),
          h(
            "div",
            { className: "dsh-skin-row" },
            h(
              "label",
              null,
              "跟随工作状态",
              h(
                "small",
                null,
                state.petWork
                  ? "有任务在跑她会安静陪着，跑完报一声，有东西等你处理会提醒"
                  : "已关闭：她只按自己的节奏活动，不看你在忙什么"
              )
            ),
            h("input", {
              type: "checkbox",
              checked: state.petWork,
              onChange: (event) => {
                state.petWork = event.target.checked;
                if (!state.petWork) {
                  PET.seenStatus = new Map();
                  PET.sessionCounts = null;
                  if (PET.mood === "focus") setMood("idle");
                }
                preview();
              },
            })
          ),
          // 安静时段：到点不闲聊，但「跑完了 / 等你处理」照报。
          h(
            "div",
            { className: "dsh-skin-row" },
            h(
              "label",
              null,
              "安静时段",
              h(
                "small",
                null,
                state.petQuiet
                  ? `${state.petQuietFrom}:00 - ${state.petQuietTo}:00 不闲聊，任务提醒照旧`
                  : "已关闭：任何时段都可能开口"
              )
            ),
            h(
              "div",
              { className: "dsh-skin-inline" },
              h(
                "select",
                {
                  value: String(state.petQuietFrom),
                  disabled: !state.petQuiet,
                  "aria-label": "安静时段开始",
                  onChange: (event) => {
                    state.petQuietFrom = Number(event.target.value);
                    preview();
                  },
                },
                Array.from({ length: 24 }, (_, hour) => h("option", { key: hour, value: String(hour) }, `${hour}:00`))
              ),
              h("span", { className: "sub" }, "到"),
              h(
                "select",
                {
                  value: String(state.petQuietTo),
                  disabled: !state.petQuiet,
                  "aria-label": "安静时段结束",
                  onChange: (event) => {
                    state.petQuietTo = Number(event.target.value);
                    preview();
                  },
                },
                Array.from({ length: 24 }, (_, hour) => h("option", { key: hour, value: String(hour) }, `${hour}:00`))
              ),
              h("input", {
                type: "checkbox",
                checked: state.petQuiet,
                "aria-label": "启用安静时段",
                onChange: (event) => {
                  state.petQuiet = event.target.checked;
                  preview();
                },
              })
            )
          ),
          // 九只角色已经撑爆下拉框了：改成一格一只的头像，
          // 选哪只一眼看得到样子，不用在十几行文字里找名字。
          PET_SKINS.length > 1 ? h(
            "div",
            { className: "dsh-skin-row dsh-skin-petrow" },
            h("label", null, "桌宠皮肤", h("small", null, `${currentPetSkin().label} · ${currentPetSkin().note}`)),
            h(
              "div",
              { className: "dsh-skin-petgrid", role: "radiogroup", "aria-label": "选择桌宠皮肤" },
              PET_SKINS.map((skin) => h(
                "button",
                {
                  key: skin.id,
                  type: "button",
                  role: "radio",
                  "aria-checked": state.petSkin === skin.id ? "true" : "false",
                  "aria-label": skin.label,
                  title: `${skin.label} · ${skin.note}`,
                  className: `dsh-skin-petcard${state.petSkin === skin.id ? " is-active" : ""}`,
                  onClick: () => {
                    if (state.petSkin === skin.id) return;
                    state.petSkin = skin.id;
                    // 先把这个角色的图载上，切过去就是现成的，不会白闪一下。
                    preloadPetFrames(skin.id);
                    preview();
                  },
                },
                h("img", { src: petAsset("idle", skin.id), alt: "", draggable: "false" }),
                h("span", null, skin.label)
              ))
            )
          ) : null,
          slider(
            "桌宠大小",
            state.petSize,
            72,
            220,
            1,
            (value) => {
              state.petSize = value;
              preview();
            },
            "px"
          ),
          h("div", { className: "sub" }, "点一下试试看她的反应 · 双击会转一圈"),
          h(
            "div",
            { className: "dsh-skin-gallery" },
            PET_STATES.map((mood) =>
              h(
                "button",
                {
                  key: mood,
                  className: PET.mood === mood ? "active" : "",
                  onClick: () => {
                    setMood(mood);
                    if (mood === "shy") say(pick("shy"));
                    else if (mood === "sulk") say(pick("sulk"));
                    else if (mood === "sad") say(pick("sad"));
                    else if (mood === "happy") say(pick("done"));
                    else if (mood === "focus") say(pick("focus"));
                    else say(pick("poke"));
                  },
                },
                h("img", { src: petAsset(mood), alt: "" }),
                h("span", null, PET_LABELS[mood])
              )
            )
          ),
          h(
            "div",
            { className: "dsh-skin-stat" },
            PET.sessionCounts
              ? `工作状态联动中 · 在跑 ${PET.sessionCounts.running} · 等你处理 ${PET.sessionCounts.waiting} · 待查看 ${PET.sessionCounts.done}`
              : "还没收到会话状态（宿主没下发时这行会一直空着，桌宠照常活动）"
          ),
          h(
            "div",
            { className: "dsh-skin-stat" },
            `认识 ${daysKnown()} 天 · 今天被戳了 ${state.petTodayPokes || 0} 次`
          ),
          h(
            "div",
            { style: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" } },
            h(
              "button",
              {
                className: "dsh-skin-btn secondary",
                onClick: () => {
                  turnPet({ full: true });
                },
              },
              "转身一圈"
            ),
            h(
              "button",
              {
                className: "dsh-skin-btn secondary",
                onClick: () => {
                  setMood("happy", { hold: 2600 });
                  say(pick("idle"), 6000);
                  if (!state.petBubble) {
                    state.petBubble = true;
                    persist();
                  }
                },
              },
              "让她说句话"
            ),
            h(
              "button",
              {
                className: "dsh-skin-btn secondary",
                onClick: () => {
                  state.petX = null;
                  state.petY = null;
                  preview();
                },
              },
              "回到角落"
            )
          )
        )
        )
          ),
          h(
            "div",
            { className: "dsh-skin-foot" },
            h("span", { className: "dsh-skin-draft", role: "status", "aria-live": "polite" }, saveStatus),
            h("button", { className: "dsh-skin-btn", type: "button", onClick: closePanel }, "完成")
          )
        )
      );
    }

    function renderSettings() {
      if (!settingsRoot) return;
      settingsRoot.innerHTML = "";
    }

    function MainPanel() {
      return h(AppearancePanel);
    }
    /**
     * 侧栏那一行的图标，同时充当「会话状态桥」。
     *
     * 为什么放在这里：桌宠是命令式 DOM（apply 里自己建节点），拿不到 React 钩子；
     * 而宿主会把标准 props（useSessions / useSessionStatus）下发给每个已注册的槽位组件。
     * 这个图标一直都在（哪怕面板没打开），借它的渲染顺便读一次会话状态，交给
     * observeSessions 决定她该换什么形态。宿主没下发钩子时，整条联动静默失效。
     */
    function PanelGlyph(props) {
      const given = props || {};
      const statusHook = typeof given.useSessionStatus === "function" ? given.useSessionStatus : null;
      const listHook = typeof given.useSessions === "function" ? given.useSessions : null;
      // 钩子必须**无条件、同顺序**调用（React 规则）：宿主没给的那条用固定返回空值的假钩子占位。
      // 早先写成三元判断，钩子数量会随 props 变化 —— 调试期间看不出问题，但它是个真隐患。
      const selectList = listHook ?? ((selector) => selector(EMPTY_SESSION_LIST));
      const selectStatus = statusHook ?? ((selector) => selector(EMPTY_STATUSES));
      let statuses = null;
      let list = null;
      try {
        statuses = selectStatus((value) => value) ?? null;
        list = selectList((value) => value) ?? null;
      } catch {
        statuses = null;
        list = null;
      }
      PET.hooksSeen = { sessions: Boolean(listHook), status: Boolean(statusHook) };
      const useEffect = typeof React.useEffect === "function" ? React.useEffect : null;
      if (typeof useEffect === "function") {
        // 依赖是这两份快照本身：宿主每次推送都会换新对象，也就意味着要重算一次。
        useEffect(() => {
          observeSessions(statuses, list);
        }, [statuses, list]);
        // 侧栏图标是**一直挂着的**，正好当「页面装配完成」的信号 —— 顺手把桌面那只补回来。
        // 除了这一次，还要挂个定时器：宿主重启会把她收走，而页面只是重连、不会重新装配。
        useEffect(() => {
          autoDesktop();
          startAutoDesktopTimer();
        }, []);
      }
      const counts = PET.sessionCounts;
      const dot = counts && counts.waiting > 0 ? " waiting" : counts && counts.running > 0 ? " running" : "";
      return h(
        "span",
        { className: `dsh-skin-glyph${dot}`, "aria-hidden": "true", style: { fontSize: 16, lineHeight: 1 } },
        "✦"
      );
    }

    // ── 降级与自保 ────────────────────────────────────────────────────────────
    /**
     * 出问题时记一笔，但**不把异常往上抛**。
     *
     * 客户端插件的 `apply` 一旦抛异常，宿主会把整个 web 装配判为失败，页面只剩
     * 一行「Failed to load plugins」—— 皮肤坏掉不该有这种权力。所以这里全部降级：
     * 能用的部分照常生效，坏掉的那块在控制台留证据。
     *
     * 注意边界：这里只能接住**运行期**异常。文件本身的语法错误、模块求值失败
     * （`import failed`）发生在 apply 之前，catch 不到，那种情况仍然会白屏 ——
     * 改这个文件前请先 `node --check client.js`。
     */
    const issues = [];
    function note(part, error) {
      const message = String(error && error.message ? error.message : error);
      issues.push({ part, message });
      try {
        console.error(`[dsh-skin] ${part} 失败：${message}`, error);
      } catch {
        /* 控制台都没有就只能算了 */
      }
    }
    /**
     * 跑一段可能失败的装配，失败就记一笔。
     * @param {string} part 日志里显示的环节名。
     * @param {() => any} run 装配动作。
     * @returns {any} 成功时的返回值；失败为 undefined。
     */
    function safely(part, run) {
      try {
        return run();
      } catch (error) {
        note(part, error);
        return undefined;
      }
    }
    /**
     * 注册一个槽位。要包两层：`ctx.effect` 本身可能不存在，
     * 回调体里的 `ctx.slots.*` 也可能在激活期就抛（漏写 inject 时就是这种）。
     * @param {any} ctx 客户端上下文。
     * @param {string} part 环节名。
     * @param {() => any} mount 真正的注册动作。
     */
    function register(ctx, part, mount) {
      return safely(part, () => {
        if (typeof ctx?.effect !== "function") throw new Error("宿主没有 ctx.effect");
        return ctx.effect(() => safely(part, mount), part);
      });
    }

    function apply(ctx) {
      runtimeContext = ctx;
      // 接管权：从这一刻起，之前那批实例的定时器会自己停。
      RUNTIME.instance = INSTANCE;
      safely("刷新样式", injectStyles);
      // 必须在第一次改色之前：这份快照就是「宿主原本长什么样」，
      // 退出口（data-dsh-skin="off"）靠它还回去。
      safely("记录宿主的原始令牌", captureHostTokens);
      safely("监听主题模式", () => {
        const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
        const refreshCssMode = () => {
          const skin = SKINS.find((item) => item.id === state.skin) || SKINS[0];
          const base = THEME_TOKENS[skin.id] || THEME_TOKENS.ocean;
          const tokens = tokensForAppearance(base, state.customColors);
          // 宿主深浅色变了 → 它自己的令牌也变了，退出口那份快照要跟着更新。
          recaptureHostTokens();
          writeCssThemeTokens(tokens);
        };
        media?.addEventListener?.("change", refreshCssMode);
      });
      safely("应用外观", () => applyAppearance(ctx));
      safely("发布换肤接口", () => {
        RUNTIME.api = {
          version: 1,
          list: () => skinSnapshot(),
          get: () => skinSnapshot(),
          apply: (patch) => applyFromOutside(patch),
        };
        // 没有 window.addEventListener 的环境（冒烟用的假 DOM）就只留 api。
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
          // 只留当前实例这一条：面板重挂几次不该叠出几个监听器。
          if (RUNTIME.applyHandler) {
            try {
              window.removeEventListener(SKIN_EVENT_APPLY, RUNTIME.applyHandler);
            } catch {
              /* 老的摘不掉也无妨，下面这条会覆盖它 */
            }
          }
          RUNTIME.applyHandler = (event) => safely("外部换肤请求", () => applyFromOutside(event && event.detail));
          window.addEventListener(SKIN_EVENT_APPLY, RUNTIME.applyHandler);
        }
      });
      safely("渲染桌宠", renderPet);
      // 预载只做当前角色那 12 帧（在 renderPet 里触发）。九只全载是 108 个请求，没必要。
      register(ctx, "注册主区面板", () =>
        ctx.slots.inject("main", () =>
          ctx.slots.register({ name: "main", key: PANEL_KEY }, MainPanel)
        )
      );
      register(ctx, "注册侧栏入口", () =>
        ctx.slots.inject("sidebar.panellist", () =>
          ctx.slots.register(
            { name: "sidebar.panellist", id: PANEL_KEY, order: 10, label: () => PANEL_LABEL },
            PanelGlyph
          )
        )
      );
      // 最后才写日志：此时 issues 已经攒齐，能一次说清降级了几处。
      safely("广播初始外观", announceAppearance);
      // 现场排查入口：控制台里 `__dshSkinDebug()` 就能看到「钩子给没给、计数多少、
      // 最近一句说了什么、tokens 是多少」。这条链路全靠宿主下发，静默失效最难查。
      safely("挂调试入口", () => {
        if (GLOBAL) GLOBAL.__dshSkinDebug = () => exports.debugSnapshot();
      });
      safely("写启动日志", () => {
        if (issues.length === 0) ctx.logger?.info?.("dsh-skin: appearance panel ready");
        else ctx.logger?.warn?.(`dsh-skin: ${issues.length} 处降级，详见控制台`);
      });
    }
    exports.apply = apply;
    /**
     * 必需服务（Cordis fiber inject）。宿主把模块导出整体当作插件对象，
     * 少了这一句，apply 里第一次碰 ctx.slots 就会抛
     * `cannot get property "slots" without inject`，进而让**整个 Web** 只剩
     * 一行 Failed to load plugins —— 不是本面板坏掉而已。
     */
    exports.inject = ["slots", "layout"];
    /**
     * 降级清单（只读快照）。给冒烟测试和现场排查用：
     * 返回空数组说明这次装配一处都没降级。
     * @returns {Array<{ part: string, message: string }>}
     */
    exports.diagnostics = () => issues.map((issue) => ({ ...issue }));
    exports.MainPanel = MainPanel;
    exports.PANEL_KEY = PANEL_KEY;
    /** 语料与形态清单只读导出，给内容体检脚本用（verify/pet-content.mjs）。 */
    exports.LINES = LINES;
    exports.PET_STATES = PET_STATES;
    exports.PET_FRAME_STATES = PET_FRAME_STATES;
    /** 转身朝向清单。verify/pet-content.mjs 靠它找素材、校验帧数。 */
    exports.TURN_FRAMES = TURN_FRAMES;
    exports.TURN_SEQUENCE = TURN_SEQUENCE;
    exports.TURN_STEP_MS = TURN_STEP_MS;
    exports.PET_LABELS = PET_LABELS;
    exports.PET_SKINS = PET_SKINS;
    exports.petAsset = petAsset;
    // 可测面：纯逻辑单独导出，给 verify/ 直接断言（不依赖宿主）。
    exports.pick = pick;
    exports.petName = petName;
    exports.quietNow = quietNow;
    exports.syncOpaqueSurfaces = syncOpaqueSurfaces;
    exports.syncContentAreas = syncContentAreas;
    exports.syncResizeCursors = syncResizeCursors;
    exports.AREA_CLASS = AREA_CLASS;
    exports.captureHostTokens = captureHostTokens;
    exports.HOST_TOKENS = HOST_TOKENS;
    exports.colorAlpha = colorAlpha;
    exports.cursorCssFor = cursorCssFor;
    exports.CURSOR_THEMES = CURSOR_THEMES;
    exports.CURSOR_HOTSPOT = CURSOR_HOTSPOT;
    exports.cursorThemeId = cursorThemeId;
    exports.withAlpha = withAlpha;
    exports.wallpaperVeilAlpha = wallpaperVeilAlpha;
    exports.wallpaperLumaCache = wallpaperLumaCache;
    exports.measureWallpaperLuma = measureWallpaperLuma;
    exports.GLASS_CLASS = GLASS_CLASS;
    exports.inQuietRange = inQuietRange;
    exports.snapToEdge = snapToEdge;
    exports.snapPosition = snapPosition;
    exports.CHARACTER_LINES = CHARACTER_LINES;
    // 表面可读性：壁纸模式下背景面的 alpha 计算（纯函数，harness 直接断言）
    exports.THEME_TOKENS = THEME_TOKENS;
    exports.limitSurfaceAlpha = limitSurfaceAlpha;
    exports.tokensForAppearance = tokensForAppearance;
    exports.releaseVelocity = releaseVelocity;
    exports.observeSessions = observeSessions;
    exports.sessionCounts = () => (PET.sessionCounts ? { ...PET.sessionCounts } : null);
    exports.seenStatus = () => new Map(PET.seenStatus);
    // 播报文本与用量归一化也要能单测：它们决定了「跑完那句」里有没有数字。
    exports.announceFinished = announceFinished;
    exports.formatDuration = formatDuration;
    exports.formatTokens = formatTokens;
    exports.normalizeUsage = normalizeUsage;
    exports.usageTotal = usageTotal;
    exports.pendingLabel = pendingLabel;
    exports.defaultState = () => ({ ...DEFAULTS });
    exports.desktopAuto = () => false;
    exports.usageForSession = usageForSession;
    exports.trajectoryUsage = trajectoryUsage;
    exports.shortTitle = shortTitle;
    // 现场排查用：真实页面里一眼看到「钩子给没给、投影里有没有 tokenUsage」。
    // 这条链路全靠宿主下发，静默失效是最难查的那种，所以留一个可读的快照。
    exports.debugSnapshot = () => ({
      hooks: { ...PET.hooksSeen },
      counts: PET.sessionCounts ? { ...PET.sessionCounts } : null,
      lastSpoken: PET.lastSpoken,
      lastUsage: PET.lastUsage,
      // 桌宠自查：关掉再打开这类问题，看这四个值最快
      pet: {
        enabled: state.petEnabled,
        mood: PET.mood,
        renderedAsset: PET.renderedAsset,
        booted: PET.booted,
        images: document.querySelectorAll?.("#dsh-skin-pet-root .pet-img")?.length ?? 0,
        src: document.querySelector?.("#dsh-skin-pet-root .pet-img")?.getAttribute?.("src") ?? null,
      },
    });
    exports.desktopState = () => ({ ...DESKTOP });
    exports.WALLPAPERS = WALLPAPERS;
    exports.SKINS = SKINS;
    /** 跨插件换肤契约。事件名与纯函数都导出，给 verify/ 直接断言。 */
    exports.SKIN_EVENT_APPLY = SKIN_EVENT_APPLY;
    exports.SKIN_EVENT_CHANGED = SKIN_EVENT_CHANGED;
    exports.skinSnapshot = skinSnapshot;
    exports.applyFromOutside = applyFromOutside;
    return module.exports;
  },
});
