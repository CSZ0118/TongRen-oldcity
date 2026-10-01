/**
 * 调试面板（?debug=1 或按 D 键切换）。
 *
 * Day1 的验收场景是"能不能打开、能不能滚、视频能不能播"，
 * 所以这个面板把这三件事的实时状态和素材到位情况都摊开显示，
 * 组里任何人打开页面按一下 D 就能自查，不用问前端。
 */
import { BUILD, EGGS } from './config.js';
import { formatSize } from './assets.js';
import { codecMatrix } from './video-probe.js';

export class DebugPanel {
  /**
   * @param {HTMLElement} host
   * @param {{
   *   scroll:any, stage:any, eggs:any, video:any,
   *   getManifest:()=>any, recheck:()=>Promise<void>,
   *   playTestVideo:()=>void, synthTest:()=>Promise<string>,
   *   resetProgress:()=>void,
   * }} ctx
   */
  constructor(host, ctx) {
    this.host = host;
    this.ctx = ctx;
    this.open = false;
    this.frame = 0;
    this.fps = 0;
    this.dtAcc = 0;
    this.dtCount = 0;
    this.caps = codecMatrix();
    this.message = '';

    host.innerHTML = `
      <div class="dbg__head">
        <strong>调试面板</strong>
        <span class="dbg__build">${BUILD.stage} · v${BUILD.version}</span>
        <button type="button" class="dbg__x" data-dbg="close" aria-label="关闭">✕</button>
      </div>
      <pre class="dbg__live" data-dbg-live>…</pre>
      <div class="dbg__row">
        <button type="button" data-dbg="recheck">重新自检素材</button>
        <button type="button" data-dbg="play">播测试视频</button>
        <button type="button" data-dbg="synth">合成测试视频</button>
        <button type="button" data-dbg="reset">清空进度</button>
      </div>
      <div class="dbg__msg" data-dbg-msg></div>
      <details class="dbg__fold">
        <summary>素材清单</summary>
        <div data-dbg-assets class="dbg__assets"></div>
      </details>
      <details class="dbg__fold">
        <summary>浏览器视频能力</summary>
        <div data-dbg-caps class="dbg__caps"></div>
      </details>
    `;

    this.liveEl = host.querySelector('[data-dbg-live]');
    this.assetsEl = host.querySelector('[data-dbg-assets]');
    this.capsEl = host.querySelector('[data-dbg-caps]');
    this.msgEl = host.querySelector('[data-dbg-msg]');

    host.addEventListener('click', async (ev) => {
      const btn = ev.target instanceof Element ? ev.target.closest('[data-dbg]') : null;
      if (!btn) return;
      const act = btn.getAttribute('data-dbg');
      if (act === 'close') this.hide();
      if (act === 'recheck') {
        this.say('正在重新自检素材…');
        await this.ctx.recheck();
        this.renderAssets();
        this.say('自检完成');
      }
      if (act === 'play') this.ctx.playTestVideo();
      if (act === 'synth') {
        this.say('正在用 canvas + MediaRecorder 合成一段视频…');
        const r = await this.ctx.synthTest();
        this.say(r);
      }
      if (act === 'reset') {
        this.ctx.resetProgress();
        this.say('进度已清空');
      }
    });

    this.renderCaps();
    this.renderAssets();
  }

  toggle() {
    this.open ? this.hide() : this.show();
  }

  show() {
    this.open = true;
    this.host.hidden = false;
    this.renderAssets();
  }

  hide() {
    this.open = false;
    this.host.hidden = true;
  }

  say(text) {
    this.message = text;
    if (this.msgEl) this.msgEl.textContent = text;
  }

  /** 每帧喂 dt，内部自己算 FPS */
  sample(dt) {
    this.dtAcc += dt;
    this.dtCount += 1;
    if (this.dtAcc >= 0.5) {
      this.fps = Math.round(this.dtCount / this.dtAcc);
      this.dtAcc = 0;
      this.dtCount = 0;
    }
  }

