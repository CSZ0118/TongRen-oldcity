# 前端架构

> 给后面接手改代码的人看。读完这份，你应该能知道「加一个彩蛋」「换掉占位图」该动哪一行。

---

## 一、整体形状

一个页面，一条体验链路，**没有路由、没有状态管理库、没有构建工具**。

```
用户拖动长卷  →  发现画里的彩蛋  →  点中
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
   视频层播「长出」动画          音效（mp3 或合成）          彩蛋进度 +1
        │                                                       │
        └───────────────────────┬───────────────────────────────┘
                                ▼
                      Three.js 建筑从壁画长出来
                                │
                          6 个全部点亮
                                ▼
                        天宫结局（画面暖化 + 和弦）
```

对应到代码，`js/main.js` 的 `onEggFound()` 就是这条链路的全部：

```js
function onEggFound(egg, index, replay) {
  audio.unlock();                    // ① 音频解锁（必须在手势里）
  video.show(pick.src, {...});       // ② 视频（同步！前面不能有 await）
  audio.playEgg(egg);                // ③ 音效
  eggs.markFound(egg.id);            // ④ 进度
  scroll.centerOn(egg.x);            // ⑤ 把彩蛋滚到屏幕中间
  stage.grow(egg, { modelUrl });     // ⑥ 建筑长出来
  showCard(egg, {...});              // ⑦ 信息卡
  if (state.complete) enterFinale(); // ⑧ 结局
}
```

---

## 二、模块依赖

```
                        config.js  ← 单一数据源，所有人只读它
                             ▲
        ┌────────┬───────────┼───────────┬──────────┐
        │        │           │           │          │
    scroll.js  eggs.js   stage3d.js   video.js   audio.js
        │        │           │           │          │
   scrollart.js  │           └── import('three')   │
        │        │                + GLTFLoader     │
        └────────┴───────────────┬─────────────────┘
                                 ▼
                              main.js
                                 │
                          debug.js / assets.js / video-probe.js
```

规则：

- **只有 `config.js` 存内容**。任何模块都不许再写死地名、建筑名、文件路径。
- **`main.js` 是唯一知道全局状态的地方**。其余模块只做自己的事，通过参数和回调通信。
- **`assets.js` 是唯一做网络探测的地方**。探测结果（`manifest`）在启动时算一次，
  之后所有"有没有这个素材"的判断都查表，不再发请求。

---

## 三、两个关键契约

### 契约 1：素材路径

`config.js` 里每个彩蛋有 `video` / `model` / `audio` 三个路径。
**素材文件按这个路径放进去就自动生效，前端不用改一行**：

```
assets/models/01-tongren-nantianmen.glb   →  stage3d.grow() 加载它，加载失败/不存在则用占位建筑
assets/video/01-tongren.mp4               →  video.js 播它，不存在则播兜底测试片
assets/audio/01-tongren.mp3               →  audio.js 播它，不存在则 WebAudio 合成钟磬
```

这个"降级"逻辑集中在 `js/assets.js` 的 `resolveVideo()` 和 `main.js` 的 `resolveModelUrl()`，
是全项目最该看懂的两小段代码。

### 契约 2：屏幕坐标 ↔ 3D 世界坐标

长卷是用 `transform: translate3d()` 横向移动的，彩蛋热点是长卷轨道里的绝对定位元素。
3D 建筑必须"钉"在壁画的那个点上，所以每帧都要把彩蛋的**屏幕坐标**换算成**世界坐标**：

```
screenX = egg.x × 长卷宽 − 滚动位置
screenY = egg.y × 长卷高

worldX = (screenX / 视口宽 − 0.5) × 可见世界宽      ← 可见世界宽 = frustumHeight × 视口宽高比
worldY = (0.5 − screenY / 视口高) × frustumHeight
```

见 `js/stage3d.js` 的 `update()`。
屏幕外的建筑直接 `visible = false` 跳过，所以 6 座同时立着也不掉帧。

---

## 四、几个设计决策

