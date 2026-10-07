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
  buildingsLayer: $('[data-buildings]'),
  stageCanvas: $('#stage2d'),
  progressText: $('[data-progress-text]'),
  progressFill: $('[data-progress-fill]'),
  progressTicks: $('[data-progress-ticks]'),
  hint: $('#hint'),
  card: $('#card'),
  cardBody: $('[data-card-body]'),
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
  scroll.subscribe((s) => {
    refs.progressFill.style.transform = `scaleX(${Math.max(0.001, s.progress)})`;
  });

  // 2) 音频 / 彩蛋
  audio = new AudioBus();
  eggs = new EggField(refs.eggLayer, {
    onFound: onEggFound,
    onProgress: renderProgress,
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

  // ③ 把这座建筑对应的壁画位置挪到屏幕中间
  scroll.centerOn(egg.x);

  // ④ 建筑从壁画里长出来（SVG 描边 + 伪 3D + 粒子）
  stage.grow(egg).catch((err) => console.warn('[stage2d] grow 失败：', err));

  // ⑤ 信息卡
  showCard(egg, { replay });

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
    <p class="card__hint">画里：${egg.hint}</p>
    <p class="card__building">长出：<strong>${egg.building}</strong></p>
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

function renderProgress(found, total) {
  refs.progressText.textContent = COPY.progressLabel(found, total);
  refs.progressFill.style.transform = `scaleX(${Math.max(0.001, found / total)})`;
  refs.progressTicks.querySelectorAll('.tick').forEach((el, i) => {
    el.classList.toggle('is-on', i < found);
  });
  document.body.classList.toggle('is-complete', found === total);
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
  stage?.reset();
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

function wireUI() {
  document.addEventListener('click', (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest('[data-act]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-act');

    if (act === 'sound') {
      soundOn = !soundOn;
      audio.setEnabled(soundOn);
      btn.textContent = soundOn ? COPY.soundOn : COPY.soundOff;
      btn.dataset.on = String(soundOn);
      if (soundOn) audio.unlock();
    }
    if (act === 'next') {
      if (!eggs.focusFirstUnfound(scroll)) toast('六座天宫都亮了');
    }
    if (act === 'reset') resetProgress();
    if (act === 'debug') {
      ensureDebug();
      debug.toggle();
    }
    if (act === 'card-close') refs.card.classList.remove('is-in');
    if (act === 'finale-close') exitFinale();
    if (act === 'finale-reset') {
      exitFinale();
      resetProgress();
    }
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'd' || ev.key === 'D') {
      const t = document.activeElement?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      ensureDebug();
      debug.toggle();
    }
  });

  // 首次交互解锁音频
  const unlock = () => {
    audio.unlock();
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
