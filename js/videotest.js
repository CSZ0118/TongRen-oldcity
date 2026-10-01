/**
 * Day1 验收页逻辑：视频播放测试。
 *
 * 这个页面的唯一目的，是把「网页到底能不能把视频播出来」这件事查清楚，
 * 并且给出一份可以贴到群里/写进文档的结论。
 *
 * 一共查 6 件事（页面上也是这 6 块）：
 *   1. 同一个 <video> 元素走 "改 src → load() → play()" 能不能播
 *   2. 6 段彩蛋视频 + 兜底视频到位了没有、时长/分辨率对不对
 *   3. 本机浏览器支持哪些视频/音频编码（决定剪映该导出什么格式）
 *   4. 自动播放策略：静音能不能自动播、带声音能不能自动播
 *   5. 完全不依赖素材的 canvas + MediaRecorder 合成回放
 *   6. 任意本机文件拖进来能不能播
 */
import { BUILD, EGGS, FALLBACK_VIDEO } from './config.js';
import { preflight, formatSize, probe } from './assets.js';
import { codecMatrix, autoplayPolicy, loadMeta, synthesizeClip } from './video-probe.js';

const $ = (sel, root = document) => root.querySelector(sel);

const player = $('[data-player]');
const srcSelect = $('[data-src-select]');
const playOut = $('[data-play-out]');
const synthOut = $('[data-synth-out]');
const assetsEl = $('[data-assets]');
const capsEl = $('[data-caps]');
const autoplayEl = $('[data-autoplay]');
const verdictEl = $('[data-verdict]');

const state = {
  caps: null,
  autoplay: null,
  synth: null,
  /** @type {Array<{key:string,label:string,url:string,exists:boolean,size:number,type:string,meta:any,play:any}>} */
  sources: [],
  /** 额外加入播放列表的临时源（合成视频 / 本地文件） */
  extras: [],
  startedAt: new Date().toISOString(),
};

// ────────────────────────────────────────────────────────────
// 工具
// ────────────────────────────────────────────────────────────

const MEDIA_ERRORS = {
  1: 'MEDIA_ERR_ABORTED：加载被中止',
  2: 'MEDIA_ERR_NETWORK：网络错误（多半是路径不对 / 404）',
  3: 'MEDIA_ERR_DECODE：解码失败（编码不支持或文件损坏）',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED：格式或编码不支持 / 资源不存在',
};

function describeMediaError(video) {
  const e = video?.error;
  if (!e) return '未知错误（未触发 MediaError）';
  return MEDIA_ERRORS[e.code] || `MediaError code=${e.code} ${e.message || ''}`.trim();
}

/** 播一次，确认真的开始出画面；播一小段就收工，避免浪费时间 */
function playOnce(video, src, { muted = true, timeout = 10000, playMs = 1200 } = {}) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    let settled = false;
    let playing = false;
    let stalledSeen = false;
    let timer = 0;
    let afterTimer = 0;

    const cleanup = () => {
      window.clearTimeout(timer);
      window.clearTimeout(afterTimer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      video.removeEventListener('stalled', onBuffering);
      video.removeEventListener('suspend', onBuffering);
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const onPlaying = () => {
      if (playing) return;
      playing = true;
      const latency = Math.round(performance.now() - t0);
      // 已经出画面了，再放一小会儿，确认不是"起了一下就卡住"
      afterTimer = window.setTimeout(() => {
        finish({
          ok: true,
          latency,
          playedMs: Math.round(performance.now() - t0),
          duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : 0,
          width: video.videoWidth,
          height: video.videoHeight,
          paused: video.paused,
        });
      }, playMs);
    };

    const onError = () => finish({ ok: false, latency: null, error: describeMediaError(video) });
    // 注意：stalled / suspend 是浏览器的常规缓冲状态通知（load() 之后几乎必然来一次），
    // 不能当成失败，只能记下来，等真的超时了再写进错误信息里。
    const onBuffering = () => {
      if (!playing) stalledSeen = true;
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    video.addEventListener('stalled', onBuffering);
    video.addEventListener('suspend', onBuffering);

    timer = window.setTimeout(() => {
      if (!playing) {
        finish({
          ok: false,
          latency: null,
          error:
            `超时 ${timeout}ms 内没有开始播放` +
            (stalledSeen ? '（期间收到 stalled/suspend，素材可能不存在，或服务器不支持 Range 请求）' : ''),
        });
      }
    }, timeout);

    try {
      video.muted = muted;
      video.src = src;
      video.load();
      const p = video.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          if (!playing) finish({ ok: false, latency: null, error: `play() 被拒绝：${err?.name || ''} ${err?.message || ''}`.trim() });
        });
      }
    } catch (err) {
      finish({ ok: false, latency: null, error: `设置 src 抛异常：${err?.message || err}` });
    }
  });
}

