/**
 * Stage2D —— 纯 2D 特效舞台（替代 stage3d.js）
 *
 * 建筑不再用 Three.js，而是 SVG 线稿 + CSS 伪 3D + Canvas 粒子：
 *  1. SVG 描边（stroke-dashoffset）—— 建筑从壁画里"画出来"
 *  2. CSS rotateX 84° → 0° —— "躺着"变"立起来"的 2D 转 3D 错觉
 *  3. 发光 breathe + 地面阴影收缩
 *  4. Canvas 粒子从建筑位置爆发
 *
 * 关键取舍：建筑直接放进 .scroll__track 里（和彩蛋同一套 --x/--y 百分比定位），
 * 随长卷一起滚动，不需要每帧换算屏幕坐标。粒子画布是独立的全屏层。
 *
 * 对外接口尽量对齐 Stage3D，让 main.js 里的调用保持直觉：
 *   init / resize / grow / rebuildFound / setFinale / reset / buildings / ready / info
 */

import { STAGE2D } from './config.js';

/** 6 座天宫的 SVG 线稿（stroke-only，viewBox 0 0 220 200）。占位级，经B 可用真线稿替换 */
const SHAPES = {
  // 南天门式城楼
  gateTower: [
    'M28 178 L192 178 L186 190 L34 190 Z',
    'M40 116 L40 178 M180 116 L180 178',
    'M84 178 L84 150 Q100 130 116 150 L116 178',
    'M100 60 L62 96 Q58 100 62 102 L138 102 Q142 100 138 96 Z',
    'M100 60 L100 102',
    'M100 50 L100 60 M95 54 Q100 47 105 54',
    'M100 102 L36 134 Q32 138 36 140 L164 140 Q168 138 164 134 Z',
    'M48 116 L172 116',
  ],
  // 天宫鼓楼（多层密檐往上收）
  drumTower: [
    'M46 186 L174 186 L168 196 L52 196 Z',
    'M100 34 L74 56 Q70 60 74 62 L126 62 Q130 60 126 56 Z',
    'M100 58 L60 84 Q56 88 60 90 L140 90 Q144 88 140 84 Z',
    'M100 86 L50 116 Q46 120 50 122 L150 122 Q154 120 150 116 Z',
    'M100 118 L44 150 Q40 154 44 156 L156 156 Q160 154 156 150 Z',
    'M100 152 L40 182 L160 182 Z',
    'M100 24 L100 34 M94 27 Q100 20 106 27',
  ],
  // 天宫廊桥（拱桥 + 长廊顶）
  bridge: [
    'M20 150 Q110 70 200 150',
    'M32 150 Q110 84 188 150',
    'M44 118 C74 94 100 88 110 88 C120 88 146 94 176 118 Q178 120 176 122 L44 122 Q42 120 44 118 Z',
    'M110 88 L110 122',
    'M52 122 L52 138 M168 122 L168 138',
    'M40 168 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0',
  ],
  // 天宫楼阁（三层飞檐 + 石台）
  pavilion: [
    'M30 190 L190 190 L182 200 L38 200 Z',
    'M100 30 C82 30 66 42 58 52 Q56 54 58 56 L142 56 Q144 54 142 52 C134 42 118 30 100 30 Z',
    'M100 30 L100 56',
    'M68 56 L68 82 M132 56 L132 82',
    'M100 82 C66 82 40 96 30 110 Q28 112 30 114 L170 114 Q172 112 170 110 C160 96 134 82 100 82 Z',
    'M44 114 L44 156 M156 114 L156 156 M100 114 L100 156',
    'M40 156 L160 156',
    'M100 156 C74 156 54 168 46 178 L154 178 C146 168 126 156 100 156 Z',
    'M40 178 L160 178',
    'M100 20 L100 30 M95 24 Q100 18 105 24',
  ],
  // 天宫山坡（坡地 + 三间小殿）
  hillside: [
    'M20 180 Q110 118 200 180 L200 200 L20 200 Z',
    'M52 150 L40 170 L64 170 Z',
    'M46 170 L46 180 M58 170 L58 180',
    'M100 128 L84 152 L116 152 Z',
    'M92 152 L92 164 M108 152 L108 164',
    'M110 118 L110 128',
    'M150 142 L138 162 L162 162 Z',
    'M144 162 L144 172 M156 162 L156 172',
  ],
  // 天宫金顶（双峰 + 峰顶小殿）
  goldenSummit: [
    'M20 190 L64 110 L86 190 Z',
    'M124 190 L160 128 L190 190 Z',
    'M74 106 L70 88 L78 88 Z',
    'M72 88 L72 96 M78 88 L78 96',
    'M74 84 L74 106',
    'M160 124 L156 110 L164 110 Z',
    'M158 110 L158 116 M162 110 L162 116',
  ],
};

const SVGNS = 'http://www.w3.org/2000/svg';

