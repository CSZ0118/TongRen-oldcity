/**
 * 音频总线。
 *
 * Day1 没有音效素材，但「点彩蛋要有声音反馈」这件事必须现在就验证掉，
 * 否则等到 Day2 拿到 mp3 才发现浏览器自动播放策略把声音拦了，就来不及了。
 * 所以这里两条路：
 *   1. 素材存在  → 播 mp3
 *   2. 素材不存在 → 用 WebAudio 现场合成一声钟磬（不依赖任何文件）
 *
 * 这样「用户手势解锁音频」这条链路 Day1 就是通的。
 */
import { probe } from './assets.js';

export class AudioBus {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.enabled = true;
    /** 正在播的 <audio>，同一时刻只留一个 */
    this.current = null;
    /** 最近一次播放的结果，调试面板会显示 */
    this.lastResult = null;
  }

  /** 必须在用户手势里调用，否则浏览器会把 AudioContext 挂起 */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
  }

  stop() {
    if (this.current) {
      try {
        this.current.pause();
      } catch {
        /* ignore */
      }
      this.current = null;
    }
  }

  /**
   * 播一个彩蛋的音效：有文件用文件，没有就合成。
   * @param {{audio:string}} egg
   * @param {{baseHz?:number}} [opts]
   */
  async playEgg(egg, { baseHz = 523.25 } = {}) {
    if (!this.enabled) return { mode: 'muted' };
    const info = await probe(egg.audio);
    if (info.exists) {
      const result = await this.playFile(egg.audio);
      if (result.mode === 'file') return result;
    }
    this.chime(baseHz);
    return { mode: 'synth', reason: info.exists ? 'file-blocked' : 'no-asset' };
  }

  /** @param {string} url */
  playFile(url) {
    this.stop();
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.volume = 0.85;
      this.current = audio;
      audio.addEventListener('ended', () => {
        if (this.current === audio) this.current = null;
      });
      const p = audio.play();
      if (!p || typeof p.then !== 'function') {
        resolve({ mode: 'file' });
        return;
      }
      p.then(() => resolve({ mode: 'file' })).catch((err) =>
        resolve({ mode: 'blocked', error: err?.message || String(err) }),
      );
    });
  }

  /**
   * 合成一声钟磬：基频 + 五度 + 八度，指数衰减包络。
   * @param {number} baseHz
   * @param {{duration?:number, gain?:number}} [opts]
   */
  chime(baseHz = 523.25, { duration = 2.2, gain = 0.22 } = {}) {
    const ctx = this.unlock();
    if (!ctx) return false;
    if (!this.enabled) return false;

    const t0 = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    // 起音很快，尾巴很长 —— 像敲了一下铜磬
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    // 泛音列：(倍率, 相对音量, 稍微失谐)
    const partials = [
      [1, 1.0, 0],
      [2.0, 0.42, +2.5],
      [2.997, 0.24, -3.5],
      [4.02, 0.13, +5],
      [5.4, 0.07, -6],
    ];
    for (const [mult, amp, detune] of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = baseHz * mult;
      osc.detune.value = detune;
      g.gain.value = amp;
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    }
    return true;
  }

  /** 六个彩蛋全点亮时的收尾和弦（大调加九音，明亮开阔） */
  finale() {
    if (!this.enabled) return false;
    const ctx = this.unlock();
    if (!ctx) return false;
    const root = 261.63; // C4
    const chord = [1, 1.25, 1.5, 2, 2.25, 3]; // C E G C D G
    chord.forEach((mult, i) => {
      window.setTimeout(() => this.chime(root * mult, { duration: 3.4, gain: 0.16 }), i * 110);
    });
    return true;
  }
}
