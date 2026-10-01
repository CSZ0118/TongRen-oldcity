/**
 * 浏览器视频能力探测 —— 通用工具，被「调试面板」和「video-test.html」共用。
 *
 * 这些都是纯函数 / 无副作用的探测，不依赖本项目的任何素材，
 * 所以即使仓库里一个视频都没有，也能跑出结论。
 */

/** 常见视频编码。/ MP4 (H.264) 是所有浏览器 + 剪映导出的事实标准，优先用它 */
const VIDEO_CODECS = [
  { label: 'MP4 / H.264 Baseline', mime: 'video/mp4; codecs="avc1.42E01E"', tier: 'essential' },
  { label: 'MP4 / H.264 High', mime: 'video/mp4; codecs="avc1.640028"', tier: 'essential' },
  { label: 'MP4 / H.265 HEVC', mime: 'video/mp4; codecs="hvc1.1.6.L93.B0"', tier: 'optional' },
  { label: 'WebM / VP8', mime: 'video/webm; codecs="vp8"', tier: 'optional' },
  { label: 'WebM / VP9', mime: 'video/webm; codecs="vp09.00.10.08"', tier: 'optional' },
  { label: 'WebM / AV1', mime: 'video/webm; codecs="av01.0.04M.08"', tier: 'optional' },
  { label: 'Ogg / Theora', mime: 'video/ogg; codecs="theora"', tier: 'legacy' },
];

/** 常见音频编码 */
const AUDIO_CODECS = [
  { label: 'AAC (MP4)', mime: 'audio/mp4; codecs="mp4a.40.2"', tier: 'essential' },
  { label: 'MP3', mime: 'audio/mpeg', tier: 'essential' },
  { label: 'Opus (WebM)', mime: 'audio/webm; codecs="opus"', tier: 'optional' },
  { label: 'Vorbis (Ogg)', mime: 'audio/ogg; codecs="vorbis"', tier: 'optional' },
  { label: 'FLAC', mime: 'audio/flac', tier: 'legacy' },
];

/** 容器格式 */
const CONTAINERS = [
  { label: '.mp4', mime: 'video/mp4', tier: 'essential' },
  { label: '.webm', mime: 'video/webm', tier: 'optional' },
  { label: '.ogg / .ogv', mime: 'video/ogg', tier: 'legacy' },
];

/** @param {HTMLMediaElement} el */
function support(el, mime) {
  try {
    const raw = el.canPlayType(mime);
    return raw === 'probably' ? 'probably' : raw === 'maybe' ? 'maybe' : 'no';
  } catch {
    return 'no';
  }
}

/**
 * 探测本机浏览器支持哪些视频/音频编码。
 * @returns {{containers:Array, video:Array, audio:Array, mse:Array|null, verdict:{mp4:boolean, webm:boolean, note:string}}}
 */
export function codecMatrix() {
  const v = document.createElement('video');
  const a = document.createElement('audio');

  const video = VIDEO_CODECS.map((c) => ({ ...c, support: support(v, c.mime) }));
  const audio = AUDIO_CODECS.map((c) => ({ ...c, support: support(a, c.mime) }));
  const containers = CONTAINERS.map((c) => ({ ...c, support: support(v, c.mime) }));

  /** @type {Array|null} */
  let mse = null;
  if ('MediaSource' in window) {
    mse = [...VIDEO_CODECS, ...AUDIO_CODECS].map((c) => {
      let ok = false;
      try {
        ok = window.MediaSource.isTypeSupported(c.mime);
      } catch {
        ok = false;
      }
      return { ...c, support: ok ? 'yes' : 'no' };
    });
  }

  const h264 = video.find((c) => c.label.includes('H.264 High'));
  const vp9 = video.find((c) => c.label.includes('VP9'));
  const mp4Ok = h264?.support !== 'no';
  const webmOk = vp9?.support !== 'no';

  return {
    containers,
    video,
    audio,
    mse,
    verdict: {
      mp4: mp4Ok,
      webm: webmOk,
      note: mp4Ok
        ? 'MP4 / H.264 可用 —— 剪映直接导出 MP4 即可，这是最稳的选择。'
        : '⚠️ 本机浏览器不支持 MP4 / H.264！请检查浏览器版本，或改用 WebM 导出。',
    },
  };
}

/**
 * 测试自动播放策略：静音能不能自动播、带声音能不能自动播。
 * 用一段极小的静默 WebAudio 生成的音频 + 空白视频来测，不用任何素材文件。
 * @returns {Promise<{mutedAutoplay:boolean, unmutedAutoplay:boolean, userActivation:boolean, note:string}>}
 */
