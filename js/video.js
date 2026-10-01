/**
 * 彩蛋视频播放层。
 *
 * 这里踩的是浏览器自动播放策略的坑，所以有几条硬规矩：
 *   1. show() 必须是**同步**调用（直接写在 click 处理函数里，前面不能有 await），
 *      否则用户手势就失效了，play() 会被浏览器拒绝。
 *   2. <video> 元素在页面加载时就创建好，绝不在点击瞬间才 new，
 *      新建元素 + 立刻 play 在部分浏览器上会被判为「非用户触发」。
 *   3. 先试带声音播放；被拒 → 退回静音重播，保证画面一定出得来。
 */
import { COPY } from './config.js';

export class VideoLayer {
  /** @param {HTMLElement} host */
  constructor(host) {
    this.el = document.createElement('div');
    this.el.className = 'vlayer';
    this.el.hidden = true;
    this.el.innerHTML = `
      <video class="vlayer__video" playsinline webkit-playsinline preload="auto" muted></video>
      <div class="vlayer__bar">
        <span class="vlayer__label"></span>
        <span class="vlayer__badge" hidden></span>
        <span class="vlayer__spacer"></span>
        <button type="button" class="vbtn" data-act="mute" aria-label="开关声音">🔇 静音</button>
        <button type="button" class="vbtn" data-act="replay" aria-label="重播">↻ 重播</button>
        <button type="button" class="vbtn vbtn--ghost" data-act="close">跳过</button>
      </div>
      <button type="button" class="vlayer__scrim" data-act="close" aria-label="关闭视频"></button>
    `;
    host.appendChild(this.el);

    /** @type {HTMLVideoElement} */
    this.video = this.el.querySelector('video');
    this.labelEl = this.el.querySelector('.vlayer__label');
    this.badgeEl = this.el.querySelector('.vlayer__badge');
    this.muteBtn = this.el.querySelector('[data-act="mute"]');

    /** @type {string} */
    this.src = '';
    /** @type {{playing:number|null, firstFrame:number|null, startedAt:number, mutedFallback:boolean, error:string|null}} */
    this.stats = this.newStats();
    /** 每次播放结束（自然结束或手动关闭）都会回调，供自检面板统计 */
    this.onSettled = null;

    this.el.addEventListener('click', (ev) => {
      const btn = ev.target instanceof Element ? ev.target.closest('[data-act]') : null;
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'close') this.hide('user');
      if (act === 'replay') this.replay();
      if (act === 'mute') this.toggleMute();
    });

    this.video.addEventListener('playing', () => {
      if (this.stats.playing === null) {
        this.stats.playing = performance.now() - this.stats.startedAt;
      }
    });
    this.video.addEventListener('error', () => {
      const code = this.video.error?.code;
      this.stats.error = `MediaError code=${code ?? '?'} ${this.video.error?.message || ''}`.trim();
      this.badgeEl.hidden = false;
      this.badgeEl.textContent = '播放失败';
      this.badgeEl.dataset.tone = 'bad';
    });
    this.video.addEventListener('ended', () => this.hide('ended'));
  }

  newStats() {
    return { playing: null, firstFrame: null, startedAt: 0, mutedFallback: false, error: null };
  }

  /**
   * 播放一段视频。**必须同步调用**。
   * @param {string} src
   * @param {{label?:string, badge?:string, tone?:'ok'|'warn'}} [opts]
   * @returns {Promise<'playing'|'muted'|'blocked'|'no-src'>}
   */
  show(src, { label = '', badge = '', tone = 'warn' } = {}) {
    if (!src) return Promise.resolve('no-src');

    this.stats = this.newStats();
    this.stats.startedAt = performance.now();
    this.el.hidden = false;
    this.labelEl.textContent = label;
    this.badgeEl.hidden = !badge;
    this.badgeEl.textContent = badge;
    this.badgeEl.dataset.tone = tone;
    this.el.dataset.state = 'open';

    const v = this.video;
    if (this.src !== src) {
      this.src = src;
      v.src = src;
      v.load();
    } else {
      try {
        v.currentTime = 0;
      } catch {
        /* 元数据还没到时 currentTime 赋值会失败，忽略即可 */
      }
    }

    // 第一帧到屏幕的耗时（支持的浏览器才有）
    if (typeof v.requestVideoFrameCallback === 'function') {
      v.requestVideoFrameCallback(() => {
        if (this.stats.firstFrame === null) {
          this.stats.firstFrame = performance.now() - this.stats.startedAt;
        }
      });
    }

    v.muted = false;
    this.syncMuteBtn();

    const attempt = v.play();
    if (!attempt || typeof attempt.then !== 'function') return Promise.resolve('playing');

    return attempt.then(
      () => 'playing',
      () => {
        // 带声音被拒 → 静音重播，画面必须出来
        this.stats.mutedFallback = true;
        v.muted = true;
        this.syncMuteBtn();
        return v.play().then(
          () => 'muted',
          (err) => {
            this.stats.error = err?.message || String(err);
            return 'blocked';
          },
        );
      },
    );
  }

  replay() {
    if (!this.src) return;
    const startedAt = performance.now();
    this.video.currentTime = 0;
    this.video.play().catch(() => {});
    this.stats.startedAt = startedAt;
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.syncMuteBtn();
  }

  syncMuteBtn() {
    if (!this.muteBtn) return;
    this.muteBtn.textContent = this.video.muted ? '🔇 静音' : '🔊 有声';
    this.muteBtn.dataset.on = String(!this.video.muted);
  }

  /** @param {'user'|'ended'|'reset'} reason */
  hide(reason = 'user') {
    if (this.el.hidden) return;
    this.video.pause();
    this.el.hidden = true;
    this.el.dataset.state = 'closed';
    this.onSettled?.({ src: this.src, reason, ...this.stats });
  }

  /** 外部（比如开场）想强制关掉时用 */
  reset() {
    this.video.pause();
    try {
      this.video.removeAttribute('src');
      this.video.load();
    } catch {
      /* ignore */
    }
    this.src = '';
    this.hide('reset');
  }
}

/** 无障碍：Esc 跳过当前视频 */
export function bindVideoEscape(layer) {
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') layer.hide('user');
  });
}

export { COPY };
