# 贵州人间长卷 · 点亮天宫

> 关于贵州铜仁古城的交互式视频网页 · 7 天小组项目
>
> 打开网页，是一幅贵州人间长卷墙画。横向滚动，像《清明上河图》一样。
> 画里藏着 **6 个日常小彩蛋**。点中它们，对应的天宫建筑就从壁画里长出来 ——
> 发光、旋转、播放音效。6 个全点亮，整幅画变成天宫。

---

## 快速开始

### 最简单：双击 `启动预览.cmd`

双击后自动起服务器并打开浏览器。**这个窗口就是服务器，关掉窗口 = 停止。**

> **换到另一台 Windows 电脑**：把整个文件夹拷过去（U 盘 / 微信 / 网盘都行），
> 双击 `启动预览.cmd` 即可。那台电脑需要有 [Node.js](https://nodejs.org/)；
> 只有 Python 也能跑（但视频进度条拖不动）。两个都没有的话，脚本会给出替代办法。

### 或者用命令行

```bash
npm run dev                          # → http://127.0.0.1:5173
node tools/serve.mjs --port 8080     # 换端口
node tools/serve.mjs --host 0.0.0.0  # 给同局域网的同学看
```

### ⚠️ 不要双击 `index.html`

那样只会停在"正在铺开长卷…"那一屏。原因：项目用 ES Module，
`file://` 协议下 origin 是 `null`，浏览器按 CORS 规则拒绝加载 `js/main.js`
（浏览器报错原文和完整解释见 [docs/WHY-NOT-FILE.md](docs/WHY-NOT-FILE.md)）。
**必须走 HTTP 服务器** —— `启动预览.cmd` 干的就是这件事。

### 三个入口

| 地址 | 内容 |
| --- | --- |
| `/` | 主页面（长卷 + 彩蛋 + 3D 天宫） |
| `/video-test.html` | 视频播放自检 —— **素材到位情况看这里** |
| `/?debug=1` | 主页面 + 调试面板（也可以按 `D` 键） |

### 自检命令

```bash
node tools/check.mjs    # 静态一致性检查（引用/import/选择器/素材路径），几秒钟
npm run smoke           # 无头浏览器跑一遍真实交互（需要本机有 Edge 或 Chrome）
```

---

## 当前进度

| | 状态 |
| --- | --- |
| GitHub 仓库 | ✅ |
| 网页壳壳（框架 / 长卷滚动 / 彩蛋点击 / 3D 舞台 / 视频层） | ✅ Day1 |
| 视频播放链路验证 | ✅ Day1（无头浏览器实测 16/16 项通过） |
| AI 长卷壁画 | ⬜ Day2（现在用代码画的占位长卷） |
| 6 段天宫建筑视频 | ⬜ Day2（现在用兜底测试片） |
| 6 座 3D 建筑 GLB | ⬜ Day2–3（现在用几何体拼的占位建筑） |
| 6 个音效 | ⬜ Day2（现在用 WebAudio 合成钟磬） |
| 完整剧本 / 文案 | ⬜ Day2 |
| 音频 / BGM / 剪映成片 | ⬜ Day2–3 |
| 部署上线 | ✅ 配置已就绪，推 main 自动发 GitHub Pages |

> **素材没到位不影响开发。** 页面会给每一处缺失的素材自动降级成占位内容，
> 并在界面上标注「【占位】」。素材一放进来就自动替换，前端不用改代码。

---

## 6 个彩蛋

| # | 地点 | 画里的彩蛋 | 长出的天宫建筑 |
| --- | --- | --- | --- |
| 1 | 铜仁古城 | 抹茶铺，有人喝茶 | 南天门式城楼 |
| 2 | 黔东南侗寨 | 鼓楼下有人唱侗歌 | 天宫鼓楼，飞檐入云 |
| 3 | 风雨桥 | 桥上有人渡影 | 天宫廊桥，横跨云海 |
| 4 | 甲秀楼 | 水中倒影有人垂钓 | 天宫楼阁，浮于云面 |
| 5 | 镇远古镇 | 山间有人挑担 | 天宫山坡，依云而建 |
| 6 | 梵净山 | 金顶有人祈福 | 天宫金顶，云海环绕 |

---

## 目录结构

```
├── 启动预览.cmd              ★ 双击就能看（起服务器 + 开浏览器）
├── index.html                主页面
├── video-test.html           视频播放自检页
├── css/
│   ├── base.css              变量 / 重置 / 通用控件
│   ├── shell.css             主页面样式
│   └── video-test.css        自检页样式
├── js/
│   ├── config.js             ★ 单一数据源：彩蛋 / 建筑 / 素材路径 / 参数
│   ├── main.js               入口，串起整条体验链路
│   ├── scroll.js             长卷横向滚动引擎
│   ├── scrollart.js          占位长卷绘制（换成 AI 真图后不再走）
│   ├── eggs.js               彩蛋热点 + 进度 + 结局
│   ├── stage3d.js            Three.js：建筑从壁画里长出来
│   ├── video.js              视频播放层（处理自动播放策略）
│   ├── audio.js              音效（无素材时合成钟磬）
│   ├── assets.js             素材自检与降级
│   ├── video-probe.js        浏览器编解码能力探测
│   └── debug.js              调试面板
├── assets/
│   ├── img/                  壁画长卷（待交付）
│   ├── video/                6 段彩蛋视频（待交付）
│   ├── audio/                6 个音效（待交付）
│   └── models/               6 座建筑 GLB（待交付）
├── vendor/three/             内置的 three.js（无需 CDN、无需联网）
├── tools/
│   ├── serve.mjs             零依赖本地服务器
│   ├── check.mjs             静态一致性检查
│   ├── smoke.mjs             无头浏览器冒烟测试
│   └── vendor-three.mjs      重新内置 three.js
├── docs/
│   ├── DAY1.md               Day1 交付说明与验收记录
│   ├── ARCHITECTURE.md       架构与扩展点
│   ├── WHY-NOT-FILE.md       ★ 为什么不能双击 index.html / 怎么在别的电脑上打开
│   └── ASSETS.md             ★ 素材交付规范（计科B / 建筑同学必读）
└── .github/workflows/deploy.yml   GitHub Pages 自动部署
```

---

## 分工

| 角色 | 负责 | 相对位置 |
| --- | --- | --- |
| 计科A | 前端工程：网页框架、长卷滚动、彩蛋点击、Three.js 加载建筑、部署 | `index.html` `css/` `js/` `tools/` |
| 计科B | 媒体集成：视频嵌入、音效、字幕、移动端适配、性能优化 | `assets/video/` `assets/audio/` |
| 计科A（兼项目/编剧） | 剧本、彩蛋设计、进度管理、答辩 PPT | `docs/` `js/config.js` |
| 考古/文案 | 贵州地文化考据、旁白、字幕、作品说明 | `docs/` `js/config.js` 的 `COPY` |
| 建筑同学 | 3D 建模/视觉：6 座建筑、材质灯光、导出 GLB、壁画视觉把关 | `assets/models/` |

---

## 技术要点

- **零构建**：不用打包工具。three.js 内置在 `vendor/three/`，用 `<script type="importmap">` 直接引。
  断网也能演示。升级 three：`npm install && npm run vendor:three`。
- **零第三方运行时依赖**：页面上没有一个来自 CDN 的资源。
- **降级优先**：任何素材缺失都不会导致白屏或报错，只会退到占位内容。
- **视频播放**：`play()` 在彩蛋 click 的同步调用栈里执行；带声音被拒就自动退回静音重播。
  详见 `docs/DAY1.md` 第八节。

---

## 文档

| 文档 | 给谁看 |
| --- | --- |
| [`docs/DAY1.md`](docs/DAY1.md) | 所有人：Day1 做了什么、怎么验收、踩过哪些坑 |
| [`docs/WHY-NOT-FILE.md`](docs/WHY-NOT-FILE.md) | 所有人：**打不开 / 换电脑怎么打开**，看这一份 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 要改代码的人：模块职责、数据流、改哪里 |
| [`docs/ASSETS.md`](docs/ASSETS.md) | 计科B / 建筑同学：素材命名、格式、导出设置 |

---

## 部署

推送 `main` 分支后，GitHub Actions 会自动部署到：

**https://csz0118.github.io/TongRen-oldcity/**

### 一次性设置（只做一次）

打开 **https://github.com/CSZ0118/TongRen-oldcity/settings/pages**，
把 `Build and deployment → Source` 选成 **「GitHub Actions」**，然后到
[Actions 页面](https://github.com/CSZ0118/TongRen-oldcity/actions) 点 **Re-run all jobs**。

> 为什么必须人工点这一步：`GITHUB_TOKEN` 没有创建 Pages 站点的权限，
> `actions/configure-pages` 的 `enablement: true` 也只能配置已存在的站点，不能创建。
> 所以第一次跑会失败 —— 工作流会直接在日志里把上面这段提示打出来，照着做即可。

设置完之后，以后每次 `git push` 都会自动重新部署。
