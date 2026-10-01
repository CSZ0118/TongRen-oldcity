/**
 * 全项目「单一数据源」。
 *
 * 所有跟内容/素材有关的东西都写在这里，其它模块只读不改。
 * 这样 6 个彩蛋 → 6 段视频 → 6 座建筑 的对应关系只有一处定义，
 * 美术/视频同学按下面的文件名交素材即可自动接上，前端不用改代码。
 *
 * ⚠️ 改这里之前先看一眼 docs/ASSETS.md 的命名规范。
 */

/** 版本号：素材自检面板、调试面板都会显示，方便对账 */
export const BUILD = {
  stage: 'Day1',
  name: '贵州人间长卷 · 点亮天宫',
  version: '0.1.0',
};

/**
 * 6 个彩蛋 / 6 座天宫建筑。
 *
 * x, y  —— 彩蛋在长卷上的位置，取值 0~1（相对整幅长卷的宽 / 高）。
 *          美术出图后，按壁画上实际藏彩蛋的位置微调这两个数即可。
 * model —— 建筑同学交付的 GLB（Day2 建，缺失时自动降级成占位建筑）
 * video —— 计科B 剪的「建筑长出来」短视频（Day2 生成，缺失时自动跳过）
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
    model: 'assets/models/01-tongren-nantianmen.glb',
    video: 'assets/video/01-tongren.mp4',
    audio: 'assets/audio/01-tongren.mp3',
    x: 0.090,
    y: 0.585,
    // 占位建筑造型：城楼 = 台基 + 楼身 + 重檐 + 门洞
    shape: 'gateTower',
    hue: 0.09,
  },
  {
    id: 'dongzhai',
    no: 2,
    place: '黔东南侗寨',
    title: '鼓楼',
    hint: '鼓楼下有人唱侗歌',
    building: '天宫鼓楼，飞檐入云',
    model: 'assets/models/02-dongzhai-gulou.glb',
    video: 'assets/video/02-dongzhai.mp4',
    audio: 'assets/audio/02-dongzhai.mp3',
    x: 0.257,
    y: 0.520,
    shape: 'drumTower',
    hue: 0.12,
  },
  {
    id: 'fengyuqiao',
    no: 3,
    place: '风雨桥',
    title: '桥上渡影',
    hint: '桥上有人渡影',
    building: '天宫廊桥，横跨云海',
    model: 'assets/models/03-fengyuqiao-langqiao.glb',
    video: 'assets/video/03-fengyuqiao.mp4',
    audio: 'assets/audio/03-fengyuqiao.mp3',
    x: 0.424,
    y: 0.640,
    shape: 'bridge',
    hue: 0.55,
  },
  {
    id: 'jiaxiulou',
    no: 4,
    place: '甲秀楼',
    title: '水中垂钓',
    hint: '水中倒影有人垂钓',
    building: '天宫楼阁，浮于云面',
    model: 'assets/models/04-jiaxiulou-louge.glb',
    video: 'assets/video/04-jiaxiulou.mp4',
    audio: 'assets/audio/04-jiaxiulou.mp3',
    x: 0.591,
    y: 0.500,
    shape: 'pavilion',
    hue: 0.58,
  },
  {
    id: 'zhenyuan',
    no: 5,
    place: '镇远古镇',
    title: '山间挑担',
    hint: '山间有人挑担',
    building: '天宫山坡，依云而建',
    model: 'assets/models/05-zhenyuan-shangong.glb',
    video: 'assets/video/05-zhenyuan.mp4',
    audio: 'assets/audio/05-zhenyuan.mp3',
    x: 0.758,
    y: 0.560,
    shape: 'hillside',
    hue: 0.30,
  },
  {
    id: 'fanjingshan',
    no: 6,
    place: '梵净山',
    title: '金顶祈福',
    hint: '金顶有人祈福',
    building: '天宫金顶，云海环绕',
    model: 'assets/models/06-fanjingshan-jinding.glb',
    video: 'assets/video/06-fanjingshan.mp4',
    audio: 'assets/audio/06-fanjingshan.mp3',
    x: 0.912,
    y: 0.470,
    shape: 'goldenSummit',
    hue: 0.10,
  },
];

/** 素材缺失时，用来兜底测试「视频播放」这条链路的那段素材 */
export const FALLBACK_VIDEO = 'assets/video/selftest/cc0-testclip.mp4';

/** 壁画长卷（Day2 由计科B 用 AI 生成后替换；现在用代码画的占位长卷顶上） */
export const SCROLL = {
  /** AI 出图后，把这里改成图片路径，例如 'assets/img/scroll-guizhou.jpg' */
  image: null,
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

/** 3D 舞台 */
export const STAGE3D = {
  enabled: true,
  /** 建筑从壁画里长出来的时长（秒） */
  growDuration: 1.5,
  /** 建筑自转速度（弧度/秒） */
  spinSpeed: 0.28,
  /** 建筑悬停浮动振幅（世界单位） */
  floatAmplitude: 0.06,
  /** 点亮后的自发光强度 */
  glowIntensity: 1.5,
  /** 相机视锥高度（世界单位）；调小 = 建筑看起来更大 */
  frustumHeight: 3.2,
  /**
   * 建筑高度占视口高度的比例。0.34 大约是一屏的三分之一 ——
   * 够醒目（毕竟是"天宫长出来"的高光时刻），又不会把壁画整个盖住。
   */
  buildingHeightRatio: 0.34,
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
