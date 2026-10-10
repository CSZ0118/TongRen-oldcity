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
    desc: '抹茶铺中石磨轻转，一缕茶香袅袅升起，在古城之上凝成南天门式城楼——人间烟火最盛处，便通天上宫阙。',
    npc: {
      name: '茶婆',
      role: '抹茶铺掌柜',
      emoji: '🍵',
      hello: '客官远道而来，先饮一碗梵净山抹茶润润喉？',
      questions: [
        { q: '抹茶是怎么做出来的？', a: '鲜茶叶蒸青后焙干，再用石磨细细碾成粉末，热水一冲、茶筅一搅，便成一杯青翠。铜仁的抹茶，正是这样古法做出来的。' },
        { q: '铜仁为什么能种出好抹茶？', a: '铜仁坐拥梵净山，云雾多、昼夜温差大，茶树生得慢、叶片嫩，抹茶自然鲜爽。这里还是“中国抹茶之乡”哩。' },
        { q: '这古城有多少年头了？', a: '铜仁古城临锦江而立，城楼、会馆、吊脚楼一应俱全，自古就是黔东门户，商贾往来、茶香不断。' },
        { q: '抹茶除了喝还能做什么？', a: '抹茶酥、抹茶冰、抹茶面……如今的铜仁人把一抹茶绿揉进吃穿用度，连空气里都是清苦回甘的香。' },
      ],
    },
    poem: ['石磨香茶绕古城', '青烟一缕化天门', '人间烟火连云起', '玉阙琼楼别样春'],
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
    desc: '侗寨鼓楼不用一钉一铆，侗歌一起，飞檐便刺破云层，化作天宫里最高的鼓楼，众神击鼓而歌。',
    npc: {
      name: '歌师',
      role: '侗族大歌传唱人',
      emoji: '🎶',
      hello: '侗家人说，饭养身、歌养心，你要不要听一段？',
      questions: [
        { q: '侗族大歌为什么能无伴奏合唱？', a: '大歌靠人声分声部，高低错落如林间风、山涧水，不需一件乐器。侗家人从小跟着歌师学，一唱就是一辈子。' },
        { q: '鼓楼为什么不用一颗钉子？', a: '鼓楼全用榫卯咬合，木柱层层挑出，飞檐如伞。侗寨先民用一把斧、一柄凿，就立起了这入云的木塔。' },
        { q: '鼓楼在寨子里是做什么用的？', a: '议事、迎客、对歌、祭祀都在这。鼓一敲，全寨都来。鼓楼就是侗寨的心。' },
        { q: '天宫鼓楼为什么特别高？', a: '传说鼓楼越高，离天越近，歌也唱得越清亮。你听，这鼓声都传上九重天去了。' },
      ],
    },
    poem: ['侗歌飞上九重天', '鼓楼如塔入云烟', '无钉无铆千年立', '一样飞檐一样仙'],
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
    desc: '风雨桥上行人渡影，桥身横跨一江，在天上化为一廊虹桥，横卧云海，连接人间与天宫。',
    npc: {
      name: '桥匠',
      role: '风雨桥营造师傅',
      emoji: '🌉',
      hello: '桥连两岸，也渡行人，你有话，桥头慢慢说。',
      questions: [
        { q: '为什么叫“风雨桥”？', a: '桥上盖顶、设廊、立亭，行人歇脚避风雨，故名风雨桥。风雨再大，桥里也安。' },
        { q: '风雨桥也是榫卯做的吗？', a: '正是。整座桥不用铁钉，木梁木柱层层咬合，横跨河面，几百年不塌，是侗族木匠的绝活。' },
        { q: '桥上为什么还有渡船？', a: '桥下碧水，船来船往。风雨桥与渡船一静一动，都是这方水土往来的路。' },
        { q: '天宫廊桥架在哪儿？', a: '架在云海之上，一头是人间炊烟，一头是天上宫阙，凡人仙人，皆从桥上过。' },
      ],
    },
    poem: ['风雨桥头渡影长', '一朝飞架白云乡', '雕梁画栋皆天造', '恰似长虹卧碧苍'],
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
    desc: '甲秀楼立于南明河上，水中倒影如镜，垂钓人静坐水畔，钓起的正是天上楼阁的倒影。',
    npc: {
      name: '钓翁',
      role: '南明河畔垂钓人',
      emoji: '🎣',
      hello: '南明河水清，钓鱼也钓一份闲，你问什么，老夫慢慢道来。',
      questions: [
        { q: '甲秀楼为什么叫“甲秀”？', a: '“甲秀”取“科甲挺秀”之意，盼贵阳才俊辈出。楼立于南明河鳌矶石上，三层三檐，飞甍翘角，是贵阳的文脉地标。' },
        { q: '甲秀楼有多少年了？', a: '明万历年间始建，至今四百余年，几经重修。它见过河上渔火，也见过城里书声。' },
        { q: '楼边为什么总有人钓鱼？', a: '南明河绕楼而过，水清鱼肥。钓翁们守的哪里是鱼，是这半城山水、一城烟火。' },
        { q: '天宫楼阁为什么浮在水面？', a: '甲秀楼本就立在河中，水里的倒影晃着晃着，便映出了天上楼阁的模样。' },
      ],
    },
    poem: ['碧水楼台一钓竿', '云影天光镜里看', '甲秀千年钟秀处', '飞甍翘角入云端'],
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
    desc: '镇远依山而建，挑担人拾级而上，青石台阶层层，一路通向云中的天城。',
    npc: {
      name: '挑夫',
      role: '古驿道挑担人',
      emoji: '🧺',
      hello: '肩上一根扁担，走了一辈子古道，你有疑问，路上说。',
      questions: [
        { q: '镇远为什么建在山上？', a: '镇远依㵲阳河而建，两岸山势陡峭，房屋便层层叠叠攀上山坡，成了这“山城”模样，故有“滇楚锁钥、黔东门户”之称。' },
        { q: '挑担人都挑些什么？', a: '旧时盐、茶、布、药材，都靠挑夫沿古驿道一担一担运。一根扁担，挑起了整座城的生计。' },
        { q: '镇远的古驿道通往哪里？', a: '往东连湘楚，往西接滇黔，是古时中原入滇的必经之路，马帮与挑夫在此歇脚，热闹了几百年。' },
        { q: '天宫山城夜里亮灯吗？', a: '亮。人间镇远的灯火一层层亮到山顶，与天上星子连成一片，分不清哪是人家，哪是仙阙。' },
      ],
    },
    poem: ['青石千阶云里伸', '挑担人向玉京行', '依山楼阁层层起', '灯火相连到月明'],
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
    desc: '梵净山金顶孤峰擎天，朝圣者登顶祈福，云海翻涌之间，化作天宫金顶，镇守一方。',
    npc: {
      name: '老僧',
      role: '金顶朝圣者',
      emoji: '🙏',
      hello: '阿弥陀佛，云海之上，心诚则灵，施主有何想问？',
      questions: [
        { q: '梵净山金顶有多高？', a: '梵净山主峰二千四百余米，金顶一柱擎天，立于云海之上，登顶如踏天梯，凡尘尽在脚下。' },
        { q: '金顶为什么一分为二？', a: '山巅有一道石缝，将金顶劈成两半，上有天桥相连。传说那是仙凡分界处，一步跨过，便入天宫。' },
        { q: '梵净山是哪位菩萨的道场？', a: '梵净山是弥勒菩萨道场，古称“梵天净土”。千年间香火不绝，朝圣者登顶祈福，愿寄长风。' },
        { q: '山上的蘑菇石是什么？', a: '金顶附近有巨石上大下小，状如蘑菇，风雨亿万年雕成。它立在崖边，看尽云海翻涌、日出日落。' },
      ],
    },
    poem: ['孤峰拔地刺苍穹', '金顶浮于云海中', '一柱梵天分二界', '人间祈愿寄长风'],
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
