/**
 * 主入口：把长卷、彩蛋、视频、音效、3D 舞台串成一条体验链路。
 *
 * 一次完整的交互：
 *   拖动/滚动长卷 → 发现画里的彩蛋 → 点中
 *   → 播「天宫长出来」的视频（没有素材就用兜底视频）
 *   → 响一声钟磬 → 进度 +1
 *   → 对应建筑从壁画那个位置长出来、发光、自转
 *   → 6 个全点亮 → 整幅画进入天宫状态
 */
import { BUILD, SCROLL, COPY, EGGS, DEBUG, STAGE3D } from './config.js';
import { LongScroll } from './scroll.js';
import { paintPlaceholderScroll } from './scrollart.js';
import { EggField } from './eggs.js';
import { Stage3D } from './stage3d.js';
import { VideoLayer } from './video.js';
import { AudioBus } from './audio.js';
import { preflight, resolveVideo, formatSize } from './assets.js';
import { DebugPanel } from './debug.js';
import { synthesizeClip } from './video-probe.js';

const $ = (sel, root = document) => root.querySelector(sel);

const refs = {
  boot: $('#boot'),
  bootText: $('[data-boot-text]'),
  bootBar: $('[data-boot-bar]'),
  viewport: $('#scroll'),
  track: $('[data-track]'),
  art: $('[data-art]'),
  eggLayer: $('[data-eggs]'),
  stageCanvas: $('#stage3d'),
  progressText: $('[data-progress-text]'),
  progressFill: $('[data-progress-fill]'),
  progressTicks: $('[data-progress-ticks]'),
  hint: $('#hint'),
  card: $('#card'),
  cardBody: $('[data-card-body]'),
  finale: $('#finale'),
  finaleLine: $('[data-finale-line]'),
  debug: $('#debug'),
  layers: $('#layers'),
  toast: $('#toast'),
  stageNote: $('[data-stage-note]'),
};

/** @type {LongScroll} */ let scroll;
/** @type {EggField} */ let eggs;
/** @type {Stage3D} */ let stage;
/** @type {VideoLayer} */ let video;
/** @type {AudioBus} */ let audio;
/** @type {DebugPanel|null} */ let debug = null;
/** @type {Awaited<ReturnType<typeof preflight>>|null} */ let manifest = null;

let soundOn = true;
let repaintTimer = 0;
let toastTimer = 0;
let elapsed = 0;
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

  // 2) 视频层 / 音频 / 彩蛋（视频元素必须提前建好，见 video.js 注释）
  video = new VideoLayer(refs.layers);
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

  // 3) 3D 舞台（失败就降级，不能连累整个页面）
  stage = new Stage3D(refs.stageCanvas, {
    onStatus: ({ ok, message, detail }) => {
      refs.stageNote.textContent = message;
      refs.stageNote.dataset.tone = ok ? 'ok' : 'warn';
      refs.stageNote.title = detail || '';
      if (!ok) console.warn('[stage3d]', message, detail || '');
    },
  });

  const [stageReady] = await Promise.all([
    stage.init(),
    // 4) 素材自检：把「哪些素材还没到位」摸清楚，后面点击才知道该走真素材还是兜底
    runPreflight(),
  ]);
  if (stageReady) stage.resize();

  // 5) 刷新页面后，把已经点亮的建筑重新立起来
  if (eggs.count > 0) {
    await stage.rebuildFound(eggs.foundEggs(), resolveModelUrl);
    if (eggs.complete) enterFinale({ silent: true });
  }

  wireUI();
  bindResize();
  if (DEBUG) {
    debug = new DebugPanel(refs.debug, {
      scroll,
      stage,
      eggs,
      video,
      getManifest: () => manifest,
      recheck: runPreflight,
      playTestVideo: () => playTestVideo(),
      synthTest: runSynthTest,
      resetProgress: resetProgress,
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
    // Day2 换成 AI 生成的真图之后走这条路
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
      `[assets] ${s.found}/${s.total} 到位；彩蛋视频 ${s.eggVideosReady}/6，GLB ${s.modelsReady}/6，音效 ${s.audiosReady}/6。缺失的素材会自动走占位/兜底。`,
    );
  }
  return manifest;
}