export class Stage2D {
  /**
   * @param {HTMLElement} host  .buildings 建筑层（在 .scroll__track 内）
   * @param {HTMLCanvasElement} canvas  全屏粒子画布
   * @param {{onStatus?: Function}} opts
   */
  constructor(host, canvas, { onStatus } = {}) {
    this.host = host;
    this.canvas = canvas;
    this.onStatus = onStatus;
    this.ready = false;
    this.finale = false;
    /** @type {Map<string, {egg, el, paths, source:string}>} */
    this.buildings = new Map();

    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;

    this.parts = [];
    this.rafId = 0;
    this.running = false;
  }

  async init() {
    if (!STAGE2D.enabled) {
      this.onStatus?.({ ok: false, message: '2D 特效舞台已关闭' });
      return false;
    }
    this.resize();
    this.ready = true;
    this.onStatus?.({ ok: true, message: '纯 2D 特效就绪（SVG 描边 + 粒子 + 伪 3D）' });
    return true;
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** 用 shape 造一个 SVG 建筑线稿元素 */
  svgFor(shape) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 220 200');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of (SHAPES[shape] || SHAPES.gateTower)) {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', 'draw');
      svg.appendChild(p);
    }
    return svg;
  }

  /** 造建筑 DOM，append 到 host 后准备好描边参数。返回 {el, paths} */
  makeBuilding(egg) {
    const el = document.createElement('div');
    el.className = 'building';
    el.dataset.id = egg.id;
    el.style.setProperty('--x', `${(egg.x * 100).toFixed(3)}%`);
    el.style.setProperty('--y', `${(egg.y * 100).toFixed(3)}%`);
    el.style.setProperty('--h', `${(STAGE2D.buildingHeightRatio * 100).toFixed(1)}%`);
    el.style.setProperty('--hue', String(Math.round(egg.hue * 360)));

    const glow = document.createElement('div');
    glow.className = 'building__glow';
    const shadow = document.createElement('div');
    shadow.className = 'building__shadow';
    const svg = this.svgFor(egg.shape);
    el.append(svg, glow, shadow);
    this.host.appendChild(el);

    // 挂到文档里之后再取 getTotalLength 才可靠
    const paths = [...svg.querySelectorAll('.draw')];
    for (const p of paths) {
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
    }
    return { el, paths };
  }

  /**
   * 让某座建筑"长出来"。已存在则重播动画。
   * @returns {Promise<{egg, el, paths, source:string}|null>}
   */
  async grow(egg) {
    if (!this.ready) return null;

    if (this.buildings.has(egg.id)) {
      const b = this.buildings.get(egg.id);
      b.el.classList.remove('show');
      void b.el.offsetWidth; // 强制重排，让过渡重新触发
      requestAnimationFrame(() => {
        b.el.classList.add('show');
        for (const p of b.paths) p.style.strokeDashoffset = '0';
      });
      this.burst(b.el);
      return b;
    }

    const { el, paths } = this.makeBuilding(egg);
    const building = { egg, el, paths, source: 'svg' };
    this.buildings.set(egg.id, building);

    requestAnimationFrame(() => {
      el.classList.add('show');
      for (const p of paths) p.style.strokeDashoffset = '0';
    });
    this.burst(el);
    return building;
  }

  /** 从建筑位置爆发粒子 */
  burst(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height * 0.75;
    const hue = parseInt(el.style.getPropertyValue('--hue') || '40', 10);
    const n = STAGE2D.particleCount;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 3.2;
      this.parts.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1.2,
        life: 1,
        decay: 0.007 + Math.random() * 0.02,
        r: 1 + Math.random() * 2.6,
        hue,
      });
    }
    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      this.tick();
      if (this.parts.length > 0) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.running = false;
        this.ctx.clearRect(0, 0, this.w, this.h);
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }

  tick() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.012;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = `hsl(${p.hue} 85% 68%)`;
      ctx.shadowBlur = 9;
      ctx.shadowColor = `hsl(${p.hue} 90% 60%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /** 刷新后重建已点亮的建筑（不再重播动画，直接呈现） */
  async rebuildFound(foundEggs) {
    this.reset();
    for (const egg of foundEggs) {
      const { el, paths } = this.makeBuilding(egg);
      this.buildings.set(egg.id, { egg, el, paths, source: 'svg' });
      el.classList.add('show');
      for (const p of paths) p.style.strokeDashoffset = '0';
    }
  }

  reset() {
    for (const b of this.buildings.values()) b.el.remove();
    this.buildings.clear();
    this.finale = false;
    this.host.classList.remove('is-finale');
  }

  setFinale(on) {
    this.finale = on;
    this.host.classList.toggle('is-finale', on);
  }

  get info() {
    return {
      ready: this.ready,
      buildings: this.buildings.size,
      sources: [...this.buildings.values()].map(b => `${b.egg.id}:${b.source}`),
    };
  }
}
