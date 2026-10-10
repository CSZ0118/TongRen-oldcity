/**
 * 主入口：把长卷、彩蛋、音效、纯 2D 舞台串成一条体验链路。
 *
 * 一次完整的交互：
 *   拖动/滚动长卷 → 发现画里的彩蛋 → 点中
 *   → 响一声音效 → 进度 +1
 *   → 对应建筑从壁画那个位置「画出来 + 立起来」（SVG 描边 + 伪 3D + 粒子）
 *   → 6 个全点亮 → 整幅画进入天宫状态
 */
import { BUILD, SCROLL, COPY, EGGS, DEBUG, STAGE2D } from './config.js';
import { LongScroll } from './scroll.js';
import { paintPlaceholderScroll } from './scrollart.js';
import { EggField } from './eggs.js';
import { Stage2D } from './stage2d.js';
import { AudioBus } from './audio.js';
import { preflight } from './assets.js';
import { DebugPanel } from './debug.js';

const $ = (sel, root = document) => root.querySelector(sel);

const refs = {
  boot: $('#boot'),
  bootText: $('[data-boot-text]'),
  bootBar: $('[data-boot-bar]'),
  viewport: $('#scroll'),
  track: $('[data-track]'),
  art: $('[data-art]'),
  eggLayer: $('[data-eggs]'),
  revealsLayer: $('[data-reveals]'),
  buildingsLayer: $('[data-buildings]'),
  stageCanvas: $('#stage2d'),
  progressText: $('[data-progress-text]'),
  progressFill: $('[data-progress-fill]'),
  progressTicks: $('[data-progress-ticks]'),
  hint: $('#hint'),
  card: $('#card'),
  cardBody: $('[data-card-body]'),
  poem: $('#poem-float'),
  npcsLayer: $('[data-npcs]'),
  npcPanel: $('#npc-panel'),
  npcEmoji: $('[data-npc-emoji]'),
  npcName: $('[data-npc-name]'),
  npcRole: $('[data-npc-role]'),
  npcHello: $('[data-npc-hello]'),
  npcQuestions: $('[data-npc-questions]'),
  npcAnswer: $('[data-npc-answer]'),
  finale: $('#finale'),
  finaleLine: $('[data-finale-line]'),
  debug: $('#debug'),
  toast: $('#toast'),
  stageNote: $('[data-stage-note]'),
};

/** @type {LongScroll} */ let scroll;
/** @type {EggField} */ let eggs;
/** @type {Stage2D} */ let stage;
/** @type {AudioBus} */ let audio;
/** @type {DebugPanel|null} */ let debug = null;
/** @type {Awaited<ReturnType<typeof preflight>>|null} */ let manifest = null;

let soundOn = true;
let repaintTimer = 0;
let toastTimer = 0;
let rafId = 0;
let lastFrame = 0;
let artInfo = null;
/** @type {Map<string, HTMLElement>} 每个彩蛋对应的"场景活过来"浮现图 */
const reveals = new Map();
/** @type {Map<string, HTMLElement>} 每个彩蛋对应的 NPC 徽章 */
const npcs = new Map();
/** 当前对话面板里的 NPC（问题点击时取答案用） */
let currentNpc = null;
/** 「下一处彩蛋」的轮转游标：0..5 循环 */
let nextCursor = 0;

// ────────────────────────────────────────────────────────────
// 启动
// ────────────────────────────────────────────────────────────

