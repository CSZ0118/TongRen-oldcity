#!/usr/bin/env node
/**
 * 无头冒烟测试 —— Day1 验收的自动化版本。
 *
 *   node tools/smoke.mjs                  # 自动起服务 + 跑测试
 *   node tools/smoke.mjs --url http://127.0.0.1:5173   # 测已有的服务
 *   node tools/smoke.mjs --keep           # 跑完不关浏览器（看现场）
 *
 * 它用无头 Edge/Chrome 真开一次页面，检查 Day1 的验收项：
 *   ① 页面能打开、没有 JS 报错
 *   ② 长卷画出来了、能滚动
 *   ③ 6 个彩蛋都在，点一下真的能点亮
 *   ④ 点完之后视频层真的开始播（currentTime 在走）
 *   ⑤ Three.js 舞台就绪、建筑真的长出来了
 *   ⑥ video-test.html 的自检结论
 *
 * 退出码：0 = 全通过；1 = 有失败项。
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── 参数 ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const HAS = (name) => argv.includes(`--${name}`);

const PORT = Number(getArg('port', 5173));
const CDP_PORT = Number(getArg('cdp-port', 9333));
const KEEP = HAS('keep');
const externalUrl = getArg('url');
const BASE = externalUrl || `http://127.0.0.1:${PORT}`;

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

// ── 小工具 ──────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const C = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? C.ok('  ✓') : C.bad('  ✗');
  console.log(`${mark} ${name}${detail ? C.dim(`  ${detail}`) : ''}`);
}

/** 把当前页面截下来存到 _tmp/，方便肉眼复核（_tmp 已在 .gitignore 里） */
async function shot(name) {
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const dir = join(ROOT, '_tmp');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), Buffer.from(data, 'base64'));
    console.log(C.dim(`  📷 截图 → _tmp/${name}`));
  } catch (err) {
    console.log(C.dim(`  （截图失败：${err?.message || err}）`));
  }
}

async function waitForHttp(url, { timeout = 20000, interval = 200 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (r.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await sleep(interval);
  }
  return false;
}

// ── 极简 CDP 客户端 ─────────────────────────────────────────
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    /** 附加到某个 target 之后，所有命令都带上它 */
    this.sessionId = null;
    ws.addEventListener('message', (ev) => {
      /** @type {any} */
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`WebSocket 连接超时：${wsUrl}`)), 10000);
      ws.addEventListener('open', () => {
        clearTimeout(t);
        res();
      });
      ws.addEventListener('error', (ev) => {
        clearTimeout(t);
        rej(new Error(`WebSocket 连接失败：${wsUrl}（${ev?.message || ev?.type || 'error'}）`));
      });
    });
    return new CDP(ws);
  }

  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  async eval(expression, { awaitPromise = true } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text || '页面内脚本抛错',
      );
    }
    return r.result?.value;
  }
}

// ── 主流程 ──────────────────────────────────────────────────
let server = null;
let browser = null;
let cdp = null;
let profileDir = null;

