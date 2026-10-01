# 为什么不能双击 index.html 打开

> 结论先说：**这个项目必须通过 `http://` 打开，不能双击 HTML 文件。**
> 双击 `启动预览.cmd` 就行，或者用 `npm run dev`。

---

## 一、双击之后到底发生了什么

不是"没反应"，是**页面永远停在"正在铺开长卷…"那一屏**。

在无头 Edge 里真实复现过一次，浏览器控制台里的原话是：

```
Access to script at 'file:///F:/TongRen-oldcity/js/main.js' from origin 'null'
has been blocked by CORS policy: Cross origin requests are only supported for
protocol schemes: chrome-experimental-site-token-provider, chrome-extension,
chrome-untrusted, data, edge, http, https, isolated-app.

net::ERR_FAILED
```

注意报错里那份**允许的协议名单**：`http`、`https` 在，`file` 不在。

页面状态：

```json
{
  "ready": false,          ← 启动流程根本没跑完
  "eggs": 0,               ← 6 个彩蛋一个都没生成
  "artW": 300,             ← 长卷 canvas 还是默认的 300px
  "bootText": "正在铺开长卷…"
}
```

所以看到的就是一张写着"正在铺开长卷…"的静态画面。

---

## 二、为什么会这样

### 1. ES Module 在 `file://` 下被 CORS 拦掉（这是主因）

`index.html` 里是这样引脚本的：

```html
<script type="importmap">
{ "imports": { "three": "./vendor/three/three.module.js" } }
</script>
<script type="module" src="./js/main.js"></script>
```

`type="module"` 的脚本，浏览器是**按 CORS 规则去取**的 —— 这是 ES Module 规范定死的，
不是浏览器在刁难谁。

而通过 `file://` 打开时，页面的 origin 是 **`null`**（不透明源）。
`null` 源发起的跨源请求一律被拒，连"同目录的相对路径"也不例外 ——
因为对浏览器来说 `file:///F:/...` 和 `file:///D:/...` 之间没有"同源"这个概念。

结果就是 `js/main.js` 根本没被加载，后面整条启动链路自然全断。

### 2. `fetch()` 也读不了本地文件

`js/assets.js` 的素材自检是用 `fetch()` 去 HEAD 各个素材的。
`fetch` 在 `file://` 下同样直接被禁止，会抛异常。

### 3. 视频拖进度条需要 HTTP Range

`<video>` 播 `file://` 上的本地文件**能播**，但拿不到 `Range` 响应头，
所以进度条拖不动、也不能 seek。这条不是致命伤，但演示时很难看。

### 4. 顺带一提：为什么"零构建"了还是不能双击

"零构建"省掉的是**打包**（webpack/vite），不是**服务器**。
ES Module、`fetch`、Range 这三件事都要求一个真正的 HTTP 源。
想彻底双击可用，得把所有 JS 降级成传统 `<script>` 并内联成一个文件 ——
那样会丢掉 GLB 加载（`GLTFLoader` 也走 `fetch`），得不偿失。

---

## 三、那该怎么办

### 方式一：双击 `启动预览.cmd`（本机 / 拷到别的 Windows 电脑，最推荐）

项目根目录里的 `启动预览.cmd`，**双击即可**。它会自动：

1. 找一个运行时（优先 Node.js，没有就用 Python）
2. 起本地服务器
3. 2 秒后自动打开浏览器

窗口就是服务器，**关掉窗口 = 停止**。

> **换到另一台电脑**：把整个文件夹拷过去（U 盘 / 微信 / 网盘都行），
> 双击 `启动预览.cmd`。
> 那台电脑需要有 Node.js（[nodejs.org](https://nodejs.org/) 装一下，一路下一步）；
> 有 Python 也行，但 Python 的 `http.server` 不支持 Range，视频进度条拖不动。
> 两个都没有的话，脚本会告诉你三种替代办法。

### 方式二：装 GitHub Pages，直接用网址（跨设备最推荐）

部署好之后，任何电脑、手机、平板打开这个网址就行，**什么都不用装**：

**https://csz0118.github.io/TongRen-oldcity/**

（Pages 需要先人工启用一次，见 [README](../README.md) 的「部署」一节。）

### 方式三：VS Code 的 Live Server 插件

适合已经在用 VS Code 的同学：

1. 扩展里搜 `Live Server` 装上
2. 用 VS Code 打开这个文件夹
3. 右键 `index.html` → **Open with Live Server**

改完代码自动刷新，开发时其实比 `npm run dev` 还顺手。

### 方式四：手动起服务器

```bash
npm run dev                       # Node，推荐
node tools/serve.mjs --port 8080  # 换端口
python -m http.server 5173        # Python 备选（无 Range）
```

### 方式五：给同局域网的同学看

```bash
node tools/serve.mjs --host 0.0.0.0 --port 5173
```

然后让同学访问 `http://你的内网IP:5173/`
（`ipconfig` 查 IPv4 地址，一般是 `192.168.x.x`）。
注意 Windows 防火墙可能会弹窗，允许"专用网络"即可。

---

## 四、快速对照表

| 打开方式 | 能跑吗 | 说明 |
| --- | --- | --- |
| 双击 `index.html` | ❌ | CORS 拦掉 ES Module，卡在加载屏 |
| 双击 `启动预览.cmd` | ✅ | **最省事**，起服务器 + 自动开浏览器 |
| VS Code Live Server | ✅ | 开发时最顺手，改完自动刷新 |
| `npm run dev` | ✅ | 命令行方式，日志最全 |
| `python -m http.server` | ⚠️ | 能跑，但视频进度条拖不动 |
| GitHub Pages 网址 | ✅ | 跨设备最强，什么都不用装 |
| `file://` + 打包成单文件 | ❌ | 会丢掉 GLB 加载，不划算 |

---

## 五、一句话总结

> `file://` 只适合"一个 HTML 文件 + 几个传统 `<script>`"那种老式页面。
> 只要用上 ES Module，就必须有个 HTTP 服务器。
> 这不是本项目的问题，是浏览器的安全模型 —— **双击 `启动预览.cmd` 就行**。