async function boot() {
  document.title = `${COPY.title} · ${BUILD.name}`;
  $('[data-copy-title]').textContent = COPY.title;
  $('[data-copy-subtitle]').textContent = COPY.subtitle;
  $('[data-copy-reset]').textContent = COPY.reset;

  buildTicks();

  // 1) 长卷 + 占位壁画（先让画面出来，别让用户对着白屏等）
  scroll = new LongScroll(refs.viewport, SCROLL).mount();
  paintArt();
  buildReveals();
  scroll.subscribe((s) => {
    refs.progressFill.style.transform = `scaleX(${Math.max(0.001, s.progress)})`;
  });

  // 2) 音频 / 彩蛋
  audio = new AudioBus();
  eggs = new EggField(refs.eggLayer, {
    onFound: onEggFound,
    onProgress: renderProgress,
    persist: false, // 每次进入都从头开始：黑白长卷、零建筑，点了彩蛋才长出来
  });

  // 拖拽之后的第一次 click 当误触丢掉，否则拖长卷会莫名点亮彩蛋
  refs.track.addEventListener(
    'click',
    (ev) => {
      if (scroll.consumeDragClick()) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    },
    true,
  );

  renderProgress(eggs.count, eggs.total);

  // 3) 纯 2D 特效舞台（失败就降级，不能连累整个页面）
  stage = new Stage2D(refs.buildingsLayer, refs.stageCanvas, {
    onStatus: ({ ok, message, detail }) => {
      refs.stageNote.textContent = message;
      refs.stageNote.dataset.tone = ok ? 'ok' : 'warn';
      refs.stageNote.title = detail || '';
      if (!ok) console.warn('[stage2d]', message, detail || '');
    },
  });

  const [stageReady] = await Promise.all([
    stage.init(),
    // 4) 素材自检：把「哪些音效还没到位」摸清楚
    runPreflight(),
  ]);
  if (stageReady) stage.resize();

  // 5) 刷新页面后，把已经点亮的建筑重新立起来
  if (eggs.count > 0) {
    await stage.rebuildFound(eggs.foundEggs());
    if (eggs.complete) enterFinale({ silent: true });
  }

  wireUI();
  bindResize();
  if (DEBUG) {
    debug = new DebugPanel(refs.debug, {
      scroll,
      stage,
      eggs,
      getManifest: () => manifest,
      recheck: runPreflight,
      resetProgress,
    });
    debug.show();
  }

  finishBoot();
  startLoop();
}

// ────────────────────────────────────────────────────────────
// 长卷壁画
// ────────────────────────────────────────────────────────────

function paintArt() {
  if (SCROLL.image) {
    // 换成 AI 生成的真图之后走这条路
    refs.art.replaceWith(Object.assign(document.createElement('img'), {
      src: SCROLL.image,
      alt: '贵州人间长卷',
      className: 'scroll__art',
      draggable: false,
    }));
    refs.art = $('[data-art], .scroll__art');
    return;
  }
  artInfo = paintPlaceholderScroll(refs.art, {
    width: scroll.width,
    height: scroll.height,
    eggs: EGGS,
  });
}

// 每个彩蛋的"场景活过来"浮现图（透明 PNG/SVG，点中后淡入）。
// 素材没到位的会静默隐藏，不会漏破图。
function buildReveals() {
  EGGS.forEach((egg) => {
    if (!egg.reveal) return;
    const img = document.createElement('img');
    img.className = 'reveal';
    img.src = egg.reveal;
    img.alt = '';
    img.draggable = false;
    img.style.setProperty('--x', `${(egg.x * 100).toFixed(3)}%`);
    img.style.setProperty('--y', `${(egg.y * 100).toFixed(3)}%`);
    img.style.setProperty('--w', `${((egg.revealW ?? 0.045) * 100).toFixed(2)}%`);
    img.onerror = () => img.remove();
    refs.revealsLayer.appendChild(img);
    reveals.set(egg.id, img);
  });
}

function bindResize() {
  window.addEventListener('resize', () => {
    window.clearTimeout(repaintTimer);
    repaintTimer = window.setTimeout(() => {
      if (scroll.measure()) {
        stage.resize();
        if (!SCROLL.image) paintArt();
      }
    }, 220);
  });
}

// ────────────────────────────────────────────────────────────
// 素材自检
// ────────────────────────────────────────────────────────────

async function runPreflight() {
  manifest = await preflight({
    onProgress: (done, total) => {
      if (refs.boot.hidden) return;
      refs.bootText.textContent = `${COPY.loading} 素材自检 ${done}/${total}`;
      refs.bootBar.style.transform = `scaleX(${total ? done / total : 0})`;
    },
  });
  debug?.renderAssets();
  const s = manifest.summary;
  if (s.missing > 0) {
    console.info(
      `[assets] ${s.found}/${s.total} 到位；音效 ${s.audiosReady}/6。缺失的会自动走 WebAudio 合成兜底。`,
    );
  }
  return manifest;
}

// ────────────────────────────────────────────────────────────
// 核心交互：点中彩蛋
// ────────────────────────────────────────────────────────────

