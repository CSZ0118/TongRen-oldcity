#!/usr/bin/env node
/**
 * 零依赖本地静态服务器。
 *
 *   npm run dev            → http://127.0.0.1:5173
 *   node tools/serve.mjs --port 8080
 *
 * 为什么要用它，而不是直接双击 index.html 打开？
 *   本项目用的是 ES Module（<script type="module">），file:// 协议下浏览器会因
 *   跨域策略拒绝加载模块，页面会白屏。视频的拖动进度条也依赖 HTTP Range 请求，
 *   file:// 也不支持。所以本地一定要走这个服务器。
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const PORT = Number(getArg('port', process.env.PORT || 5173));
const HOST = getArg('host', '127.0.0.1');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'image/vnd.radiance',
  '.ktx2': 'image/ktx2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

const mimeOf = (p) => MIME[extname(p).toLowerCase()] || 'application/octet-stream';

/** 把 URL 路径解析成 ROOT 内的真实文件路径；越界返回 null。 */
function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(decoded).replace(/^([/\\])+/, '');
  const abs = resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null;
  return abs;
}

/** 解析 Range: bytes=start-end，非法或不支持时返回 null。 */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;

  let start;
  let end;
  if (rawStart === '') {
    // bytes=-500 → 最后 500 字节
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return { unsatisfiable: true };
  return { start, end: Math.min(end, size - 1) };
}

async function sendFile(req, res, filePath, { headOnly = false } = {}) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return sendText(res, 404, `404 Not Found: ${req.url}`);
  }
  if (info.isDirectory()) {
    return sendFile(req, res, join(filePath, 'index.html'), { headOnly });
  }

  const type = mimeOf(filePath);
  const baseHeaders = {
    'Content-Type': type,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Accept-Ranges': 'bytes',
    'Last-Modified': info.mtime.toUTCString(),
    // 让 SharedArrayBuffer / 高精度计时器以后要用时不用改服务器
    'Cross-Origin-Opener-Policy': 'same-origin',
  };

  const range = parseRange(req.headers.range, info.size);
  if (range?.unsatisfiable) {
    res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${info.size}` });
    return res.end();
  }

  if (range) {
    const { start, end } = range;
    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${info.size}`,
      'Content-Length': end - start + 1,
    });
    if (headOnly) return res.end();
    return createReadStream(filePath, { start, end }).pipe(res);
  }

  res.writeHead(200, { ...baseHeaders, 'Content-Length': info.size });
  if (headOnly) return res.end();
  return createReadStream(filePath).pipe(res);
}

function sendText(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return sendText(res, 405, '405 Method Not Allowed');
  }
  const target = safeResolve(req.url || '/');
  if (!target) return sendText(res, 403, '403 Forbidden');

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/' || req.url === '') {
    return sendFile(req, res, join(ROOT, 'index.html'), { headOnly: method === 'HEAD' });
  }
  return sendFile(req, res, target, { headOnly: method === 'HEAD' });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗ 端口 ${PORT} 已被占用。换一个：npm run dev -- --port ${PORT + 1}\n`);
  } else {
    console.error('\n✗ 服务器启动失败：', err.message, '\n');
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`
  贵州人间长卷 · 本地预览已启动
  ────────────────────────────────────────────
  主页面        ${url}
  视频播放测试  ${url}video-test.html
  素材自检面板  ${url}?debug=1
  ────────────────────────────────────────────
  按 Ctrl+C 停止
`);
});
