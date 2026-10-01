#!/usr/bin/env node
/**
 * 把 npm 包里的 three.js 拷进 vendor/，让网页可以零构建、零 CDN 直接跑。
 *
 *   npm install && npm run vendor:three
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** [源路径(相对 node_modules/three), 目标路径(相对仓库根)] */
const FILES = [
  ['build/three.module.min.js', 'vendor/three/three.module.js'],
  ['examples/jsm/loaders/GLTFLoader.js', 'vendor/three/addons/loaders/GLTFLoader.js'],
  ['examples/jsm/utils/BufferGeometryUtils.js', 'vendor/three/addons/utils/BufferGeometryUtils.js'],
];

const pkgPath = join(ROOT, 'node_modules', 'three', 'package.json');
if (!existsSync(pkgPath)) {
  console.error('✗ 找不到 node_modules/three，请先运行：npm install');
  process.exit(1);
}
const version = JSON.parse(await readFile(pkgPath, 'utf8')).version;

for (const [from, to] of FILES) {
  const src = join(ROOT, 'node_modules', 'three', from);
  const dest = join(ROOT, to);
  if (!existsSync(src)) {
    console.error(`✗ 源文件不存在：node_modules/three/${from}（three 版本变了？）`);
    process.exit(1);
  }
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`✓ ${to}`);
}

const stamp = `three@${version}（vendored by tools/vendor-three.mjs，请勿手工编辑）\n`;
await writeFile(join(ROOT, 'vendor', 'three', 'VERSION.txt'), stamp, 'utf8');
console.log(`\n完成：three@${version} 已内置到 vendor/three/`);