/**
 * @param {import('./config.js').EGGS[number]} egg
 * @param {number} index
 * @param {boolean} replay 之前已经点过（重复触发）
 */
function onEggFound(egg, index, replay) {
  // 音频解锁必须发生在用户手势的同步调用栈里
  audio.unlock();

  // ① 音效：有 mp3 放 mp3，没有就用 WebAudio 合成，保证一定有反馈
  audio.playEgg(egg, { baseHz: 349.23 * 1.1225 ** index });

  // ② 进度
  const state = eggs.markFound(egg.id);
  syncBgm(); // 背景乐跟着进度切：开场春 → 中段升 → 结尾冬

  // ②b 壁画"活过来"：这个场景的人物/活动浮现
  reveals.get(egg.id)?.classList.add('is-in');

  // ③ 把这座建筑对应的壁画位置挪到屏幕中间
  scroll.centerOn(egg.x);

  // ④ 建筑从壁画里长出来（SVG 描边 + 伪 3D + 粒子）
  stage.grow(egg).catch((err) => console.warn('[stage2d] grow 失败：', err));

  // ⑤ 信息卡 + 画卷题诗 + NPC
  showCard(egg, { replay });
  showPoem(egg);
  spawnNpc(egg);

  // ⑥ 全部点亮
  if (state.complete && state.first) enterFinale({ silent: false });
  else if (state.complete) enterFinale({ silent: true });

  hideHint();
}

function showCard(egg, { replay }) {
  const tag = replay
    ? '<span class="tag">又看了一遍</span>'
    : '<span class="tag tag--new">首次点亮</span>';

  refs.cardBody.innerHTML = `
    <div class="card__no">${String(egg.no).padStart(2, '0')}</div>
    <h2 class="card__place">${egg.place}</h2>
    <h3 class="card__building">${egg.building}</h3>
    ${egg.desc ? `<p class="card__desc">${egg.desc}</p>` : ''}
    <div class="card__tags">${tag}</div>
  `;
  refs.card.hidden = false;
  refs.card.classList.remove('is-in');
  // 强制重排，让进场动画每次都能播
  void refs.card.offsetWidth;
  refs.card.classList.add('is-in');

  window.clearTimeout(showCard.timer);
  showCard.timer = window.setTimeout(() => {
    refs.card.classList.remove('is-in');
  }, 7200);
}

/** 画卷题诗：点彩蛋后把四句诗竖排浮在画卷上，几秒后淡出 */
function showPoem(egg) {
  const lines = egg.poem ?? [];
  if (!lines.length) return;

  // 一列一列依次浮现：每句一个 <span>，动画延迟递增
  refs.poem.innerHTML = lines
    .map((line, i) => `<span style="animation-delay:${(i * 0.55).toFixed(2)}s">${line}</span>`)
    .join('');
  refs.poem.hidden = false;
  refs.poem.classList.remove('is-out');
  void refs.poem.offsetWidth; // 强制重排，让每次点亮都能重播逐句浮现

  window.clearTimeout(showPoem.timer);
  showPoem.timer = window.setTimeout(() => {
    refs.poem.classList.add('is-out');
  }, 8000);
}

// ────────────────────────────────────────────────────────────
// NPC：每个地方一个可问问题的角色
// ────────────────────────────────────────────────────────────

/** 点亮彩蛋后，在壁画上长出这个 NPC 的徽章（可点击） */
function spawnNpc(egg) {
  if (!egg.npc || npcs.has(egg.id)) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'npc';
  btn.dataset.id = egg.id;
  btn.dataset.noDrag = 'false'; // 让滚动引擎别把它当拖拽起点（和彩蛋一致，否则点不动）
  btn.style.setProperty('--x', `${(egg.x * 100).toFixed(3)}%`);
  btn.style.setProperty('--y', `${((egg.y - 0.09) * 100).toFixed(3)}%`);
  btn.setAttribute('aria-label', `问一问${egg.npc.name}（${egg.npc.role}）`);
  btn.innerHTML = `
    <span class="npc__emoji" aria-hidden="true">${egg.npc.emoji}</span>
    <span class="npc__name">${egg.npc.name}</span>
  `;
  refs.npcsLayer.appendChild(btn);
  npcs.set(egg.id, btn);
}

