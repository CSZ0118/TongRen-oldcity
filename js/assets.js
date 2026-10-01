/**
 * 素材自检（preflight）。
 *
 * Day1 的现实情况：壁画、6 段视频、6 个 GLB、音效都还没做出来。
 * 如果前端傻等素材，Day1 就没法验收。
 * 所以这里在开场时把所有该有的素材统一探一遍，把「有 / 没有」记成一张清单，
 * 后面彩蛋点击时就能：
 *   - 有素材 → 用真素材
 *   - 没素材 → 走占位/兜底，并在页面上明确标注「【占位】」
 * 这样 Day2 素材一放进来，代码一行都不用改，自动切到真素材。
 */
import { EGGS, FALLBACK_VIDEO } from './config.js';

/** @typedef {{url:string, exists:boolean, status:number, size:number, type:string, error?:string}} Probe */

/** @type {Map<string, Promise<Probe>>} */
const cache = new Map();

/**
 * 探测一个素材是否存在。
 * 先 HEAD；HEAD 不被支持时退回 GET + Range: bytes=0-0（只拉 1 字节，不浪费流量）。
 * @param {string} url
 * @returns {Promise<Probe>}
 */
export function probe(url) {
  if (cache.has(url)) return cache.get(url);

  const task = (async () => {
    const miss = (status, error) => ({
      url,
      exists: false,
      status,
      size: 0,
      type: '',
      ...(error ? { error } : {}),
    });

    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) {
        return {
          url,
          exists: true,
          status: res.status,
          size: Number(res.headers.get('content-length') || 0),
          type: res.headers.get('content-type') || '',
        };
      }
      // 405/501 = 服务器不认 HEAD，换个方式再试；其余 4xx/5xx 直接判定不存在
      if (res.status !== 405 && res.status !== 501) return miss(res.status);
    } catch {
      /* 网络异常 → 下面用 Range 再试一次 */
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        cache: 'no-store',
      });
      if (!res.ok && res.status !== 206) return miss(res.status);
      const cr = res.headers.get('content-range'); // bytes 0-0/123456
      const total = cr ? Number(cr.split('/')[1]) : 0;
      return {
        url,
        exists: true,
        status: res.status,
        size: Number.isFinite(total) && total > 0 ? total : 1,
        type: res.headers.get('content-type') || '',
      };
    } catch (err) {
      return miss(0, err instanceof Error ? err.message : String(err));
    }
  })();

  cache.set(url, task);
  return task;
}

/**
 * 开场统一自检。
 * @param {{onProgress?:(done:number,total:number)=>void}} [opts]
 */
export async function preflight({ onProgress } = {}) {
  /** @type {string[]} */
  const urls = [FALLBACK_VIDEO];
  for (const egg of EGGS) urls.push(egg.video, egg.model, egg.audio);

  const unique = [...new Set(urls)];
  const probes = new Map();
  let done = 0;
  onProgress?.(0, unique.length);

  await Promise.all(
    unique.map(async (url) => {
      probes.set(url, await probe(url));
      done += 1;
      onProgress?.(done, unique.length);
    }),
  );

  const pick = (url) => probes.get(url) ?? { url, exists: false, status: 0, size: 0, type: '' };

  const eggs = EGGS.map((egg) => ({
    egg,
    model: pick(egg.model),
    video: pick(egg.video),
    audio: pick(egg.audio),
  }));

  const fallback = pick(FALLBACK_VIDEO);
  const flat = [...probes.values()];
  const summary = {
    total: flat.length,
    found: flat.filter((p) => p.exists).length,
    missing: flat.filter((p) => !p.exists).length,
    /** 6 段彩蛋视频里有几个已经到位 */
    eggVideosReady: eggs.filter((e) => e.video.exists).length,
    /** 6 个建筑 GLB 里有几个已经到位 */
    modelsReady: eggs.filter((e) => e.model.exists).length,
    /** 6 个音效里有几个已经到位 */
    audiosReady: eggs.filter((e) => e.audio.exists).length,
    fallbackVideoReady: fallback.exists,
  };

  return { probes, eggs, fallback, summary, all: flat };
}

/**
 * 给某个彩蛋挑一段「现在就能播」的视频。
 * @param {{video:Probe}} entry preflight() 返回的 eggs[i]
 * @param {Probe} fallback
 * @returns {{src:string, real:boolean, video:Probe|null}}
 */
export function resolveVideo(entry, fallback) {
  if (entry?.video?.exists) return { src: entry.video.url, real: true, video: entry.video };
  if (fallback?.exists) return { src: fallback.url, real: false, video: fallback };
  return { src: '', real: false, video: null };
}

/** 人类可读的体积 */
export function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