  renderLive() {
    if (!this.open) return;
    this.frame += 1;
    if (this.frame % 15 !== 0) return;

    const { scroll, stage, eggs } = this.ctx;
    const s = scroll?.state();
    const pct = s ? (s.progress * 100).toFixed(1) : '—';
    const three = stage?.info ?? { ready: false, revision: null, buildings: 0, renderer: '' };
    const dpr = (window.devicePixelRatio || 1).toFixed(2);

    this.liveEl.textContent = [
      `FPS         ${String(this.fps).padStart(3)}        DPR ${dpr}`,
      `长卷尺寸    ${s ? `${Math.round(s.width)} × ${Math.round(s.height)} px` : '—'}`,
      `滚动位置    ${pct}%  (x=${s ? Math.round(s.x) : 0} / max=${s ? Math.round(s.max) : 0})`,
      `拖拽中      ${s?.dragging ? '是' : '否'}`,
      `彩蛋进度    ${eggs?.count ?? 0} / ${eggs?.total ?? EGGS.length}    全部点亮 ${eggs?.complete ? '是' : '否'}`,
      `Three.js    ${three.ready ? `r${three.revision}` : '未就绪'}    建筑 ${three.buildings} 座`,
      `GPU         ${three.renderer || '—'}`,
      three.sources?.length ? `建筑来源    ${three.sources.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  renderAssets() {
    const manifest = this.ctx.getManifest();
    if (!manifest) {
      this.assetsEl.textContent = '自检尚未完成…';
      return;
    }
    const { summary, eggs } = manifest;
    const rows = [];

    const dot = (ok) => (ok ? '<i class="ok">●</i>' : '<i class="no">○</i>');
    const short = (url) => url.replace(/^assets\//, '');

    rows.push(
      `<div class="dbg__sum">素材 ${summary.found}/${summary.total} 到位　` +
        `彩蛋视频 ${summary.eggVideosReady}/6　GLB ${summary.modelsReady}/6　音效 ${summary.audiosReady}/6　` +
        `兜底视频 ${summary.fallbackVideoReady ? '有' : '无'}</div>`,
    );

    rows.push('<table class="dbg__table"><thead><tr><th>彩蛋</th><th>视频</th><th>模型</th><th>音效</th></tr></thead><tbody>');
    for (const e of eggs) {
      rows.push(
        `<tr><td>${e.egg.no}. ${e.egg.place}</td>` +
          `<td>${dot(e.video.exists)} ${e.video.exists ? formatSize(e.video.size) : '缺'}</td>` +
          `<td>${dot(e.model.exists)} ${e.model.exists ? formatSize(e.model.size) : '缺'}</td>` +
          `<td>${dot(e.audio.exists)} ${e.audio.exists ? formatSize(e.audio.size) : '缺'}</td></tr>`,
      );
    }
    rows.push('</tbody></table>');

    const missing = manifest.all.filter((p) => !p.exists).map((p) => short(p.url));
    if (missing.length) {
      rows.push(`<div class="dbg__missing">缺失：${missing.join('、')}</div>`);
    }
    this.assetsEl.innerHTML = rows.join('');
  }

  renderCaps() {
    const { video, audio, verdict } = this.caps;
    const line = (list) =>
      list
        .map((c) => {
          const tone = c.support === 'no' ? 'no' : c.support === 'maybe' ? 'warn' : 'ok';
          const label = c.support === 'no' ? '不支持' : c.support === 'maybe' ? '可能' : '支持';
          return `<span class="cap cap--${tone}">${c.label}<em>${label}</em></span>`;
        })
        .join('');
    this.capsEl.innerHTML =
      `<p class="dbg__verdict ${verdict.mp4 ? 'ok' : 'no'}">${verdict.note}</p>` +
      `<h4>视频编码</h4><div class="caps">${line(video)}</div>` +
      `<h4>音频编码</h4><div class="caps">${line(audio)}</div>`;
  }
}