// ────────────────────────────────────────────────────────────
// 渲染：能力矩阵
// ────────────────────────────────────────────────────────────

function renderCaps() {
  const { containers, video, audio, mse, verdict } = state.caps;
  const chip = (c) => {
    const tone = c.support === 'no' ? 'no' : c.support === 'maybe' ? 'warn' : 'ok';
    const label = c.support === 'no' ? '不支持' : c.support === 'maybe' ? '可能支持' : '支持';
    return `<span class="cap cap--${tone}">${c.label}<em>${label}</em></span>`;
  };

  capsEl.innerHTML = `
    <p class="verdict__body" style="font-size:.82rem;color:${verdict.mp4 ? 'var(--ok)' : 'var(--bad)'}">${verdict.note}</p>
    <div class="caps__group"><h3>容器</h3><div class="caps">${containers.map(chip).join('')}</div></div>
    <div class="caps__group"><h3>视频编码</h3><div class="caps">${video.map(chip).join('')}</div></div>
    <div class="caps__group"><h3>音频编码</h3><div class="caps">${audio.map(chip).join('')}</div></div>
    <div class="caps__group"><h3>MediaSource（MSE，流式播放用）</h3>
      ${
        mse
          ? `<div class="caps">${mse.slice(0, 6).map(chip).join('')}</div>`
          : '<p class="card-x__hint" style="margin:0">本浏览器不支持 MSE（本项目也不依赖它，纯 file 播放在所有现代浏览器都可用）</p>'
      }
    </div>
  `;
}

// ────────────────────────────────────────────────────────────
// 渲染：自动播放策略
// ────────────────────────────────────────────────────────────

function renderAutoplay() {
  const a = state.autoplay;
  if (!a) {
    autoplayEl.textContent = '检测中…';
    return;
  }
  const line = (ok, yes, no) =>
    `<li data-tone="${ok ? 'ok' : 'warn'}">${ok ? yes : no}</li>`;
  autoplayEl.innerHTML = `
    <ul class="verdict__list">
      ${line(a.mutedAutoplay, '静音自动播放：可用（视频兜底策略成立）', '静音自动播放：被拒 —— 视频必须由用户点击触发')}
      ${line(a.unmutedAutoplay, '带声音自动播放：可用', '带声音自动播放：被拒（正常现象，靠用户点击即可）')}
      <li data-tone="${a.userActivation ? 'ok' : 'warn'}">当前页面用户手势状态：${a.userActivation ? '已激活' : '未激活（还没点过页面）'}</li>
      ${a.note ? `<li>${a.note}</li>` : ''}
    </ul>
    <p class="card-x__hint" style="margin:10px 0 0">
      主页面 <code>js/video.js</code> 的策略：在彩蛋 click 的同步调用栈里 <code>play()</code>，
      带声音被拒就自动退回静音重播 —— 所以无论上面结果如何，视频画面都能出来。
    </p>
  `;
}

// ────────────────────────────────────────────────────────────
// 渲染：素材清单
// ────────────────────────────────────────────────────────────

function renderAssets() {
  if (!state.sources.length) {
    assetsEl.textContent = '自检中…';
    return;
  }
  assetsEl.innerHTML = state.sources
    .map((s) => {
      const st = !s.exists ? 'bad' : s.play ? (s.play.ok ? 'ok' : 'bad') : 'pending';
      const stateText = !s.exists
        ? '缺失'
        : s.play
          ? s.play.ok
            ? `可播放 ${s.play.latency}ms`
            : '播放失败'
          : '待测';

      const meta = !s.exists
        ? '文件不存在 —— 主页面会用兜底素材顶上'
        : [
            formatSize(s.size),
            s.meta?.ok ? `${s.meta.duration}s` : null,
            s.meta?.ok && s.meta.width ? `${s.meta.width}×${s.meta.height}` : null,
            s.meta && !s.meta.ok ? `读取失败：${s.meta.error}` : null,
            s.play && !s.play.ok ? `播放失败：${s.play.error}` : null,
          ]
            .filter(Boolean)
            .join('　·　');

      return `
        <div class="arow" data-state="${st}">
          <span class="arow__no">${s.no ?? '—'}</span>
          <span class="arow__name">${s.label}</span>
          <span class="arow__state">${stateText}</span>
          <span class="arow__meta">${meta}</span>
          <button type="button" class="arow__play" data-url="${s.url}" ${s.exists ? '' : 'disabled'}>单独播</button>
        </div>`;
    })
    .join('');
}

