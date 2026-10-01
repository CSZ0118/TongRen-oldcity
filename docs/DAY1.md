# Day1 交付说明 —— 计科A（前端工程）

> 任务：**建 GitHub 仓库 · 搭网页壳壳 · 测试视频播放**
> 状态：✅ 已完成并在真实浏览器里跑通验收

---

## 一、这一天的目标是什么

按分工表，计科A 负责网页框架、长卷滚动、彩蛋点击、Three.js 加载建筑、部署。
Day1 只做前两步 + 把「视频能不能播」这件事提前验证掉。

之所以要提前验证视频，是因为**浏览器自动播放策略**是这个作品最容易翻车的地方：
如果拖到 Day2 拿到 6 段视频才发现「点了彩蛋视频不出来」，那时候改交互设计已经来不及了。
所以 Day1 就把这条链路打通、并且做成一个能一键自检的页面（`video-test.html`）。

### 关键决策：零构建

整个项目**不用 webpack / vite / 任何打包工具**，`three.js` 直接内置在 `vendor/three/`。
理由：

| | 零构建（本方案） | Vite + npm |
| --- | --- | --- |
| 组员上手 | 起个静态服务就能改，改完刷新 | 要会 npm / 构建报错排查 |
| 现场演示 | 断网也能跑 | 断网要提前 build |
| GitHub Pages | 直接发，不用 CI 构建 | 要写构建步骤 |
| 代价 | 得手动 `npm run vendor:three` 升级 three | 无 |

对 5 个人 7 天的学生项目，零构建省下来的沟通成本远大于它的代价。

---

## 二、交付物

### 页面

| 文件 | 作用 |
| --- | --- |
| `index.html` | **主页面**：长卷 + 彩蛋 + 3D 建筑 + 视频层 + HUD |
| `video-test.html` | **视频播放自检页**：Day1 的验收入口 |

### 前端模块（`js/`）

| 文件 | 职责 |
| --- | --- |
| `config.js` | **单一数据源**：6 个彩蛋 / 建筑 / 素材路径 / 时长参数全在这里 |
| `main.js` | 入口，把下面所有模块串成一条体验链路 |
| `scroll.js` | 长卷横向滚动引擎（拖拽 / 滚轮 / 触摸 / 键盘 / 阻尼 / 橡皮筋） |
| `scrollart.js` | 占位长卷绘制（Day2 换成 AI 真图后就不走这条路了） |
| `eggs.js` | 彩蛋热点、进度存档、结局状态机 |
| `stage3d.js` | Three.js 舞台：建筑「从壁画里长出来」+ 发光 + 自转 |
| `video.js` | 视频播放层，专门处理自动播放策略 |
| `audio.js` | 音效；没有素材时用 WebAudio 现场合成钟磬 |
| `assets.js` | 素材自检（preflight），决定走真素材还是占位 |
| `video-probe.js` | 浏览器编解码能力 / 自动播放策略探测 |
| `debug.js` | 调试面板（按 `D` 或 `?debug=1`） |

### 工程与文档

| 文件 | 作用 |
| --- | --- |
| `tools/serve.mjs` | 零依赖本地服务器（支持 Range，视频拖进度条要用） |
| `tools/check.mjs` | 静态一致性检查，抓「改了名字忘了同步」 |
| `tools/smoke.mjs` | 无头浏览器冒烟测试，Day1 验收的自动化版本 |
| `tools/vendor-three.mjs` | 把 three.js 重新内置到 `vendor/` |
| `.github/workflows/deploy.yml` | 推送 main 自动部署 GitHub Pages |
| `docs/ASSETS.md` | **素材交付规范（给计科B / 建筑同学看）** |
| `docs/ARCHITECTURE.md` | 前端架构与扩展点 |

---

## 三、怎么跑起来

```bash
npm run dev          # → http://127.0.0.1:5173
```

> ⚠️ **不要直接双击 `index.html`**。
> 项目用的是 ES Module，`file://` 协议下浏览器会拒绝加载模块，页面白屏；
> 视频拖动进度条依赖 HTTP Range 请求，`file://` 也不支持。必须走本地服务器。

三个入口：

| 地址 | 内容 |
| --- | --- |
| `http://127.0.0.1:5173/` | 主页面 |
| `http://127.0.0.1:5173/video-test.html` | 视频播放自检 |
| `http://127.0.0.1:5173/?debug=1` | 主页面 + 调试面板 |

