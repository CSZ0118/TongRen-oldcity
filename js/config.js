/**
 * 全项目「单一数据源」。
 *
 * 所有跟内容/素材有关的东西都写在这里，其它模块只读不改。
 * 这样 6 个彩蛋 → 6 座天宫建筑 → 6 个音效 的对应关系只有一处定义，
 * 美术/文案同学按下面的文件名交素材即可自动接上，前端不用改代码。
 *
 * ⚠️ 改这里之前先看一眼 docs/ASSETS.md 的命名规范。
 *
 * 2026-10-04 变更：放弃 3D 建模 + AI 视频，改纯 2D（SVG 描边 + 粒子 + 伪 3D）。
 * 彩蛋只关联两样东西：建筑造型（shape → stage2d.js 里的 SVG 线稿）+ 音效（audio）。
 */

/** 版本号：调试面板会显示，方便对账 */
export const BUILD = {
  stage: 'Day3',
  name: '贵州人间长卷 · 点亮天宫',
  version: '0.2.1',
};

/**
 * 6 个彩蛋 / 6 座天宫建筑。
 *
 * x, y  —— 彩蛋「小圆球」热点在长卷上的位置（0~1，相对长卷宽/高）。
 * bx,by —— 建筑从哪长出来（默认跟着 x/y；想跟圆球错开就单独设）
 * building —— 点中后长出来的天宫建筑名（信息卡显示）
 * shape —— 建筑造型，对应 config.js 的 BUILDING_IMG（真图 PNG）
 * hue  —— 建筑的色相（0~1，乘 360 得到 HSL 色相，用于光晕/粒子）
 * scale —— 建筑大小缩放（1=默认，1.3 放大 / 0.8 缩小）
 * flipX —— 是否水平镜像（true=左右翻转）
 * audio —— 音效（缺失时自动用 WebAudio 合成一声钟磬，保证有反馈）
 */
export const EGGS = [
  {
    id: 'tongren',
    no: 1,
    place: '铜仁古城',
    title: '抹茶铺',
    hint: '抹茶铺，有人喝茶',
    building: '南天门式城楼',
    audio: 'assets/audio/01-tongren.mp3',
    x: 0.073,
    y: 0.73,
    bx: 0.073,
    by: 0.73,
    shape: 'gateTower',
    scale: 1.6,
    hue: 0.09,
    reveal: 'assets/reveal/01-tongren-people.svg', // 占位：真人图到位后换成 png
  },
  {
    id: 'dongzhai',
    no: 2,
    place: '黔东南侗寨',
    title: '鼓楼',
    hint: '鼓楼下有人唱侗歌',
    building: '天宫鼓楼，飞檐入云',
    audio: 'assets/audio/02-dongzhai.mp3',
    x: 0.318,
    y: 0.7,
    bx: 0.318,
    by: 0.88,
    shape: 'drumTower',
    scale: 3,
    hue: 0.12,
    reveal: 'assets/reveal/02-dongzhai-people.svg', // 占位：真人图到位后换成 png
    revealW: 0.05,
  },
  {
    id: 'fengyuqiao',
    no: 3,
    place: '风雨桥',
    title: '桥上渡影',
    hint: '桥上有人渡影',
    building: '天宫廊桥，横跨云海',
    audio: 'assets/audio/03-fengyuqiao.mp3',
    x: 0.49,
    y: 0.69,
    bx: 0.47,
    by: 0.97,
    shape: 'bridge',
    scale: 3.3,
    flipX: true,
    hue: 0.55,
    reveal: 'assets/reveal/03-fengyuqiao-people.svg', // 占位：真人图到位后换成 png
  },
  {
    id: 'jiaxiulou',
    no: 4,
    place: '甲秀楼',
    title: '水中垂钓',
    hint: '水中倒影有人垂钓',
    building: '天宫楼阁，浮于云面',
    audio: 'assets/audio/04-jiaxiulou.mp3',
    x: 0.560,
    y: 0.499,
    bx: 0.538,
    by: 0.698,
    shape: 'pavilion',
    scale: 2.2,
    hue: 0.58,
    reveal: 'assets/reveal/04-jiaxiulou-people.svg', // 占位：真人图到位后换成 png
  },
  {
    id: 'zhenyuan',
    no: 5,
    place: '镇远古镇',
    title: '山间挑担',
    hint: '山间有人挑担',
    building: '天宫山坡，依云而建',
    audio: 'assets/audio/05-zhenyuan.mp3',
    x: 0.770,
    y: 0.460,
    bx: 0.743,
    by: 0.600,
    shape: 'hillside',
    scale: 2.2,
    hue: 0.30,
    reveal: 'assets/reveal/05-zhenyuan-people.svg', // 占位：真人图到位后换成 png
  },
  {
    id: 'fanjingshan',
    no: 6,
    place: '梵净山',
    title: '金顶祈福',
    hint: '金顶有人祈福',
    building: '天宫金顶，云海环绕',
    audio: 'assets/audio/06-fanjingshan.mp3',
    x: 0.980,
    y: 0.50,
    bx: 0.880,
    by: 0.580,
    shape: 'goldenSummit',
    scale: 2.0,
    hue: 0.10,
    reveal: 'assets/reveal/06-fanjingshan-people.svg', // 占位：真人图到位后换成 png
  },
];