### 为什么长卷不用原生滚动？

原生横向滚动条丑、手机上不好拖、做不出"阻尼 + 橡皮筋"的长卷手感。
所以 `scroll.js` 自己实现：输入改 `target`，rAF 里让 `current` 追 `target`。

```
输入（拖拽/滚轮/键盘）→ target ──阻尼插值──→ current ──→ transform: translate3d
```

到两端时 `target` 会被 `edgeBounce` 打折（拖出去 100px 只显示 30px），松手后弹回。

### 为什么 3D 用正交感的透视相机 + 每帧算位置？

没有用 OrbitsControls，也没有把建筑放进一个"场景"里。
因为需求是"建筑从壁画里长出来"，建筑必须**锚在画上的某个点**，跟着画一起走。
用透视相机在 z=0 平面上换算屏幕坐标是最直观的做法，代码只有 4 行。

### 为什么占位长卷是用 canvas 画的，而不是塞一张 PNG？

1. 不用往仓库里塞几 MB 的二进制；
2. 分辨率自适应，任何屏幕都不糊；
3. 改一个彩蛋的 `x/y`，墙面上的构图立刻跟着变，调位置特别快；
4. Day2 换成 AI 真图时，只要把 `SCROLL.image` 一改，这段代码就自动不走了。

代价是画得比较简笔。见 `js/scrollart.js`，有兴趣可以改 `PALETTE` 和 `drawScene` 里的造型。

---

## 五、改东西的入口

| 想做的事 | 改哪里 |
| --- | --- |
| 彩蛋在画上的位置 | `config.js` → `EGGS[i].x / .y`（0~1） |
| 建筑长出来的位置/大小 | `config.js` → `STAGE3D.frustumHeight`（调小 = 建筑更大） |
| 长卷滚动的跟手程度 | `config.js` → `SCROLL.damping / wheelSpeed / dragSpeed` |
| 长出动画时长、自转速度 | `config.js` → `STAGE3D.growDuration / spinSpeed` |
| 页面文案 | `config.js` → `COPY` |
| 换成 AI 真壁画 | `config.js` → `SCROLL.image = 'assets/img/xxx.jpg'` |
| 加第 7 个彩蛋 | `config.js` 的 `EGGS` 里加一条；`drawScene()` 里加一个 `shape` 分支；`buildPlaceholder()` 里加一个 case |
| 配色 | `css/base.css` 顶部的 `:root` 变量 |
| 调试面板内容 | `js/debug.js` |

> 改完 `config.js` 记得跑一下 `node tools/check.mjs` —— 它会检查素材路径是否落在约定的目录下。

---

## 六、性能注意

| 位置 | 处理 |
| --- | --- |
| 长卷 canvas | 内部像素上限 12,000,000（`scrollart.js` 里的 `MAX_PIXELS`）。5440×900 在 DPR=1 时约 490 万像素，画一次 24ms，只在 resize 时重画（防抖 220ms） |
| 3D | 屏幕外的建筑直接不更新；总渲染只在「有建筑存在」时才跑 |
| 3D 画布 | 覆盖在长卷上的透明 canvas，`pointer-events: none`，不挡拖拽 |
| 渲染循环 | `scroll.js` 和 `main.js` 各有一个 rAF；前者只做位移，后者只做 3D |

如果要上移动端并且卡，第一刀砍这里：
`STAGE3D.frustumHeight` 调大（建筑变小 → 但没用）、
或者更直接：`renderer.setPixelRatio(1)`。

---

## 七、存档

已点亮的彩蛋存在 `localStorage` 的 `tongren-oldcity:found:v1`（见 `config.js` 的 `STORAGE_KEY`）。
刷新页面后进度不丢，并且会把已点亮的建筑重新立起来（`stage.rebuildFound()`）。

想重来：页面上点「重看一遍」，或调试面板里的「清空进度」。
改了彩蛋列表结构的话，把 `STORAGE_KEY` 的版本号 `v1` 改掉，避免旧存档对不上。