async function main() {
  // 1) 需要的话，自己起一个静态服务器
  if (!externalUrl) {
    console.log(C.dim(`\n启动本地服务 http://127.0.0.1:${PORT} …`));
    server = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), '--port', String(PORT)], {
      cwd: ROOT,
      stdio: 'ignore', // 沙箱下不能用管道捕获输出
      detached: false,
    });
    const ready = await waitForHttp(`${BASE}/index.html`);
    if (!ready) throw new Error(`本地服务没起来：${BASE}/index.html`);
  }

  // 2) 起无头浏览器
  const exe = BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error('找不到 Edge/Chrome，无法跑无头测试');
  console.log(C.dim(`浏览器：${exe}`));

  profileDir = join(ROOT, '.smoke-profile');
  if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });

  browser = spawn(
    exe,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--mute-audio',
      '--enable-unsafe-swiftshader', // 无头环境里给软件 WebGL
      '--window-size=1600,900',
      'about:blank',
    ],
    { stdio: 'ignore', detached: false },
  );

  const cdpReady = await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/list`, { timeout: 30000 });
  if (!cdpReady) throw new Error('浏览器的调试端口没起来');
  console.log(C.dim('  CDP 端口已就绪，正在附加…'));

  // 3) 直连页面 target 的 WebSocket。
  //    注意：不要走浏览器级 endpoint + Target.attachToTarget 的 session 模式 ——
  //    实测在本机 Edge 上 session 级命令收不到响应，直连 page target 最稳。
  const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`, {
    signal: AbortSignal.timeout(5000),
  }).then((r) => r.json());

  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error(`没找到可用的页面 target：${targets.map((t) => t.type).join(', ')}`);
  }

  cdp = await CDP.connect(pageTarget.webSocketDebuggerUrl);
  console.log(C.dim(`  已连接页面 target ${pageTarget.id.slice(0, 8)}…`));

  /** @type {{level:string,text:string}[]} */
  const logs = [];
  /** @type {string[]} */
  const errors = [];
  /** 素材 404 计数：Day2 交付前这是预期内的，单独统计不计入失败 */
  let expectedMissing = 0;

  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args || [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
      .join(' ');
    logs.push({ level: p.type, text });
    if (p.type === 'error') errors.push(text);
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    errors.push(d?.exception?.description || d?.text || '未捕获异常');
  });
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry?.level !== 'error') return;
    const url = p.entry.url || '';
    // Day2 才交付的素材现在必然 404，那是自检的预期结果，不算页面错误
    if (url.includes('/assets/')) {
      expectedMissing += 1;
      return;
    }
    errors.push(`[${p.entry.source}] ${p.entry.text}${url ? ` (${url})` : ''}`);
  });

  await cdp.send('Runtime.enable');
  console.log(C.dim('  Runtime 已启用'));
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  console.log(C.dim('  Page 已启用'));
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  console.log(C.dim('  视口 1600×900'));

  // ────────────────────────────────────────────────────────
  console.log(C.bold('\n【1/2】主页面 index.html\n'));
  // ────────────────────────────────────────────────────────
  await cdp.send('Page.navigate', { url: `${BASE}/index.html` });
  await sleep(6000); // 等开场自检 + Three.js 初始化

  const boot = await cdp.eval(`(() => {
    const el = document.querySelector('[data-art]');
    return {
      ready: document.body.classList.contains('is-ready'),
      bootHidden: document.querySelector('#boot')?.hidden ?? false,
      bootText: document.querySelector('[data-boot-text]')?.textContent ?? '',
      eggs: document.querySelectorAll('.egg').length,
      artW: el?.width ?? 0,
      artH: el?.height ?? 0,
      title: document.querySelector('[data-copy-title]')?.textContent ?? '',
    };
  })()`);

  check('页面加载完成（body.is-ready）', boot.ready === true);
  check('开场加载层已收起', boot.bootHidden === true, boot.bootText);
  check('长卷壁画已绘制', boot.artW > 800 && boot.artH > 300, `${boot.artW}×${boot.artH}px`);
  check('6 个彩蛋热点全部生成', boot.eggs === 6, `实际 ${boot.eggs} 个`);

  const scrollInfo = await cdp.eval(`(() => {
    const s = window.__oldcity.scroll;
    s.scrollToX(900);
    return { max: s.max, width: s.width, target: s.target };
  })()`);
  await sleep(700);
  const scrolled = await cdp.eval(`(() => {
    const s = window.__oldcity.scroll;
    return { x: Math.round(s.current), max: Math.round(s.max), ratio: +s.state().ratio.toFixed(3) };
  })()`);
  check(
    '长卷可横向滚动',
    scrollInfo.max > 500 && scrolled.x > 200,
    `内容 ${Math.round(scrollInfo.width)}px，上限 ${scrollInfo.max}px，当前 x=${scrolled.x}`,
  );

  const three = await cdp.eval(`(() => {
    const st = window.__oldcity.stage;
    return { ready: st.ready, rev: st.THREE?.REVISION ?? null, renderer: st.info.renderer };
  })()`);
  check(
    'Three.js 舞台就绪（WebGL 可用）',
    three.ready === true,
    three.ready ? `r${three.rev} · ${three.renderer}` : '降级为纯 2D 光效（无头环境可能没有 WebGL）',
  );

  const manifest = await cdp.eval(`(() => JSON.stringify(window.__oldcity.manifest?.summary ?? null))()`);
  console.log(C.dim(`  素材自检：${manifest}`));
  await shot('01-index-initial.png');

  // ── 真实点击一个彩蛋（用 Input 派发，是真·用户手势）──
  // 先把长卷滚回起点，否则刚才的滚动测试会把「铜仁古城」推出屏幕外
  await cdp.eval(`(() => { window.__oldcity.scroll.scrollToX(0, { immediate: true }); return true; })()`);
  await sleep(500);

  const box = await cdp.eval(`(() => {
    const egg = document.querySelector('.egg[data-id="tongren"]');
    if (!egg) return null;
    const r = egg.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    return {
      x: cx,
      y: cy,
      inView: cx > 4 && cx < innerWidth - 4 && cy > 4 && cy < innerHeight - 4,
    };
  })()`);

  if (!box) {
    check('找到「铜仁古城」彩蛋', false);
  } else {
    check(
      '「铜仁古城」彩蛋在屏幕内可点',
      box.inView,
      `屏幕坐标 (${box.x}, ${box.y})`,
    );

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x,
      y: box.y,
      button: 'none',
      pointerType: 'mouse',
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
      pointerType: 'mouse',
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
      pointerType: 'mouse',
    });

    await sleep(2600);

    const after = await cdp.eval(`(async () => {
      const { eggs, stage, video } = window.__oldcity;
      const v = video.video;
      const t0 = v.currentTime;
      await new Promise(r => setTimeout(r, 700));
      return {
        found: eggs.count,
        active: eggs.activeId,
        buildings: stage.buildings.size,
        buildingSource: [...stage.buildings.values()].map(b => b.source),
        layerOpen: !video.el.hidden,
        src: v.currentSrc || v.src || '',
        readyState: v.readyState,
        muted: v.muted,
        t0,
        t1: v.currentTime,
        error: video.stats.error,
      };
    })()`, { awaitPromise: true });

    check('点击彩蛋后进度 +1', after.found === 1, `activeId=${after.active}`);
    check('建筑从壁画里长出来', after.buildings >= 1, `来源 ${after.buildingSource.join(',')}`);
    check('视频层被打开', after.layerOpen === true, after.src ? after.src.split('/').slice(-1)[0] : '无 src');
    check(
      '视频真的在播（currentTime 在走）',
      after.t1 > after.t0 && after.readyState >= 2,
      `readyState=${after.readyState}　currentTime ${after.t0.toFixed(2)} → ${after.t1.toFixed(2)}　muted=${after.muted}${after.error ? `　错误：${after.error}` : ''}`,
    );
    await shot('02-index-egg-clicked.png');

    // 关掉视频，单独看一眼 3D 建筑长出来的样子
    await cdp.eval(`(() => { window.__oldcity.video.hide('user'); return true; })()`);
    await sleep(600);
    await shot('03-index-building.png');
  }

  check('主页面无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' ｜ '));
  console.log(C.dim(`  已忽略 ${expectedMissing} 条素材 404（Day2 才交付，属预期内）`));
  if (logs.length) {
    console.log(C.dim('\n  页面日志：'));
    for (const l of logs.slice(0, 12)) console.log(C.dim(`    [${l.level}] ${l.text.slice(0, 150)}`));
  }

  // ────────────────────────────────────────────────────────
  console.log(C.bold('\n【2/2】验收页 video-test.html\n'));
  // ────────────────────────────────────────────────────────
  errors.length = 0;
  await cdp.send('Page.navigate', { url: `${BASE}/video-test.html` });
  await sleep(9000); // 等自检 + 逐个播放 + 合成回放

  const vt = await cdp.eval(`(() => {
    const v = document.querySelector('[data-verdict]');
    return {
      state: v?.dataset.state ?? 'missing',
      title: document.querySelector('[data-verdict-title]')?.textContent ?? '',
      items: [...document.querySelectorAll('[data-verdict-list] li')].map(li => li.textContent),
      rows: document.querySelectorAll('.arow').length,
      playOut: (document.querySelector('[data-play-out]')?.textContent ?? '').split('\\n').slice(-3).join(' / '),
      synthOut: (document.querySelector('[data-synth-out]')?.textContent ?? '').split('\\n').slice(0, 2).join(' / '),
    };
  })()`);

  check('自检页跑出结论', ['pass', 'warn', 'fail'].includes(vt.state), `${vt.state} — ${vt.title}`);
  check('素材清单渲染出 7 行（6 段彩蛋 + 兜底）', vt.rows === 7, `实际 ${vt.rows} 行`);
  check('视频自检结论非 FAIL', vt.state !== 'fail', `${vt.state} — ${vt.title}`);
  check('自检页无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' ｜ '));

  console.log(C.dim('\n  结论条目：'));
  for (const it of vt.items) console.log(C.dim(`    · ${it}`));
  console.log(C.dim(`\n  播放测试末行：${vt.playOut}`));
  console.log(C.dim(`  合成测试：${vt.synthOut}`));
  await shot('04-video-test.png');

  // ── 收尾 ──────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(
    C.bold(
      `\n${failed.length === 0 ? C.ok('全部通过') : C.bad(`${failed.length} 项未通过`)}` +
        `　共 ${results.length} 项检查\n`,
    ),
  );
  if (failed.length) {
    for (const f of failed) console.log(C.bad(`  ✗ ${f.name}  ${f.detail}`));
    console.log('');
  }
  return failed.length === 0 ? 0 : 1;
}

async function cleanup(code) {
  try {
    if (!KEEP && cdp) await cdp.send('Browser.close');
  } catch {
    /* ignore */
  }
  await sleep(600);
  try {
    if (browser && browser.exitCode === null) browser.kill();
  } catch {
    /* ignore */
  }
  try {
    if (server && server.exitCode === null) server.kill();
  } catch {
    /* ignore */
  }
  await sleep(300);
  try {
    if (profileDir && existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(code);
}

main()
  .then((code) => cleanup(code))
  .catch(async (err) => {
    console.error(C.bad(`\n✗ 冒烟测试失败：${err?.message || err}\n`));
    if (err?.stack) console.error(C.dim(err.stack.split('\n').slice(1, 4).join('\n')));
    await cleanup(1);
  });