/** 打开对话面板：渲染 NPC 信息与问题按钮 */
function openNpc(egg) {
  const npc = egg.npc;
  if (!npc) return;
  currentNpc = npc;

  refs.npcEmoji.textContent = npc.emoji;
  refs.npcName.textContent = npc.name;
  refs.npcRole.textContent = npc.role;
  refs.npcHello.textContent = npc.hello;
  refs.npcQuestions.innerHTML = npc.questions
    .map((qa, i) => `<button type="button" class="npc-panel__q" data-q="${i}">${qa.q}</button>`)
    .join('');
  refs.npcAnswer.hidden = true;
  refs.npcAnswer.textContent = '';

  refs.npcPanel.hidden = false;
  refs.npcPanel.classList.remove('is-in');
  void refs.npcPanel.offsetWidth;
  refs.npcPanel.classList.add('is-in');
}

function closeNpc() {
  refs.npcPanel.classList.remove('is-in');
  window.setTimeout(() => {
    refs.npcPanel.hidden = true;
  }, 300);
}

function renderProgress(found, total) {
  refs.progressText.textContent = COPY.progressLabel(found, total);
  refs.progressFill.style.transform = `scaleX(${Math.max(0.001, found / total)})`;
  refs.progressTicks.querySelectorAll('.tick').forEach((el, i) => {
    el.classList.toggle('is-on', i < found);
  });
  document.body.classList.toggle('is-complete', found === total);

  // 整幅渐进上色：初始黑白，每点亮 1 个彩蛋彩色度 +1/6，全亮 = 全彩
  if (SCROLL.image && refs.art) {
    refs.art.style.filter = `grayscale(${Math.max(0, 1 - found / total)})`;
  }
}

/** 背景乐跟着进度走：开场春 → 中段升 → 结尾冬 */
function syncBgm() {
  audio.updateBgm(eggs ? eggs.count : 0, eggs ? eggs.total : EGGS.length);
}

function buildTicks() {
  refs.progressTicks.innerHTML = EGGS.map(
    (e) => `<span class="tick" title="${e.place}"></span>`,
  ).join('');
}

// ────────────────────────────────────────────────────────────
// 结局
// ────────────────────────────────────────────────────────────

function enterFinale({ silent }) {
  document.body.classList.add('is-finale');
  stage?.setFinale(true);
  if (!silent) {
    audio.finale();
    toast(COPY.allFound);
    refs.finaleLine.textContent = COPY.finaleLine;
    refs.finale.hidden = false;
    refs.finale.classList.add('is-in');
  }
}

function exitFinale() {
  refs.finale.classList.remove('is-in');
  window.setTimeout(() => {
    refs.finale.hidden = true;
  }, 400);
}

function resetProgress() {
  eggs.reset();
  syncBgm(); // 回到开场春
  stage?.reset();
  reveals.forEach((img) => img.classList.remove('is-in'));
  refs.poem?.classList.add('is-out');
  npcs.forEach((n) => n.remove());
  npcs.clear();
  closeNpc();
  document.body.classList.remove('is-finale', 'is-complete');
  exitFinale();
  renderProgress(0, EGGS.length);
  scroll.scrollToX(0);
  showHint();
}

// ────────────────────────────────────────────────────────────
// 提示 / toast
// ────────────────────────────────────────────────────────────

function showHint() {
  refs.hint.hidden = false;
  refs.hint.classList.add('is-in');
}
function hideHint() {
  refs.hint.classList.remove('is-in');
  window.setTimeout(() => {
    refs.hint.hidden = true;
  }, 500);
}

function toast(text) {
  refs.toast.textContent = text;
  refs.toast.classList.add('is-in');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => refs.toast.classList.remove('is-in'), 3200);
}

// ────────────────────────────────────────────────────────────
// UI 绑定
// ────────────────────────────────────────────────────────────

/** 「下一处彩蛋」：6 个彩蛋之间循环轮转，每次点跳到下一个（到 6 号后回到 1 号） */
function nextEgg() {
  const egg = EGGS[nextCursor % EGGS.length];
  nextCursor = (nextCursor + 1) % EGGS.length;
  scroll.centerOn(egg.x);
  eggs.nodes.get(egg.id)?.focus({ preventScroll: true });
}

