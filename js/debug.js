/**
 * 调试面板（?debug=1 或按 D 键切换）。
 *
 * 现在验收的是「能不能打开、能不能滚、点彩蛋建筑能不能长出来」，
 * 所以把长卷滚动、彩蛋进度、2D 舞台、音效到位情况摊开显示，
 * 组里任何人打开页面按一下 D 就能自查，不用问前端。
 */
import { BUILD, EGGS } from './config.js';
import { formatSize } from './assets.js';

export class DebugPanel {
  /**
   * @param {HTMLElement} host
   * @param {{
   *   scroll:any, stage:any, eggs:any,
   *   getManifest:()=>any, recheck:()=>Promise<void>,
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
        <button type="button" data-dbg="reset">清空进度</button>
      </div>
      <div class="dbg__msg" data-dbg-msg></div>
      <details class="dbg__fold">
        <summary>素材清单（音效）</summary>
        <div data-dbg-assets class="dbg__assets"></div>
      </details>
    `;

    this.liveEl = host.querySelector('[data-dbg-live]');
    this.assetsEl = host.querySelector('[data-dbg-assets]');
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
      if (act === 'reset') {
        this.ctx.resetProgress();
        this.say('进度已清空');
      }
    });

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
    const stage2d = stage?.info ?? { ready: false, buildings: 0 };
    const dpr = (window.devicePixelRatio || 1).toFixed(2);

    this.liveEl.textContent = [
      `FPS         ${String(this.fps).padStart(3)}        DPR ${dpr}`,
      `长卷尺寸    ${s ? `${Math.round(s.width)} × ${Math.round(s.height)} px` : '—'}`,
      `滚动位置    ${pct}%  (x=${s ? Math.round(s.x) : 0} / max=${s ? Math.round(s.max) : 0})`,
      `拖拽中      ${s?.dragging ? '是' : '否'}`,
      `彩蛋进度    ${eggs?.count ?? 0} / ${eggs?.total ?? EGGS.length}    全部点亮 ${eggs?.complete ? '是' : '否'}`,
      `2D 舞台     ${stage2d.ready ? '就绪' : '未就绪'}    建筑 ${stage2d.buildings} 座`,
      stage2d.sources?.length ? `建筑来源    ${stage2d.sources.join(', ')}` : null,
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
      `<div class="dbg__sum">音效 ${summary.audiosReady}/6 到位（缺失时点彩蛋会自动走 WebAudio 合成）</div>`,
    );

    rows.push('<table class="dbg__table"><thead><tr><th>彩蛋</th><th>音效</th></tr></thead><tbody>');
    for (const e of eggs) {
      rows.push(
        `<tr><td>${e.egg.no}. ${e.egg.place}</td>` +
          `<td>${dot(e.audio.exists)} ${e.audio.exists ? formatSize(e.audio.size) : '缺（合成兜底）'}</td></tr>`,
      );
    }
    rows.push('</tbody></table>');

    const missing = manifest.all.filter((p) => !p.exists).map((p) => short(p.url));
    if (missing.length) {
      rows.push(`<div class="dbg__missing">缺失：${missing.join('、')}</div>`);
    }
    this.assetsEl.innerHTML = rows.join('');
  }
}