// ────────────────────────────────────────────────────────────
// 渲染：结论
// ────────────────────────────────────────────────────────────

function renderVerdict() {
  const items = [];
  const exist = state.sources.filter((s) => s.exists);
  const played = state.sources.filter((s) => s.play?.ok);
  const failed = state.sources.filter((s) => s.play && !s.play.ok);
  const caps = state.caps;
  const ap = state.autoplay;

  // 1) 编解码
  if (caps) items.push({ tone: caps.verdict.mp4 ? 'ok' : 'bad', text: caps.verdict.note });

  // 2) 素材
  items.push({
    tone: exist.length === state.sources.length ? 'ok' : 'warn',
    text: `素材到位 ${exist.length}/${state.sources.length} 段（6 段彩蛋视频由 Day2 交付；缺失时主页面自动走兜底素材）`,
  });

  // 3) 播放
  if (played.length > 0) {
    const avg = Math.round(played.reduce((s, x) => s + x.play.latency, 0) / played.length);
    items.push({ tone: 'ok', text: `真实素材播放：${played.length} 段成功，平均起播 ${avg}ms` });
  }
  if (failed.length > 0) {
    items.push({
      tone: 'bad',
      text: `有 ${failed.length} 段播放失败：${failed.map((f) => `${f.label}（${f.play.error}）`).join('；')}`,
    });
  }

  // 4) 自动播放
  if (ap) {
    items.push({
      tone: ap.mutedAutoplay ? 'ok' : 'warn',
      text: ap.mutedAutoplay
        ? '自动播放策略：静音可自动播 —— 彩蛋视频的兜底策略有效'
        : '自动播放策略：静音也被拒 —— 视频只能由用户点击触发（主页面本来就是点击触发，不受影响）',
    });
  } else {
    items.push({ tone: 'warn', text: '自动播放策略：尚未检测完成' });
  }

  // 5) 合成链路
  if (state.synth) {
    const s = state.synth;
    const detail = s.ok
      ? `${s.mimeType || '未知格式'}｜${formatSize(s.bytes)}｜回放 ${s.mode || '未回放'}`
      : s.error || '未知原因';
    items.push({ tone: s.ok ? 'ok' : 'warn', text: `合成回放：${detail}` });
  }

  // 总判定
  let overall = 'warn';
  let title = '';
  const canPlaySomething = played.length > 0 || state.synth?.ok === true;

  if (caps && !caps.verdict.mp4 && !canPlaySomething) {
    overall = 'fail';
    title = '视频播放链路不通，需要先排查';
  } else if (canPlaySomething) {
    overall = 'pass';
    title = exist.length
      ? `视频播放链路已打通（${played.length} 段真实素材验证通过）`
      : '视频播放链路已打通（暂无素材，用合成视频验证）';
    if (failed.length > 0) {
      overall = 'warn';
      title = '视频能播，但有素材读取/播放失败，需要检查路径或编码';
    }
  } else {
    overall = 'warn';
    title = '尚未完成播放验证';
  }

  verdictEl.dataset.state = overall;
  $('[data-verdict-badge]').textContent =
    overall === 'pass' ? 'PASS' : overall === 'fail' ? 'FAIL' : 'CHECK';
  $('[data-verdict-title]').textContent = title;
  $('[data-verdict-list]').innerHTML = items
    .map((i) => `<li data-tone="${i.tone}">${i.text}</li>`)
    .join('');

  state.report = buildReport(overall, title, items);
}

function buildReport(overall, title, items) {
  return {
    build: `${BUILD.name} ${BUILD.stage} v${BUILD.version}`,
    generatedAt: new Date().toISOString(),
    page: location.href,
    userAgent: navigator.userAgent,
    overall,
    title,
    findings: items,
    codecs: state.caps,
    autoplay: state.autoplay,
    synth: state.synth,
    sources: state.sources.map((s) => ({
      label: s.label,
      url: s.url,
      exists: s.exists,
      size: s.size,
      meta: s.meta,
      play: s.play,
    })),
  };
}

// ────────────────────────────────────────────────────────────
// 播放源下拉
// ────────────────────────────────────────────────────────────

