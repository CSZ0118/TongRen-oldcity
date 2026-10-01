/**
 * 长卷横向滚动引擎。
 *
 * 为什么不用浏览器的原生横向滚动？
 *   原生滚动条太丑、手机上不好拖、也没法做「橡皮筋 + 惯性 + 阻尼」这种长卷手感，
 *   而《清明上河图》式的手感恰恰是本作品的核心体验。
 *   所以这里自己实现：transform 平移 + rAF 阻尼插值。
 *
 * 支持：鼠标拖拽 / 滚轮 / 触控板横扫 / 触摸滑动 / 键盘 ←→ / 程序化跳转
 */

/** @typedef {{x:number, ratio:number, progress:number, width:number, height:number, max:number, dragging:boolean}} ScrollState */

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export class LongScroll {
  /**
   * @param {HTMLElement} viewport 外层容器（overflow hidden）
   * @param {{aspect:number, minScreens:number, damping:number, wheelSpeed:number, dragSpeed:number, edgeBounce:number, snapToEgg:boolean}} opts
   */
  constructor(viewport, opts) {
    this.viewport = viewport;
    const track = viewport.querySelector('[data-track]');
    if (!(track instanceof HTMLElement)) {
      throw new Error('LongScroll: 找不到 [data-track] 轨道元素');
    }
    this.track = track;
    this.opts = opts;

    /** 当前显示位置（px） */
    this.current = 0;
    /** 目标位置（px） */
    this.target = 0;
    /** 可滚动上限 */
    this.max = 0;
    /** 长卷内容尺寸（CSS px） */
    this.width = 0;
    this.height = 0;

    this.dragging = false;
    this.dragMoved = 0;
    this.keys = new Set();
    this.lastFrame = 0;
    this.rafId = 0;
    this.running = false;

    /** @type {Set<(s:ScrollState)=>void>} */
    this.listeners = new Set();
    /** @type {null | ((w:number,h:number)=>void)} */
    this.onResize = null;

    /** 首帧之前的「铺开长卷」动画进度 0→1 */
    this.reveal = 0;

    this.bound = {
      wheel: this.onWheel.bind(this),
      pointerdown: this.onPointerDown.bind(this),
      pointermove: this.onPointerMove.bind(this),
      pointerup: this.onPointerUp.bind(this),
      keydown: this.onKeyDown.bind(this),
      keyup: this.onKeyUp.bind(this),
      resize: this.onWindowResize.bind(this),
    };
  }

  // ─────────────────────────── 尺寸 ───────────────────────────

  /** 按视口尺寸重算长卷尺寸；返回是否发生了变化 */
  measure() {
    const vw = this.viewport.clientWidth || window.innerWidth;
    const vh = this.viewport.clientHeight || window.innerHeight;
    const width = Math.max(vh * this.opts.aspect, vw * this.opts.minScreens);
    const height = vh;
    const changed = width !== this.width || height !== this.height;
    if (changed) {
      this.width = width;
      this.height = height;
      this.max = Math.max(0, width - vw);
      this.track.style.width = `${Math.round(width)}px`;
      this.track.style.height = `${Math.round(height)}px`;
      this.target = clamp(this.target, 0, this.max);
      this.current = clamp(this.current, 0, this.max);
    }
    return changed;
  }

  onWindowResize() {
    if (this.measure()) {
      this.onResize?.(this.width, this.height);
      this.emit();
    }
  }

  // ─────────────────────────── 生命周期 ───────────────────────────

  mount() {
    this.measure();
    this.onResize?.(this.width, this.height);

    const vp = this.viewport;
    vp.addEventListener('wheel', this.bound.wheel, { passive: false });
    vp.addEventListener('pointerdown', this.bound.pointerdown);
    vp.addEventListener('pointermove', this.bound.pointermove);
    vp.addEventListener('pointerup', this.bound.pointerup);
    vp.addEventListener('pointercancel', this.bound.pointerup);
    vp.addEventListener('lostpointercapture', this.bound.pointerup);
    window.addEventListener('keydown', this.bound.keydown);
    window.addEventListener('keyup', this.bound.keyup);
    window.addEventListener('resize', this.bound.resize);

    this.start();
    return this;
  }

  destroy() {
    const vp = this.viewport;
    vp.removeEventListener('wheel', this.bound.wheel);
    vp.removeEventListener('pointerdown', this.bound.pointerdown);
    vp.removeEventListener('pointermove', this.bound.pointermove);
    vp.removeEventListener('pointerup', this.bound.pointerup);
    vp.removeEventListener('pointercancel', this.bound.pointerup);
    vp.removeEventListener('lostpointercapture', this.bound.pointerup);
    window.removeEventListener('keydown', this.bound.keydown);
    window.removeEventListener('keyup', this.bound.keyup);
    window.removeEventListener('resize', this.bound.resize);
    this.stop();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.step(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  // ─────────────────────────── 每帧 ───────────────────────────

  step(now) {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000 || 0.016);
    this.lastFrame = now;

    // 键盘长按 → 恒速平移
    if (this.keys.size > 0) {
      const speed = this.viewport.clientWidth * 0.85; // px/s
      let dir = 0;
      if (this.keys.has('ArrowLeft') || this.keys.has('a')) dir -= 1;
      if (this.keys.has('ArrowRight') || this.keys.has('d')) dir += 1;
      this.target = clamp(this.target + dir * speed * dt, 0, this.max);
    }

    // 松手后从橡皮筋区域弹回
    if (!this.dragging) {
      const c = clamp(this.target, 0, this.max);
      if (c !== this.target) {
        this.target += (c - this.target) * (1 - Math.pow(0.0005, dt));
      }
    }

    // 阻尼插值：current 追 target
    const k = 1 - Math.pow(1 - clamp(this.opts.damping, 0.02, 1), dt * 60);
    const delta = this.target - this.current;
    if (Math.abs(delta) < 0.06) {
      this.current = this.target;
    } else {
      this.current += delta * k;
    }

    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 0.9);

    this.apply();
    this.emit();
  }

  apply() {
    const x = -Math.round(this.current * 100) / 100;
    this.track.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  // ─────────────────────────── 对外 API ───────────────────────────

  /** @param {(s:ScrollState)=>void} fn @returns {()=>void} 取消订阅 */
  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.state());
    return () => this.listeners.delete(fn);
  }

  /** @returns {ScrollState} */
  state() {
    const ratio = this.max > 0 ? this.current / this.max : 0;
    return {
      x: this.current,
      ratio,
      progress: clamp(ratio, 0, 1),
      width: this.width,
      height: this.height,
      max: this.max,
      dragging: this.dragging,
    };
  }

  emit() {
    const s = this.state();
    for (const fn of this.listeners) fn(s);
  }

  /** 直接定位（px） */
  scrollToX(x, { immediate = false } = {}) {
    this.target = clamp(x, 0, this.max);
    if (immediate) {
      this.current = this.target;
      this.apply();
      this.emit();
    }
  }

  /** 按比例定位 0~1 */
  scrollToRatio(r, opts) {
    this.scrollToX(clamp(r, 0, 1) * this.max, opts);
  }

  /** 把长卷上的某个横向比例位置挪到视口正中 */
  centerOn(xRatio, { immediate = false } = {}) {
    const vw = this.viewport.clientWidth;
    const desiredLeft = xRatio * this.width - vw / 2;
    // 靠近两端时允许略微偏移，避免"到边了还硬要居中"导致热点贴边
    this.scrollToX(clamp(desiredLeft, 0, this.max), { immediate });
  }

  /** 往前走一屏 */
  page(dir = 1) {
    this.scrollToX(this.target + dir * this.viewport.clientWidth * 0.85);
  }

  // ─────────────────────────── 输入 ───────────────────────────

  /** @param {WheelEvent} ev */
  onWheel(ev) {
    if (ev.ctrlKey) return; // 让浏览器自己处理缩放
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? this.viewport.clientHeight : 1;
    const dominant =
      Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX * unit : ev.deltaY * unit;
    if (dominant === 0) return;
    ev.preventDefault();
    this.target = clamp(this.target + dominant * this.opts.wheelSpeed, 0, this.max);
  }

  /** @param {PointerEvent} ev */
  onPointerDown(ev) {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    // 让视频层/按钮自己处理
    if (ev.target instanceof Element && ev.target.closest('[data-no-drag]')) return;
    this.dragging = true;
    this.dragStartX = ev.clientX;
    this.dragStartTarget = this.target;
    this.dragMoved = 0;
    this.viewport.setPointerCapture?.(ev.pointerId);
    this.viewport.dataset.dragging = 'true';
  }

  /** @param {PointerEvent} ev */
  onPointerMove(ev) {
    if (!this.dragging) return;
    const dx = ev.clientX - this.dragStartX;
    this.dragMoved = Math.max(this.dragMoved, Math.abs(dx));
    const raw = this.dragStartTarget - dx * this.opts.dragSpeed;
    // 橡皮筋：越过两端时按 edgeBounce 打折，松手回弹
    this.target =
      raw < 0
        ? raw * this.opts.edgeBounce
        : raw > this.max
          ? this.max + (raw - this.max) * this.opts.edgeBounce
          : raw;
    if (this.dragMoved > 4) this.viewport.dataset.dragged = 'true';
  }

  onPointerUp() {
    if (!this.dragging) return;
    this.dragging = false;
    delete this.viewport.dataset.dragging;
    // dragMoved 留给 consumeDragClick() 判断这次是不是"拖完的误触"
  }

  /**
   * 拖拽之后的第一次 click 应该被当成误触丢掉。
   * 配合 main.js 在捕获阶段调用。
   */
  consumeDragClick() {
    const moved = this.dragMoved > 6;
    this.dragMoved = 0;
    window.setTimeout(() => delete this.viewport.dataset.dragged, 0);
    return moved;
  }

  /** @param {KeyboardEvent} ev */
  onKeyDown(ev) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (ev.key.startsWith('Arrow') || ev.key === 'a' || ev.key === 'd') {
      this.keys.add(ev.key);
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Home') {
      this.scrollToX(0);
      ev.preventDefault();
    }
    if (ev.key === 'End') {
      this.scrollToX(this.max);
      ev.preventDefault();
    }
    if (ev.key === 'PageDown' || ev.key === 'PageUp') {
      this.page(ev.key === 'PageDown' ? 1 : -1);
      ev.preventDefault();
    }
  }

  onKeyUp(ev) {
    this.keys.delete(ev.key);
  }
}