/** 壁画长卷（现在用的是团队出的真图，路径指到 assets/img/scroll-guizhou.png） */
export const SCROLL = {
  /** 团队的真图。改成 null 就回到代码画的占位长卷 */
  image: 'assets/img/scroll-guizhou.png',
  /**
   * 长卷的 宽/高 比。
   *
   * 为什么是 6.0：长卷的显示高度 = 视口高度，显示宽度 = max(高度×aspect, 视口宽×minScreens)。
   * 在 16:9 屏幕上，minScreens 那一项 = 3.4 × 16/9 ≈ 6.04 倍视口高度，正好和 aspect=6 对齐。
   * 所以 **计科B 出图请按 6:1 出**，推荐 6144×1024 或 7680×1280。
   * 出图比例跟这里差太多的话，图会被拉伸。
   */
  aspect: 6.0,
  /** 长卷至少要有几屏宽，保证「长卷」的滚动手感 */
  minScreens: 3.4,
  /** 滚动阻尼（0~1，越大越跟手） */
  damping: 0.14,
  /** 滚轮/触控板缩放系数 */
  wheelSpeed: 1.05,
  /** 拖拽灵敏度 */
  dragSpeed: 1.30,
  /** 到边之后的橡皮筋强度 */
  edgeBounce: 0.30,
  /** 停手后是否自动对齐到最近的彩蛋 */
  snapToEgg: false,
};

/** 纯 2D 特效舞台 */
export const STAGE2D = {
  enabled: true,
  /** 建筑从壁画里立起来的时长（秒）；CSS 里还有同名过渡，改这里主要供 JS 参考 */
  growDuration: 1.1,
  /**
   * 建筑高度占视口高度的比例。0.34 大约是一屏的三分之一 ——
   * 够醒目（毕竟是「天宫长出来」的高光时刻），又不会把壁画整个盖住。
   */
  buildingHeightRatio: 0.34,
  /** 每次点亮爆发的粒子数量 */
  particleCount: 70,
};

/** 6 座天宫的透明底真图（即梦出图 + 抠图）。shape → 图片路径 */
export const BUILDING_IMG = {
  gateTower: 'assets/buildings/01-gateTower.png',
  drumTower: 'assets/buildings/02-drumTower.png',
  bridge: 'assets/buildings/03-bridge.png',
  pavilion: 'assets/buildings/04-pavilion.png',
  hillside: 'assets/buildings/05-hillside.png',
  goldenSummit: 'assets/buildings/06-goldenSummit.png',
};

/** 背景乐（BGM）：三段随进度切换，音频实现见 audio.js */
export const BGM = {
  // 三段背景乐基名（不带扩展名，audio.js 自动补 .ogg / .mp3 双格式）
  opening: 'assets/bgm/bgm-opening-spring-v05',
  mid: 'assets/bgm/bgm-mid-rise-v05',
  ending: 'assets/bgm/bgm-ending-winter-v05',
  // 点亮几座天宫后从「开场春」切到「中段升」（6 座取一半）
  midThreshold: 3,
  // 背景乐整体音量（比音效低，别盖住钟磬）
  volume: 0.5,
  // 切换时的淡入淡出时长（毫秒）
  fadeMs: 600,
};

/** 文案 */
export const COPY = {
  title: '贵州人间长卷',
  subtitle: '点中画里的彩蛋，天宫就从壁画里长出来',
  loading: '正在铺开长卷…',
  hintEgg: '点一下试试',
  progressLabel: (found, total) => `已点亮 ${found} / ${total} 座天宫`,
  allFound: '六座天宫齐亮 · 云海洞开',
  finaleLine: '人间烟火，天上宫阙，都在这一卷里。',
  reset: '重看一遍',
  soundOn: '音效 开',
  soundOff: '音效 关',
};

/** 存档 key：刷新页面后「已点亮」的进度不丢 */
export const STORAGE_KEY = 'tongren-oldcity:found:v1';

/** 调试面板：?debug=1 或按 D 键 */
export const DEBUG = new URLSearchParams(location.search).has('debug');

/** 6 个彩蛋的统一 index → id 映射，方便素材自检遍历 */
export const EGG_IDS = EGGS.map((e) => e.id);