/** 某个彩蛋该用哪个 GLB（没有就 null → 用占位建筑） */
function resolveModelUrl(egg) {
  const entry = manifest?.eggs.find((e) => e.egg.id === egg.id);
  return entry?.model.exists ? entry.model.url : null;
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

  // ① 视频：这一句必须同步执行（前面不能有 await），否则自动播放策略会拒绝
  const entry = manifest?.eggs[index];
  const pick = resolveVideo(entry, manifest?.fallback);
  const videoPromise = video.show(pick.src, {
    label: `${egg.no}. ${egg.place} · ${egg.building}`,
    badge: pick.real ? '' : '【占位素材】',
    tone: pick.real ? 'ok' : 'warn',
  });
  videoPromise.then((mode) => {
    if (mode === 'blocked') toast('视频被浏览器拦下了，点画面任意处再试一次');
    else if (mode === 'no-src') toast('还没有可播放的视频素材');
  });

  // ② 音效：有 mp3 放 mp3，没有就用 WebAudio 合成，保证一定有反馈
  audio.playEgg(egg, { baseHz: 349.23 * 1.1225 ** index });

  // ③ 进度
  const state = eggs.markFound(egg.id);

  // ④ 把这座建筑对应的壁画位置挪到屏幕中间
  scroll.centerOn(egg.x);

  // ⑤ 建筑从壁画里长出来
  stage
    .grow(egg, { modelUrl: resolveModelUrl(egg) })
    .then((b) => {
      if (b && b.source === 'placeholder') {
        refs.stageNote.textContent = `${egg.building}：占位建筑（等 Day2 的 GLB）`;
        refs.stageNote.dataset.tone = 'warn';
      } else if (b) {
        refs.stageNote.textContent = `${egg.building}：GLB 已加载`;
        refs.stageNote.dataset.tone = 'ok';
      }
    })
    .catch((err) => console.warn('[stage3d] grow 失败：', err));

  // ⑥ 信息卡
  showCard(egg, { replay, realVideo: pick.real, realModel: Boolean(resolveModelUrl(egg)) });

  // ⑦ 全部点亮
  if (state.complete && state.first) enterFinale({ silent: false });
  else if (state.complete) enterFinale({ silent: true });

  hideHint();
}

function showCard(egg, { replay, realVideo, realModel }) {
  const tags = [
    `<span class="tag ${realVideo ? 'tag--ok' : 'tag--warn'}">视频 ${realVideo ? '真素材' : '占位'}</span>`,
    `<span class="tag ${realModel ? 'tag--ok' : 'tag--warn'}">建筑 ${realModel ? 'GLB' : '占位'}</span>`,
    replay ? '<span class="tag">又看了一遍</span>' : '<span class="tag tag--new">首次点亮</span>',
  ].join('');

  refs.cardBody.innerHTML = `
    <div class="card__no">${String(egg.no).padStart(2, '0')}</div>
    <h2 class="card__place">${egg.place}</h2>
    <p class="card__hint">画里：${egg.hint}</p>
    <p class="card__building">长出：<strong>${egg.building}</strong></p>
    <div class="card__tags">${tags}</div>
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
      if (!debug) {
        debug = new DebugPanel(refs.debug, {
          scroll,
          stage,
          eggs,
          video,
          getManifest: () => manifest,
          recheck: runPreflight,
          playTestVideo: () => playTestVideo(),
          synthTest: runSynthTest,
          resetProgress,
        });
      }
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
      if (!debug) {
        debug = new DebugPanel(refs.debug, {
          scroll,
          stage,
          eggs,
          video,
          getManifest: () => manifest,
          recheck: runPreflight,
          playTestVideo: () => playTestVideo(),
          synthTest: runSynthTest,
          resetProgress,
        });
      }
      debug.toggle();
    }
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') video.hide('user');
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

async function playTestVideo() {
  const src = manifest?.fallback.exists
    ? manifest.fallback.url
    : manifest?.eggs.find((e) => e.video.exists)?.video.url;
  if (!src) {
    toast('仓库里还没有任何视频素材');
    return;
  }
  const mode = await video.show(src, { label: '视频播放测试', badge: '自检', tone: 'ok' });
  console.info('[video-test] play() 结果：', mode, video.stats);
}

async function runSynthTest() {
  const r = await synthesizeClip({ durationMs: 3000 });
  if (!r.ok) return `合成失败：${r.error}`;
  const mode = await video.show(r.blobUrl, {
    label: '合成视频回放',
    badge: `${r.mimeType} ${formatSize(r.bytes)}`,
    tone: 'ok',
  });
  return `合成成功：${r.mimeType}｜${formatSize(r.bytes)}｜回放 ${mode}`;
}

// ────────────────────────────────────────────────────────────
// 主循环
// ────────────────────────────────────────────────────────────

function startLoop() {
  lastFrame = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    elapsed += dt;

    debug?.sample(dt);
    if (stage?.ready && stage.buildings.size > 0) {
      stage.update(dt, {
        scrollX: scroll.current,
        contentWidth: scroll.width,
        contentHeight: scroll.height,
        elapsed,
      });
      stage.render();
    }
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
    '\n按 D 打开调试面板，?debug=1 可直接进入',
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
  get: () => ({ scroll, eggs, stage, video, audio, manifest, build: BUILD, stage3d: STAGE3D }),
});

export { boot };