function rebuildSelect() {
  const opts = [];
  for (const s of state.sources) {
    if (!s.exists) continue;
    opts.push({ url: s.url, label: `${s.no ?? '—'} ${s.label}` });
  }
  for (const e of state.extras) opts.push({ url: e.url, label: e.label });

  if (!opts.length) {
    srcSelect.innerHTML = '<option value="">（暂无可用视频源）</option>';
    return;
  }
  srcSelect.innerHTML = opts
    .map((o) => `<option value="${o.url}">${o.label}</option>`)
    .join('');
}

// ────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────

async function run() {
  $('[data-build]').textContent = `${BUILD.stage} v${BUILD.version}`;
  playOut.textContent = '准备中…';

  // ① 编码能力（同步，先出结果）
  state.caps = codecMatrix();
  renderCaps();

  // ② 素材自检 + 元数据
  const manifest = await preflight();
  state.sources = [
    ...EGGS.map((egg, i) => {
      const p = manifest.eggs[i].video;
      return {
        key: egg.id,
        no: egg.no,
        label: `${egg.place} · ${egg.title}`,
        url: p.url,
        exists: p.exists,
        size: p.size,
        type: p.type,
        meta: null,
        play: null,
      };
    }),
    {
      key: 'fallback',
      no: '·',
      label: '兜底测试片（CC0）',
      ...pickProbe(manifest, FALLBACK_VIDEO),
      meta: null,
      play: null,
    },
  ];
  renderAssets();
  rebuildSelect();
  renderVerdict();

  // 读元数据
  await Promise.all(
    state.sources
      .filter((s) => s.exists)
      .map(async (s) => {
        s.meta = await loadMeta(s.url);
        renderAssets();
      }),
  );

  // ③ 自动播放策略
  state.autoplay = await autoplayPolicy();
  renderAutoplay();
  renderVerdict();

  // ④ 逐个播放（静音，无需用户手势）
  await runSuite();

  // ⑤ 合成链路
  await runSynth({ autoplay: true });
}

function pickProbe(manifest, url) {
  const p = manifest.probes.get(url) ?? { url, exists: false, size: 0, type: '' };
  return { url: p.url, exists: p.exists, size: p.size, type: p.type };
}

async function runSuite() {
  const list = state.sources.filter((s) => s.exists);
  if (!list.length) {
    playOut.textContent =
      '仓库里还没有任何视频素材。\n' +
      '这不算失败 —— 请点「合成视频回放」验证播放链路，或把视频拖到下面第 6 块里试播。';
    return;
  }

  const muted = $('[data-muted]').checked;
  const lines = [`逐个播放测试（${muted ? '静音' : '带声音'}）—— 共 ${list.length} 段`, ''];
  playOut.textContent = lines.join('\n');

  for (const s of list) {
    playOut.textContent = lines.concat(`→ 正在播：${s.label}`).join('\n');
    s.play = await playOnce(player, s.url, { muted });
    lines.push(
      s.play.ok
        ? `✓ ${s.label}　起播 ${s.play.latency}ms　时长 ${s.play.duration}s　${s.play.width}×${s.play.height}`
        : `✗ ${s.label}　${s.play.error}`,
    );
    playOut.textContent = lines.join('\n');
    renderAssets();
    renderVerdict();
  }

  const okCount = list.filter((s) => s.play?.ok).length;
  lines.push('', `结果：${okCount}/${list.length} 段通过`);
  playOut.textContent = lines.join('\n');
}

async function runSynth({ autoplay = false } = {}) {
  synthOut.textContent = '正在用 canvas + MediaRecorder 录一段 3 秒测试片…';
  let r;
  try {
    r = await synthesizeClip({ durationMs: 3000 });
  } catch (err) {
    r = { ok: false, error: `合成过程抛异常：${err?.message || err}` };
  }
  if (!r || !r.ok) {
    state.synth = { ok: false, error: r?.error || '合成失败（未返回原因）' };
    synthOut.textContent = `✗ 合成失败：${state.synth.error}`;
    renderVerdict();
    return;
  }
  state.synth = { ok: false, mimeType: r.mimeType, bytes: r.bytes, mode: null };

  if (autoplay) {
    // 静音自动播，验证解码链路
    const res = await playOnce(player, r.blobUrl, { muted: true, playMs: 800 });
    state.synth.mode = res.ok ? `成功 ${res.latency}ms` : `失败：${res.error}`;
    state.synth.ok = res.ok;
    synthOut.textContent =
      `✓ 合成成功：${r.mimeType}　${formatSize(r.bytes)}\n` +
      (res.ok
        ? `✓ 回放成功：起播 ${res.latency}ms　${res.width}×${res.height}`
        : `✗ 回放失败：${res.error}`) +
      `\n（视频地址：${r.blobUrl}）`;
    // 顺带加进下拉框，方便手动再播
    state.extras.push({ url: r.blobUrl, label: `合成测试片 ${r.mimeType}` });
    rebuildSelect();
  } else {
    synthOut.textContent = `✓ 合成成功：${r.mimeType}　${formatSize(r.bytes)}\n视频地址：${r.blobUrl}`;
    state.extras.push({ url: r.blobUrl, label: `合成测试片 ${r.mimeType}` });
    rebuildSelect();
    state.synth.ok = true;
  }
  renderVerdict();
}