export async function autoplayPolicy() {
  const probeEl = document.createElement('video');
  probeEl.muted = true;
  probeEl.playsInline = true;
  probeEl.setAttribute('playsinline', '');
  probeEl.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px;opacity:0';

  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d');
  ctx?.fillRect(0, 0, 2, 2);

  let mutedAutoplay = false;
  let unmutedAutoplay = false;
  let note = '';

  const stream = typeof canvas.captureStream === 'function' ? canvas.captureStream(1) : null;
  if (!stream) {
    return {
      mutedAutoplay: false,
      unmutedAutoplay: false,
      userActivation: Boolean(navigator.userActivation?.isActive),
      note: '本浏览器不支持 canvas.captureStream，无法自动探测；请用页面上的交互测试。',
    };
  }

  try {
    probeEl.srcObject = stream;
    await probeEl.play();
    mutedAutoplay = true;
    probeEl.pause();

    probeEl.muted = false;
    probeEl.currentTime = 0;
    await probeEl.play();
    unmutedAutoplay = true;
    probeEl.pause();
  } catch (err) {
    note = err?.message || String(err);
  } finally {
    probeEl.srcObject = null;
    stream.getTracks().forEach((t) => t.stop());
    probeEl.remove();
  }

  const userActivation = Boolean(navigator.userActivation?.isActive);
  return {
    mutedAutoplay,
    unmutedAutoplay,
    userActivation,
    note:
      note ||
      (mutedAutoplay
        ? '静音自动播放可用 —— 视频层的兜底策略有效。'
        : '⚠️ 连静音自动播放都被拒，视频必须由用户点击触发。'),
  };
}

/**
 * 读一段视频的元数据（不播放）。
 * @param {string} src
 * @param {{timeout?:number}} [opts]
 * @returns {Promise<{url:string, ok:boolean, duration:number, width:number, height:number, type:string, error:string|null, ms:number}>}
 */
export function loadMeta(src, { timeout = 8000 } = {}) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    let settled = false;

    const finish = (ok, error = null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve({
        url: src,
        ok,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
        width: v.videoWidth,
        height: v.videoHeight,
        type: v.currentSrc.split('.').pop() || '',
        error,
        ms: Math.round(performance.now() - t0),
      });
      v.removeAttribute('src');
      v.load();
    };

    const timer = window.setTimeout(() => finish(false, `超时 ${timeout}ms 未拿到 metadata`), timeout);

    v.addEventListener('loadedmetadata', () => finish(true));
    v.addEventListener('error', () => {
      const e = v.error;
      const map = {
        1: 'MEDIA_ERR_ABORTED 用户/脚本中止',
        2: 'MEDIA_ERR_NETWORK 网络错误（文件是否存在？路径对不对？）',
        3: 'MEDIA_ERR_DECODE 解码失败（编码浏览器不支持，或文件损坏）',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED 格式/编码不支持，或 404',
      };
      finish(false, e ? `${map[e.code] || 'UNKNOWN'}` : '资源加载失败（可能是 404）');
    });
    v.src = src;
  });
}

/**
 * 用 canvas + MediaRecorder 现场合成一段视频并播回来。
 * 完全不需要任何素材文件 —— 用来验证「编码 → 解码 → 播放」整条链路是否健康。
 * @param {{durationMs?:number, mimeType?:string, fps?:number}} [opts]
 * @returns {Promise<{ok:boolean, blobUrl:string|null, bytes:number, mimeType:string, error:string|null}>}
 */
export async function synthesizeClip({ durationMs = 3000, mimeType = '', fps = 30 } = {}) {
  if (typeof MediaRecorder === 'undefined') {
    return { ok: false, blobUrl: null, bytes: 0, mimeType: '', error: '本浏览器不支持 MediaRecorder' };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    return { ok: false, blobUrl: null, bytes: 0, mimeType: '', error: '本浏览器不支持 canvas.captureStream' };
  }

  const candidates = [
    mimeType,
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ].filter(Boolean);
  const supported = candidates.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
  if (!supported) {
    return { ok: false, blobUrl: null, bytes: 0, mimeType: '', error: '没有 MediaRecorder 支持的容器格式' };
  }

  const stream = canvas.captureStream(fps);
  /** @type {Blob[]} */
  const chunks = [];
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: supported, videoBitsPerSecond: 2_000_000 });
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    return { ok: false, blobUrl: null, bytes: 0, mimeType: supported, error: err?.message || String(err) };
  }

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const done = new Promise((resolve) => {
    recorder.onstop = () => resolve();
  });

  const t0 = performance.now();
  recorder.start();

  await new Promise((resolve) => {
    const draw = () => {
      const t = performance.now() - t0;
      if (t >= durationMs) return resolve();
      const p = t / durationMs;
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, `hsl(${(p * 360) % 360} 55% 22%)`);
      g.addColorStop(1, `hsl(${(p * 360 + 60) % 360} 60% 45%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#f6efe2';
      ctx.font = '600 34px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('视频链路自检', canvas.width / 2, canvas.height / 2 - 10);

      ctx.font = '20px ui-monospace,Consolas,monospace';
      ctx.fillStyle = '#e8c98a';
      ctx.fillText(`${(t / 1000).toFixed(1)}s / ${(durationMs / 1000).toFixed(1)}s`, canvas.width / 2, canvas.height / 2 + 34);

      const bw = Math.round((canvas.width - 80) * p);
      ctx.fillStyle = '#0d1b1e';
      ctx.fillRect(40, canvas.height - 46, canvas.width - 80, 8);
      ctx.fillStyle = '#7fd1c1';
      ctx.fillRect(40, canvas.height - 46, bw, 8);

      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });

  recorder.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());

  const blob = new Blob(chunks, { type: supported });
  if (blob.size === 0) {
    return { ok: false, blobUrl: null, bytes: 0, mimeType: supported, error: '录制结果为空' };
  }
  return { ok: true, blobUrl: URL.createObjectURL(blob), bytes: blob.size, mimeType: supported, error: null };
}