自检命令：

```bash
node tools/check.mjs    # 静态检查，几秒跑完，不依赖浏览器
npm run smoke           # 无头浏览器跑真实交互（需要本机有 Edge/Chrome）
```

---

## 四、验收结果（实测）

### 4.1 无头浏览器冒烟测试

`node tools/smoke.mjs`，浏览器 Edge 154，视口 1600×900：

```
【1/2】主页面 index.html
  ✓ 页面加载完成（body.is-ready）
  ✓ 开场加载层已收起
  ✓ 长卷壁画已绘制            5440×900px
  ✓ 6 个彩蛋热点全部生成       实际 6 个
  ✓ 长卷可横向滚动            内容 5440px，上限 3840px
  ✓ Three.js 舞台就绪（WebGL 可用）
                              r169 · ANGLE (Intel UHD Graphics, Direct3D11)
  ✓ 「铜仁古城」彩蛋在屏幕内可点  屏幕坐标 (490, 527)
  ✓ 点击彩蛋后进度 +1          activeId=tongren
  ✓ 建筑从壁画里长出来          来源 placeholder
  ✓ 视频层被打开              cc0-testclip.mp4
  ✓ 视频真的在播（currentTime 在走）
                              readyState=4  currentTime 2.05 → 2.76  muted=false
  ✓ 主页面无 JS 报错

【2/2】验收页 video-test.html
  ✓ 自检页跑出结论   pass — 视频播放链路已打通（1 段真实素材验证通过）
  ✓ 素材清单渲染出 7 行（6 段彩蛋 + 兜底）
  ✓ 视频自检结论非 FAIL
  ✓ 自检页无 JS 报错

全部通过　共 16 项检查
```

注意 `muted=false` —— 说明**带声音播放也成功了**。
因为彩蛋点击是真·用户手势（测试里用 CDP 的 `Input.dispatchMouseEvent` 派发，浏览器认作可信事件），
`play()` 没有被自动播放策略拦下。这是 `js/video.js` 最想验证的一条。

### 4.2 视频自检页结论

```
· MP4 / H.264 可用 —— 剪映直接导出 MP4 即可，这是最稳的选择。
· 素材到位 1/7 段（6 段彩蛋视频由 Day2 交付；缺失时主页面自动走兜底素材）
· 真实素材播放：1 段成功，平均起播 58ms
· 自动播放策略：静音可自动播 —— 彩蛋视频的兜底策略有效
· 合成回放：video/webm;codecs=vp9｜364.1 KB｜回放 成功 20ms
```

- **兜底测试片**：`assets/video/selftest/cc0-testclip.mp4`，960×540 / 5.05s，CC0 授权（MDN 示例素材），
  起播 58ms。它是 Day1「网页能播一段视频」这条验收项的实物证据，Day2 真素材到位后**不要删**，
  断网演示和新人上手都靠它。
- **合成回放**：用 canvas + MediaRecorder 现场录了 3 秒 vp9 视频再播回来，20ms 起播。
  这条路径完全不依赖任何素材文件，所以仓库里一个视频都没有时也能证明解码链路是通的。

### 4.3 静态一致性检查

```
· 目录约定检查完成
· index.html：3 个本地引用全部存在
· video-test.html：4 个本地引用全部存在
· importmap：three、three/addons/
· import 图：15 个模块、30 条依赖，全部可解析
· js/main.js ↔ index.html：23 个静态选择器全部对得上
· js/videotest.js ↔ video-test.html：16 个静态选择器全部对得上
· index.html：7 个 data-act 按钮都有对应处理
· video-test.html：7 个 data-act 按钮都有对应处理
· 素材路径约定：20 条；已就位 1，待 Day2 交付 19
```

---

## 五、现在打开页面能看到什么

素材都还没做，但页面**不是空壳**：

1. **长卷**：代码画的占位壁画（5440×900，24ms 画完）。五层远山、云海、江面、水纹、纸纹做旧，
   6 个彩蛋场景按 `config.js` 里的 `x/y` 画在画里，结尾还有题跋和朱红印章。
