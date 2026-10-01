#!/usr/bin/env node
/**
 * 静态一致性检查 —— 不依赖浏览器，几秒钟跑完。
 *
 *   node tools/check.mjs
 *
 * 它专抓"改了名字忘了同步"这类最容易翻车的问题：
 *   ① HTML 里引用的 js/css/图片 文件是否都在
 *   ② ES Module 的 import 图是否完整（相对路径 + importmap 裸说明符）
 *   ③ main.js / videotest.js 里用到的 [data-*]、#id 选择器在 HTML 里是否真的有
 *   ④ HTML 里的 data-act 按钮在 JS 里是否有处理分支
 *   ⑤ config.js 里的素材路径是否落在正确的目录下
 *   ⑥ 所有文本文件是否都是合法 UTF-8（中文项目很容易混进 GBK）
 *
 * 退出码：0 = 通过；1 = 有问题。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const C = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const problems = [];
const notes = [];
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const fail = (msg) => problems.push(msg);

// ────────────────────────────────────────────────────────────
// 读取
// ────────────────────────────────────────────────────────────

async function readText(p) {
  const buf = await readFile(p);
  // UTF-8 严格校验：中文项目最容易混进 GBK / UTF-16
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    fail(`${rel(p)} 不是合法 UTF-8（可能是 GBK 或 UTF-16 编码）`);
    return buf.toString('utf8');
  }
}

/** 这些目录不用扫：依赖、缓存、临时产物（_tmp 里会有我调试时随手写的脚本） */
const SKIP_DIRS = new Set(['node_modules', '.npm-cache', '.git', '_tmp', '_dist', '.smoke-profile']);