// ────────────────────────────────────────────────────────────
// 本地文件
// ────────────────────────────────────────────────────────────

function acceptFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  $('[data-drop-name]').textContent = `${file.name}　${formatSize(file.size)}　${file.type || '未知类型'}`;
  state.extras.push({ url, label: `本机文件：${file.name}` });
  rebuildSelect();
  srcSelect.value = url;
  player.muted = $('[data-muted]').checked;
  player.src = url;
  player.load();
  player
    .play()
    .then(() => {
      playOut.textContent = `✓ 本机文件可播放：${file.name}　${formatSize(file.size)}`;
    })
    .catch((err) => {
      playOut.textContent = `✗ 本机文件播放被拒：${err?.name || ''} ${err?.message || ''}\n（勾上「静音播放」再试）`;
    });
}

function wireUI() {
  document.addEventListener('click', async (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest('[data-act]') : null;
    const playBtn = ev.target instanceof Element ? ev.target.closest('.arow__play') : null;

    if (playBtn && !playBtn.disabled) {
      player.muted = $('[data-muted]').checked;
      player.src = playBtn.dataset.url;
      player.load();
      try {
        await player.play();
        playOut.textContent = `✓ 单独播放：${playBtn.dataset.url}`;
      } catch (err) {
        playOut.textContent = `✗ play() 被拒：${err?.message || err}`;
      }
      return;
    }

    if (!btn) return;
    const act = btn.getAttribute('data-act');

    if (act === 'rerun') {
      state.sources.forEach((s) => {
        s.meta = null;
        s.play = null;
      });
      state.synth = null;
      state.extras = [];
      synthOut.textContent = '未执行';
      await run();
    }
    if (act === 'play-selected') {
      const url = srcSelect.value;
      if (!url) return;
      player.muted = $('[data-muted]').checked;
      player.src = url;
      player.load();
      try {
        await player.play();
        playOut.textContent = `✓ 播放：${url}`;
      } catch (err) {
        playOut.textContent = `✗ play() 被拒：${err?.message || err}`;
      }
    }
    if (act === 'play-suite') await runSuite();
    if (act === 'synth') await runSynth({ autoplay: false });
    if (act === 'autoplay-retest') {
      state.autoplay = await autoplayPolicy();
      renderAutoplay();
      renderVerdict();
    }
    if (act === 'pick') $('[data-file]').click();
    if (act === 'export') exportReport();
  });

  $('[data-file]').addEventListener('change', (ev) => {
    acceptFile(ev.target.files?.[0]);
  });

  const drop = $('[data-drop]');
  ['dragenter', 'dragover'].forEach((t) =>
    drop.addEventListener(t, (ev) => {
      ev.preventDefault();
      drop.dataset.over = 'true';
    }),
  );
  ['dragleave', 'drop'].forEach((t) =>
    drop.addEventListener(t, () => {
      delete drop.dataset.over;
    }),
  );
  drop.addEventListener('drop', (ev) => {
    ev.preventDefault();
    acceptFile(ev.dataTransfer?.files?.[0]);
  });
}

function exportReport() {
  if (!state.report) {
    alert('报告还没生成完，稍等一下再导出。');
    return;
  }
  const text = JSON.stringify(state.report, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `video-test-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

wireUI();
run().catch((err) => {
  console.error('[videotest] 运行失败：', err);
  verdictEl.dataset.state = 'fail';
  $('[data-verdict-badge]').textContent = 'FAIL';
  $('[data-verdict-title]').textContent = `自检脚本出错：${err?.message || err}`;
});

// 控制台里也能拿到
Object.defineProperty(window, '__videotest', { get: () => state });