2. **滚动**：拖拽 / 滚轮 / 触摸 / 方向键都能动，带阻尼和两端橡皮筋。
3. **6 个彩蛋**：画里的柔光处有热点，点击后进度 +1 并存档（刷新不丢）。
4. **视频**：点彩蛋会打开视频层，播兜底测试片，角标写着「【占位素材】」。
5. **建筑**：Three.js 用基础几何体拼出 6 种占位天宫（城楼 / 鼓楼 / 廊桥 / 楼阁 / 山坡 / 金顶），
   从壁画对应位置"长"出来，带发光和自转。
6. **音效**：没有 mp3，用 WebAudio 现场合成钟磬声（每个彩蛋音高不同）。
7. **结局**：6 个全点亮 → 天宫模式 + 收尾和弦 + 结局文案。

**Day2 素材一放进来，这些占位会自动被替换掉，前端一行都不用改。**
替换规则见 `docs/ASSETS.md`。

---

## 六、已知限制 / 需要组里知道的事

| 事项 | 说明 |
| --- | --- |
| 3D 建筑是占位的 | 用 Box/Cone 拼的，风格是"能看出是什么类型的建筑"这个级别。Day2 建筑同学的 GLB 到位后自动替换 |
| 长卷是代码画的 | 不是 AI 图。构图/彩蛋位置都对，但画风是简笔青绿山水 |
| 素材 404 是预期内的 | 自检会对 18 个还不存在的素材发 HEAD 请求，浏览器控制台会有一片红色 404。**这是正常的**，不是 bug |
| 无头测试需要放宽沙箱 | `tools/smoke.mjs` 要启动 Chromium，Chromium 的多进程 IPC 需要命名管道，在受限沙箱里跑不了。受限环境下用 `tools/check.mjs`（静态检查）代替 |
| 移动端只做了基础适配 | 触摸拖拽/布局都处理了，但没在真机上验证过 |
| **首次部署要人工点一次** | `GITHUB_TOKEN` 没权限创建 Pages 站点，得先去 `Settings → Pages` 把 Source 选成「GitHub Actions」。工作流会在日志里直接给出这一步的提示。之后就不用了 |

---

## 七、Day2 交接清单

给计科B：

- [ ] 读 `docs/ASSETS.md`，按命名规范把 6 段视频放进 `assets/video/`、6 个音效放进 `assets/audio/`
- [ ] 长卷壁画出图比例 **6:1**（推荐 6144×1024），放到 `assets/img/`，然后改 `js/config.js` 的 `SCROLL.image`
- [ ] 剪映导出用 **MP4 / H.264**（自检页已确认本机支持）

给建筑同学：

- [ ] 按 `docs/ASSETS.md` 的 GLB 规范导出 6 座建筑
- [ ] 放进 `assets/models/`，文件名严格对齐 `config.js`

给考据/文案同学：

- [ ] `js/config.js` 里的 `hint`（画里的小彩蛋描述）和 `COPY`（页面文案）需要你审一遍
- [ ] 目前 `COPY` 里的文案是前端先写的占位

所有人都可以做的自查：

```bash
npm run dev
# 打开 http://127.0.0.1:5173/video-test.html 看素材到位情况
# 打开 http://127.0.0.1:5173/?debug=1 看实时状态
```

---

## 八、Day1 踩到的坑（留给后面的人）

1. **npm 的全局缓存在沙箱外**：`npm install` 默认写 `%LOCALAPPDATA%\npm-cache`，
   受限环境会 `EPERM`。加 `--cache ./.npm-cache` 即可。
2. **Chromium 在受限沙箱里起不来**：报 `mojo\platform_channel.cc Check failed: 拒绝访问 (0x5)`。
   这是命名管道被拦，不是代码问题。
3. **CDP 的 session 模式不响应**：用浏览器级 WebSocket + `Target.attachToTarget(flatten:true)` 时，
   session 级命令收不到任何响应（`Target.*` 能响应）。改成**直连页面 target 的 WebSocket** 就正常了。
   `tools/smoke.mjs` 里已经改成后者。
4. **`suspend` 事件不是错误**：写视频探测时很容易把 `stalled`/`suspend` 当成加载失败，
   实际上 `load()` 之后浏览器几乎必然触发一次 `suspend`。真正的失败信号只有 `error` 事件、
   `play()` 被 reject、和超时。
5. **`muted` 和用户手势的时序**：`play()` 必须在 click 处理函数的**同步调用栈**里调用。
   哪怕中间只插一个 `await`，用户手势就失效了，带声音的播放会被拒。
   所以 `main.js` 里是先 `video.show()` 再 `await` 任何东西。
