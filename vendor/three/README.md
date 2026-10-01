# vendor/three

这里是**本地内置**的 three.js，浏览器直接用 `<script type="importmap">` 指向它，
所以整个项目**不需要打包工具、也不需要联网**（现场演示断网也不怕）。

| 文件 | 来源 | 说明 |
| --- | --- | --- |
| `three.module.js` | `three@0.169.0/build/three.module.min.js` | 运行时主库（压缩版） |
| `addons/loaders/GLTFLoader.js` | `three@0.169.0/examples/jsm/loaders/GLTFLoader.js` | 加载建筑 `.glb` |
| `addons/utils/BufferGeometryUtils.js` | `three@0.169.0/examples/jsm/utils/BufferGeometryUtils.js` | GLTFLoader 的依赖 |

## 怎么重新生成

```bash
npm install            # 装 devDependency: three@0.169.0
npm run vendor:three   # 把上面 3 个文件重新拷进 vendor/
```

## 升级 three 版本

1. 改 `package.json` 里的 `three` 版本号；
2. `npm install && npm run vendor:three`；
3. 在 `docs/DAY1.md` 的「实测记录」里补一条验证结果。

> ⚠️ 不要手工编辑这里的文件。它们是从 npm 包里拷出来的原样文件，改了会跟上游对不上。