async function walk(dir, exts, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(p);
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// ① HTML 引用
// ────────────────────────────────────────────────────────────

const PAGES = ['index.html', 'video-test.html'];

async function checkHtmlRefs() {
  for (const page of PAGES) {
    const abs = join(ROOT, page);
    if (!existsSync(abs)) {
      fail(`缺少页面 ${page}`);
      continue;
    }
    const html = await readText(abs);
    const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|data:|mailto:|#|\/\/)/.test(ref)) continue;
      const target = resolve(ROOT, ref.replace(/^\.\//, ''));
      if (!existsSync(target)) fail(`${page} 引用了不存在的文件：${ref}`);
    }
    notes.push(`${page}：${refs.filter((r) => !/^(https?:|data:|mailto:|#)/.test(r)).length} 个本地引用全部存在`);
  }
}

// ────────────────────────────────────────────────────────────
// ② import 图
// ────────────────────────────────────────────────────────────

/** 从 HTML 的 importmap 里读出裸说明符映射 */
function readImportMap(html) {
  const m = html.match(/<script\s+type="importmap"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { imports: {} };
  try {
    return JSON.parse(m[1]);
  } catch (err) {
    fail(`index.html 的 importmap 不是合法 JSON：${err.message}`);
    return { imports: {} };
  }
}

async function checkModuleGraph() {
  const html = await readText(join(ROOT, 'index.html'));
  const map = readImportMap(html);
  const entries = Object.entries(map.imports ?? {});

  // importmap 的目标必须存在
  for (const [key, value] of entries) {
    const target = resolve(ROOT, value.replace(/^\.\//, ''));
    if (!existsSync(target)) fail(`importmap 的 "${key}" 指向不存在的文件：${value}`);
  }
  notes.push(`importmap：${entries.map(([k]) => k).join('、')}`);

  const bareKeys = entries.map(([k]) => k);
  const resolveSpecifier = (spec, fromFile) => {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      return resolve(dirname(fromFile), spec);
    }
    // 裸说明符：'three' 或 'three/addons/loaders/GLTFLoader.js'
    const exact = bareKeys.find((k) => k === spec);
    if (exact) return resolve(ROOT, map.imports[exact].replace(/^\.\//, ''));
    const prefix = bareKeys.find((k) => k.endsWith('/') && spec.startsWith(k));
    if (prefix) {
      return resolve(ROOT, (map.imports[prefix] + spec.slice(prefix.length)).replace(/^\.\//, ''));
    }
    return null;
  };

  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const queue = [join(ROOT, 'js', 'main.js'), join(ROOT, 'js', 'videotest.js')];
  let edgeCount = 0;

  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) {
      fail(`import 图里引用了不存在的文件：${rel(file)}`);
      continue;
    }
    const code = await readText(file);

    const specs = [
      // import ... from 'x'  /  import 'x'
      ...[...code.matchAll(/(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)],
      // 动态 import('x')
      ...[...code.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)],
    ].map((m) => m[1]);

    for (const spec of specs) {
      edgeCount += 1;
      if (!spec.startsWith('.') && !bareKeys.some((k) => spec === k || (k.endsWith('/') && spec.startsWith(k)))) {
        fail(`${rel(file)} 引用了 importmap 里没有的模块：${spec}`);
        continue;
      }
      const target = resolveSpecifier(spec, file);
      if (!target) {
        fail(`${rel(file)} 的 "${spec}" 无法解析`);
        continue;
      }
      if (!existsSync(target)) {
        fail(`${rel(file)} 的 "${spec}" 指向不存在的文件：${rel(target)}`);
        continue;
      }
      if (target.endsWith('.js') || target.endsWith('.mjs')) queue.push(target);
    }
  }

  notes.push(`import 图：${seen.size} 个模块、${edgeCount} 条依赖，全部可解析`);
  return seen;
}

// ────────────────────────────────────────────────────────────
// ③ 选择器对账
// ────────────────────────────────────────────────────────────

/** 这些选择器是运行时动态生成的 DOM，不该拿静态 HTML 校验 */
const DYNAMIC_SELECTOR_FILES = new Set(['video.js', 'eggs.js', 'debug.js', 'scrollart.js', 'scroll.js', 'stage3d.js', 'assets.js', 'audio.js', 'video-probe.js']);

async function checkSelectors() {
  // main.js 只查 index.html；videotest.js 只查 video-test.html
  const pairs = [
    { js: join(ROOT, 'js', 'main.js'), html: join(ROOT, 'index.html') },
    { js: join(ROOT, 'js', 'videotest.js'), html: join(ROOT, 'video-test.html') },
  ];

  for (const { js, html } of pairs) {
    const code = await readText(js);
    const markup = await readText(html);
    const selectors = new Set();

    for (const m of code.matchAll(/(?:querySelector(?:All)?|\$)\(\s*["'`]([^"'`]+)["'`]/g)) {
      for (const token of m[1].matchAll(/(\[data-[a-z0-9-]+(?:="[^"]*")?\]|#[A-Za-z][\w-]*)/g)) {
        selectors.add(token[1]);
      }
    }
    for (const m of code.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]/g)) {
      selectors.add(`#${m[1]}`);
    }

    let checked = 0;
    const missing = [];
    for (const sel of selectors) {
      const attr = sel.match(/^\[(data-[a-z0-9-]+)(?:="([^"]*)")?\]$/);
      if (attr) {
        const [, name, value] = attr;
        const re = value ? new RegExp(`${name}\\s*=\\s*"${value}"`) : new RegExp(`\\b${name}\\b`);
        if (re.test(markup)) checked += 1;
        else missing.push(sel);
        continue;
      }
      const id = sel.match(/^#([\w-]+)$/);
      if (id) {
        if (new RegExp(`id\\s*=\\s*"${id[1]}"`).test(markup)) checked += 1;
        else missing.push(sel);
      }
    }

    if (missing.length) {
      fail(`${rel(js)} 用到的选择器在 ${rel(html)} 里找不到：${missing.join('、')}`);
    } else {
      notes.push(`${rel(js)} ↔ ${rel(html)}：${checked} 个静态选择器全部对得上`);
    }
  }
  void DYNAMIC_SELECTOR_FILES;
}

// ────────────────────────────────────────────────────────────
// ④ data-act 按钮
// ────────────────────────────────────────────────────────────

async function checkActions() {
  for (const page of PAGES) {
    const markup = await readText(join(ROOT, page));
    const acts = [...new Set([...markup.matchAll(/data-act\s*=\s*"([^"]+)"/g)].map((m) => m[1]))];
    if (!acts.length) continue;

    const jsFiles = (await walk(join(ROOT, 'js'), ['.js'])).concat([join(ROOT, 'tools', 'smoke.mjs')]);
    let haystack = '';
    for (const f of jsFiles) haystack += await readText(f);

    const unhandled = acts.filter((a) => !new RegExp(`["'\`]${a}["'\`]`).test(haystack));
    if (unhandled.length) fail(`${page} 里的 data-act 在 JS 里没有处理：${unhandled.join('、')}`);
    else notes.push(`${page}：${acts.length} 个 data-act 按钮都有对应处理`);
  }
}

// ────────────────────────────────────────────────────────────
// ⑤ 素材路径
// ────────────────────────────────────────────────────────────

async function checkAssetPaths() {
  const config = await readText(join(ROOT, 'js', 'config.js'));
  const urls = [...new Set([...config.matchAll(/["'`]((?:assets)\/[^"'`]+)["'`]/g)].map((m) => m[1]))];

  const dirs = new Set(['assets/img/', 'assets/video/', 'assets/video/selftest/', 'assets/audio/', 'assets/models/']);
  const badDir = [];
  for (const u of urls) {
    const dir = u.slice(0, u.lastIndexOf('/') + 1);
    if (!dirs.has(dir)) badDir.push(u);
  }
  if (badDir.length) fail(`config.js 里的素材路径不在约定的目录下：${badDir.join('、')}`);

  for (const d of dirs) {
    const abs = resolve(ROOT, d);
    if (!existsSync(abs)) fail(`约定了素材目录 ${d}，但目录不存在`);
  }

  const present = urls.filter((u) => existsSync(resolve(ROOT, u)));
  const missing = urls.filter((u) => !existsSync(resolve(ROOT, u)));
  notes.push(`素材路径约定：${urls.length} 条；已就位 ${present.length}，待 Day2 交付 ${missing.length}`);
  if (missing.length) {
    notes.push(`　　待交付：${missing.map((m) => m.replace('assets/', '')).join('、')}`);
  }
}

// ────────────────────────────────────────────────────────────
// ⑥ 目录约定
// ────────────────────────────────────────────────────────────

async function checkLayout() {
  const required = [
    'index.html',
    'video-test.html',
    'README.md',
    'package.json',
    '启动预览.cmd',
    'js/config.js',
    'css/base.css',
    'css/shell.css',
    'vendor/three/three.module.js',
    'vendor/three/addons/loaders/GLTFLoader.js',
    '.github/workflows/deploy.yml',
    'docs/DAY1.md',
    'docs/WHY-NOT-FILE.md',
    'docs/ARCHITECTURE.md',
    'docs/ASSETS.md',
  ];
  for (const f of required) {
    if (!existsSync(join(ROOT, f))) fail(`缺少约定文件：${f}`);
  }

  // 不该被提交的东西
  for (const bad of ['node_modules', '.npm-cache']) {
    if (existsSync(join(ROOT, bad))) {
      const gi = await readText(join(ROOT, '.gitignore'));
      if (!gi.includes(bad)) fail(`${bad}/ 存在但没写进 .gitignore`);
    }
  }
  notes.push('目录约定检查完成');
}

/**
 * ⑦ 批处理文件的编码守则。
 *
 * 这两条都真踩过，而且报错信息完全指不到病根（屏幕上只会刷一片
 * "'xxx' 不是内部或外部命令"）：
 *   1. 不能有非 ASCII 字符 —— cmd.exe 解析批处理文件用的是系统 ANSI 代码页
 *      （中文 Windows 是 GBK），UTF-8 的中文会被拆成乱码，剩下的字节还会被
 *      当成命令执行。加 chcp 65001 也救不了（实测过）。
 *   2. 必须是 CRLF 行尾 —— LF-only 时 goto :label 会失灵。
 */
async function checkBatchFiles() {
  const files = (await walk(ROOT, ['.cmd', '.bat'])).filter((p) => !p.includes('node_modules'));
  if (!files.length) return;

  for (const file of files) {
    const buf = await readFile(file);

    let firstBad = -1;
    let badCount = 0;
    for (let i = 0; i < buf.length; i += 1) {
      if (buf[i] > 127) {
        if (firstBad < 0) firstBad = i;
        badCount += 1;
      }
    }
    if (badCount > 0) {
      fail(
        `${rel(file)} 含 ${badCount} 个非 ASCII 字节（首个在偏移 ${firstBad}）：` +
          `cmd.exe 会按 GBK 解析，导致乱码甚至把字节当命令执行。请改成纯 ASCII，` +
          `中文提示交给 node/python 输出`,
      );
    }

    const text = buf.toString('latin1');
    const bareLf = (text.match(/(?<!\r)\n/g) ?? []).length;
    if (bareLf > 0) {
      fail(`${rel(file)} 有 ${bareLf} 处裸 LF 行尾：批处理文件必须用 CRLF，否则 goto :label 会失灵`);
    }
  }

  notes.push(`批处理文件编码守则：${files.map((f) => rel(f)).join('、')} 均为纯 ASCII + CRLF`);
}

// ────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────

console.log(C.bold('\n贵州人间长卷 · 静态一致性检查\n'));

await checkLayout();
await checkHtmlRefs();
await checkModuleGraph();
await checkSelectors();
await checkActions();
await checkAssetPaths();
await checkBatchFiles();

console.log(C.bold('检查结果\n'));
for (const n of notes) console.log(`  ${C.dim('·')} ${n}`);

if (problems.length === 0) {
  console.log(C.ok(`\n  ✓ 全部通过（${notes.length} 项）\n`));
  process.exit(0);
}

console.log(C.bad(`\n  发现 ${problems.length} 个问题：\n`));
for (const p of problems) console.log(`  ${C.bad('✗')} ${p}`);
console.log('');
process.exit(1);
