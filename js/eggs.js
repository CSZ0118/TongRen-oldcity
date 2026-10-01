/**
 * 彩蛋热点层。
 *
 * 负责：把 6 个彩蛋渲染成壁画上的可点热点、记录「已点亮」进度、
 * 通过回调把「点中了谁」交给 main.js 去驱动视频 / 音效 / 3D 建筑。
 *
 * 热点位置用百分比定位在长卷上（跟滚动轨道同一个坐标系），
 * 所以长卷横移时彩蛋会跟着画一起走 —— 它是"藏在画里的"，不是贴在屏幕上的。
 */
import { EGGS, STORAGE_KEY, COPY } from './config.js';

/** @typedef {(egg: import('./config.js').EGGS[number], index: number, replay: boolean) => void} FoundHandler */

export class EggField {
  /**
   * @param {HTMLElement} container 长卷轨道里的彩蛋容器
   * @param {{onFound?:FoundHandler, onProgress?:(found:number,total:number)=>void, persist?:boolean}} [opts]
   */
  constructor(container, { onFound, onProgress, persist = true } = {}) {
    this.container = container;
    this.onFound = onFound;
    this.onProgress = onProgress;
    this.persist = persist;

    /** @type {Set<string>} */
    this.found = new Set(this.load());
    /** @type {Map<string, HTMLElement>} */
    this.nodes = new Map();
    /** 当前正在展示的那一个（点击后高亮） */
    this.activeId = null;

    this.build();

    this.container.addEventListener(
      'click',
      (ev) => {
        const btn = ev.target instanceof Element ? ev.target.closest('.egg') : null;
        if (!btn) return;
        const id = btn.dataset.id;
        const index = EGGS.findIndex((e) => e.id === id);
        if (index < 0) return;
        this.activate(id);
        this.onFound?.(EGGS[index], index, this.found.has(id));
      },
      // 用捕获阶段，保证在滚动引擎的拖拽判断之后仍能拿到事件
      { capture: false },
    );
  }

  // ─────────────────────────── 持久化 ───────────────────────────

  load() {
    if (!this.persist) return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((id) => EGGS.some((e) => e.id === id)) : [];
    } catch {
      return [];
    }
  }

  save() {
    if (!this.persist) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.found]));
    } catch {
      /* 隐私模式下 localStorage 会抛异常，忽略 */
    }
  }

  // ─────────────────────────── 渲染 ───────────────────────────

  build() {
    const frag = document.createDocumentFragment();
    EGGS.forEach((egg) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'egg';
      btn.dataset.id = egg.id;
      btn.style.setProperty('--x', `${(egg.x * 100).toFixed(3)}%`);
      btn.style.setProperty('--y', `${(egg.y * 100).toFixed(3)}%`);
      btn.style.setProperty('--hue', String(Math.round(egg.hue * 360)));
      btn.setAttribute('aria-label', `${egg.place} · ${egg.title}：${egg.hint}`);
      btn.setAttribute('aria-pressed', 'false');
      btn.dataset.noDrag = 'false';
      btn.innerHTML = `
        <span class="egg__ripple" aria-hidden="true"></span>
        <span class="egg__halo" aria-hidden="true"></span>
        <span class="egg__dot" aria-hidden="true"></span>
        <span class="egg__tag" aria-hidden="true">${egg.place}<em>${egg.title}</em></span>
      `;
      frag.appendChild(btn);
      this.nodes.set(egg.id, btn);
      if (this.found.has(egg.id)) this.paint(btn, 'found');
    });
    this.container.appendChild(frag);
    this.report();
  }

  /** @param {HTMLElement} node @param {'found'|'active'|'idle'} state */
  paint(node, state) {
    node.classList.toggle('is-found', state === 'found' || state === 'active');
    node.classList.toggle('is-active', state === 'active');
    node.setAttribute('aria-pressed', String(state !== 'idle'));
  }

  /** 高亮某一个（点中后） */
  activate(id) {
    if (this.activeId && this.nodes.has(this.activeId)) {
      const prev = /** @type {HTMLElement} */ (this.nodes.get(this.activeId));
      this.paint(prev, this.found.has(this.activeId) ? 'found' : 'idle');
    }
    this.activeId = id;
    const node = this.nodes.get(id);
    if (node) this.paint(node, 'active');
  }

  // ─────────────────────────── 状态 ───────────────────────────

  /**
   * 记录一个彩蛋被点亮。
   * @param {string} id
   * @returns {{first:boolean, found:number, total:number, complete:boolean}}
   */
  markFound(id) {
    const first = !this.found.has(id);
    this.found.add(id);
    if (first) this.save();
    this.report();
    return {
      first,
      found: this.found.size,
      total: EGGS.length,
      complete: this.found.size === EGGS.length,
    };
  }

  report() {
    this.onProgress?.(this.found.size, EGGS.length);
  }

  get count() {
    return this.found.size;
  }

  get total() {
    return EGGS.length;
  }

  get complete() {
    return this.found.size === EGGS.length;
  }

  /** 还没找到的第一个彩蛋（用于「下一处」按钮 / 提示） */
  nextUnfound() {
    return EGGS.find((e) => !this.found.has(e.id)) ?? null;
  }

  /** 按顺序点亮到最新状态（用于刷新后重建 3D 建筑） */
  foundEggs() {
    return EGGS.filter((e) => this.found.has(e.id));
  }

  reset() {
    this.found.clear();
    this.activeId = null;
    this.save();
    for (const [id, node] of this.nodes) this.paint(node, 'idle');
    this.report();
  }

  /** 键盘无障碍：Tab 到热点时把它滚到屏幕中间 */
  focusFirstUnfound(scroll) {
    const egg = this.nextUnfound();
    if (!egg) return false;
    scroll.centerOn(egg.x);
    this.nodes.get(egg.id)?.focus({ preventScroll: true });
    return true;
  }
}

export { COPY };