function wireUI() {
  document.addEventListener('click', (ev) => {
    // 点面板外关闭对话（点 NPC 徽章本身不算，那是"打开"）
    if (!refs.npcPanel.hidden && refs.npcPanel.classList.contains('is-in')) {
      const t = ev.target instanceof Element ? ev.target : null;
      if (t && !t.closest('#npc-panel') && !t.closest('.npc')) closeNpc();
    }

    const btn = ev.target instanceof Element ? ev.target.closest('[data-act]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-act');

    if (act === 'sound') {
      soundOn = !soundOn;
      audio.setEnabled(soundOn);
      btn.textContent = soundOn ? COPY.soundOn : COPY.soundOff;
      btn.dataset.on = String(soundOn);
      if (soundOn) {
        audio.unlock();
        syncBgm();
      }
    }
    if (act === 'next') nextEgg();
    if (act === 'reset') resetProgress();
    if (act === 'debug') {
      ensureDebug();
      debug.toggle();
    }
    if (act === 'card-close') refs.card.classList.remove('is-in');
    if (act === 'npc-close') closeNpc();
    if (act === 'finale-close') exitFinale();
    if (act === 'finale-reset') {
      exitFinale();
      resetProgress();
    }
  });

  // NPC 徽章点击 → 打开对话
  refs.npcsLayer.addEventListener('click', (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest('.npc') : null;
    if (!btn) return;
    const egg = EGGS.find((e) => e.id === btn.dataset.id);
    if (egg) openNpc(egg);
  });

  // 对话面板里的问题按钮 → 显示答案
  refs.npcQuestions.addEventListener('click', (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest('.npc-panel__q') : null;
    if (!btn || !currentNpc) return;
    const i = Number(btn.dataset.q);
    const qa = currentNpc.questions[i];
    if (!qa) return;
    refs.npcAnswer.textContent = qa.a;
    refs.npcAnswer.hidden = false;
    refs.npcQuestions.querySelectorAll('.npc-panel__q').forEach((b) =>
      b.classList.toggle('is-on', b === btn));
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'd' || ev.key === 'D') {
      const t = document.activeElement?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      ensureDebug();
      debug.toggle();
    }
  });

  // 首次交互解锁音频 + 启动背景乐
  const unlock = () => {
    audio.unlock();
    syncBgm();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function ensureDebug() {
  if (!debug) {
    debug = new DebugPanel(refs.debug, {
      scroll,
      stage,
      eggs,
      getManifest: () => manifest,
      recheck: runPreflight,
      resetProgress,
    });
  }
}

// ────────────────────────────────────────────────────────────
// 主循环（只喂调试面板；2D 建筑用 CSS 过渡、粒子自带 rAF）
// ────────────────────────────────────────────────────────────

function startLoop() {
  lastFrame = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;

    debug?.sample(dt);
    debug?.renderLive();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

// ────────────────────────────────────────────────────────────
// 开场 / 收尾
// ────────────────────────────────────────────────────────────

function finishBoot() {
  refs.boot.classList.add('is-out');
  window.setTimeout(() => {
    refs.boot.hidden = true;
  }, 700);
  document.body.classList.add('is-ready');
  if (eggs.count === 0) showHint();
  console.info(
    `%c${BUILD.name} ${BUILD.stage} v${BUILD.version}`,
    'color:#7fd1c1;font-weight:700',
    '\n长卷：', artInfo ? `${artInfo.width}×${artInfo.height}px，绘制耗时 ${artInfo.ms}ms` : '外部图片',
    '\n特效：纯 2D（SVG 描边 + 粒子 + 伪 3D），按 D 打开调试面板',
  );
}

boot().catch((err) => {
  console.error('[boot] 启动失败：', err);
  if (refs.bootText) {
    refs.bootText.textContent = `启动失败：${err?.message || err}`;
    refs.bootText.dataset.tone = 'bad';
  }
});

// 热更新/调试时方便从控制台戳
Object.defineProperty(window, '__oldcity', {
  get: () => ({ scroll, eggs, stage, audio, manifest, build: BUILD, stage2d: STAGE2D }),
});

export { boot };
