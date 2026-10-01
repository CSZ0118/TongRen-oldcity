/**
 * Three.js 3D 舞台。
 *
 * 职责：彩蛋被点中后，让对应的天宫建筑"从壁画里长出来" —— 升起、发光、缓慢旋转。
 *
 * Day1 的策略（这一点很重要）：
 *   6 个 GLB 还没做（Day2 建筑同学交付），所以这里的 grow() 是**双通道**的：
 *     · 有 GLB → GLTFLoader 加载真模型，自动归一化尺寸与落脚点
 *     · 没有 GLB → 用基础几何体现场拼一个同类型的占位建筑
 *   两条通道共用同一套「长出 / 发光 / 旋转 / 悬停」动画和同一条屏幕锚定逻辑。
 *   于是 Day2 只要把 .glb 按 config.js 里的路径丢进 assets/models/，
 *   真模型就自动顶上，前端一行都不用改。
 */
import { STAGE3D, EGGS } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** 回弹缓动：末尾轻微过冲，像建筑"弹"出来 */
const easeOutBack = (t) => {
  const c1 = 1.25;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export class Stage3D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onStatus?:(s:{ok:boolean, message:string, detail?:string})=>void}} [opts]
   */
  constructor(canvas, { onStatus } = {}) {
    this.canvas = canvas;
    this.onStatus = onStatus;
    this.ready = false;
    /** @type {any} */ this.THREE = null;
    /** @type {any} */ this.renderer = null;
    /** @type {any} */ this.scene = null;
    /** @type {any} */ this.camera = null;

    /**
     * wrap  —— 每帧按屏幕坐标定位（建筑"钉"在壁画上的那个点）
     * pivot —— 只负责动画：长出(scale.y) / 自转(rotation.y) / 悬停(position.y)
     * model —— 归一化好的静态模型，不再被动画碰
     * 三者分开是为了让"长出"动画不会把归一化缩放覆盖掉。
     * @type {Map<string, {wrap:any, pivot:any, model:any, mats:any[], ring:any, ringMat:any, light:any, glow:number, phase:'growing'|'idle', t:number, source:string, egg:any}>}
     */
    this.buildings = new Map();

    /** 视口尺寸缓存 */
    this.viewW = 1;
    this.viewH = 1;
    this.finale = false;
    /** 上一帧的布局，用于 resize 后不闪 */
    this.layout = { scrollX: 0, contentWidth: 1, contentHeight: 1 };
  }

  // ─────────────────────────── 初始化 ───────────────────────────

  async init() {
    if (!STAGE3D.enabled) {
      this.onStatus?.({ ok: false, message: '3D 舞台已在 config.js 中关闭' });
      return false;
    }
    try {
      // 走 <script type="importmap"> 里的 "three" → ./vendor/three/three.module.js
      this.THREE = await import('three');
    } catch (err) {
      this.onStatus?.({
        ok: false,
        message: 'Three.js 加载失败，已降级为纯 2D 光效',
        detail: err instanceof Error ? err.message : String(err),
      });
      return false;
    }

    const THREE = this.THREE;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      this.onStatus?.({
        ok: false,
        message: 'WebGL 不可用，已降级为纯 2D 光效',
        detail: err instanceof Error ? err.message : String(err),
      });
      return false;
    }

    this.renderer.setClearAlpha(0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.applyCameraDistance();

    // 灯光：天光 + 暖阳 + 底部补光，让金瓦有层次
    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x53402c, 0.9);
    this.scene.add(hemi);

    this.canvas.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      this.ready = false;
      this.onStatus?.({ ok: false, message: 'WebGL 上下文丢失（显卡/驱动问题）' });
    });

    this.ready = true;
    this.resize();
    this.onStatus?.({
      ok: true,
      message: `Three.js r${THREE.REVISION} 就绪`,
      detail: this.describeRenderer(),
    });
    return true;
  }

  applyCameraDistance() {
    const half = STAGE3D.frustumHeight / 2;
    const dist = half / Math.tan(((this.camera.fov * Math.PI) / 180) / 2);
    this.camera.position.set(0, 0, dist);
    this.camera.lookAt(0, 0, 0);
  }

  describeRenderer() {
    const gl = this.renderer?.getContext?.();
    if (!gl) return '';
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return String(name);
    } catch {
      return 'renderer info 不可读';
    }
  }

  // ─────────────────────────── 尺寸 ───────────────────────────

  resize() {
    if (!this.ready) return;
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth || window.innerWidth);
    const h = Math.max(1, host.clientHeight || window.innerHeight);
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyCameraDistance();
  }

  // ─────────────────────────── 材质 ───────────────────────────

  makeMaterials(hue) {
    const THREE = this.THREE;
    /** @type {any[]} */
    const list = [];

    /** @param {any} opts */
    const make = (opts) => {
      const m = new THREE.MeshStandardMaterial(opts);
      m.userData.baseEmissive = m.emissiveIntensity;
      list.push(m);
      return m;
    };

    const tile = make({
      color: new THREE.Color().setHSL(hue, 0.62, 0.54),
      metalness: 0.68,
      roughness: 0.3,
      emissive: new THREE.Color().setHSL(hue, 0.85, 0.18),
      emissiveIntensity: 0.08,
    });
    const wood = make({
      color: new THREE.Color().setHSL(0.045, 0.5, 0.32),
      metalness: 0.06,
      roughness: 0.78,
      emissive: new THREE.Color().setHSL(0.06, 0.7, 0.16),
      emissiveIntensity: 0.06,
    });
    const stone = make({
      color: 0x9aa6ab,
      metalness: 0.08,
      roughness: 0.92,
      emissive: new THREE.Color(0x2b3a44),
      emissiveIntensity: 0.05,
    });
    const gold = make({
      color: 0xffd98a,
      metalness: 0.9,
      roughness: 0.18,
      emissive: new THREE.Color(0xffc861),
      emissiveIntensity: 0.5,
    });
    return { tile, wood, stone, gold, list };
  }

  // ─────────────────────────── 占位建筑 ───────────────────────────

  /** 一座中式屋顶（四棱锥），攒尖顶的通用件 */
  roofPiece(radius, height, material) {
    const THREE = this.THREE;
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4, 1), material);
    mesh.rotation.y = Math.PI / 4;
    mesh.castShadow = false;
    return mesh;
  }

  /** 四棱柱楼身 */
  boxPiece(w, h, d, material) {
    const THREE = this.THREE;
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  }

  /**
   * 按 egg.shape 拼一座占位建筑。
   * 约定：底座落在 y = 0，整体高度约 1.0（后面由 normalize 统一缩放）。
   */
  buildPlaceholder(shape, mats) {
    const THREE = this.THREE;
    const g = new THREE.Group();
    const add = (mesh, x, y, z = 0) => {
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };

    switch (shape) {
      // 南天门式城楼：台基 → 门洞 → 楼身 → 重檐 → 宝顶
      case 'gateTower': {
        add(this.boxPiece(0.9, 0.22, 0.5, mats.stone), 0, 0.11);
        add(this.boxPiece(0.72, 0.3, 0.38, mats.wood), 0, 0.37);
        add(this.roofPiece(0.56, 0.2, mats.tile), 0, 0.62);
        add(this.boxPiece(0.5, 0.22, 0.28, mats.wood), 0, 0.83);
        add(this.roofPiece(0.44, 0.24, mats.tile), 0, 1.06);
        add(this.boxPiece(0.06, 0.1, 0.06, mats.gold), 0, 1.23);
        break;
      }
      // 天宫鼓楼：多层密檐往上收
      case 'drumTower': {
        add(this.boxPiece(0.6, 0.16, 0.6, mats.stone), 0, 0.08);
        const tiers = 5;
        for (let i = 0; i < tiers; i += 1) {
          const t = i / (tiers - 1);
          const y = 0.24 + t * 0.72;
          const r = 0.42 - t * 0.2;
          add(this.roofPiece(r, 0.14, mats.tile), 0, y + 0.07);
          add(this.boxPiece(r * 0.9, 0.1, r * 0.9, mats.wood), 0, y - 0.02);
        }
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), mats.gold);
        add(bead, 0, 1.06);
        break;
      }
      // 天宫廊桥：横跨的长廊 + 两端桥墩
      case 'bridge': {
        add(this.boxPiece(1.4, 0.1, 0.32, mats.wood), 0, 0.3);
        for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) {
          add(this.boxPiece(0.04, 0.28, 0.04, mats.wood), x, 0.16);
        }
        const roof = this.roofPiece(0.62, 0.26, mats.tile);
        roof.scale.set(1.9, 1, 0.85);
        add(roof, 0, 0.55);
        add(this.boxPiece(0.24, 0.5, 0.3, mats.stone), -0.72, 0.25);
        add(this.boxPiece(0.24, 0.5, 0.3, mats.stone), 0.72, 0.25);
        break;
      }
      // 天宫楼阁：三层飞檐 + 石台
      case 'pavilion': {
        add(this.boxPiece(0.8, 0.18, 0.8, mats.stone), 0, 0.09);
        for (let i = 0; i < 3; i += 1) {
          const y = 0.24 + i * 0.26;
          const r = 0.42 - i * 0.08;
          add(this.boxPiece(r * 1.1, 0.16, r * 1.1, mats.wood), 0, y + 0.08);
          add(this.roofPiece(r * 1.3, 0.16, mats.tile), 0, y + 0.26);
        }
        add(this.boxPiece(0.05, 0.14, 0.05, mats.gold), 0, 1.1);
        break;
      }
      // 天宫山坡：坡地 + 三间殿宇
      case 'hillside': {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.82, 0.26, 8), mats.stone);
        add(base, 0, 0.13);
        const spots = [
          [-0.34, 0.28, 0.34],
          [0.02, 0.42, 0.4],
          [0.36, 0.56, 0.3],
        ];
        for (const [x, y, s] of spots) {
          add(this.boxPiece(s * 0.8, s * 0.5, s * 0.7, mats.wood), x, y);
          add(this.roofPiece(s * 0.72, s * 0.4, mats.tile), x, y + s * 0.45);
        }
        break;
      }
      // 天宫金顶：双峰 + 峰顶小殿
      case 'goldenSummit': {
        const p1 = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.0, 5), mats.stone);
        add(p1, -0.24, 0.5);
        const p2 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.72, 5), mats.stone);
        add(p2, 0.32, 0.36);
        add(this.boxPiece(0.26, 0.16, 0.26, mats.wood), -0.24, 1.06);
        add(this.roofPiece(0.24, 0.16, mats.gold), -0.24, 1.22);
        break;
      }
      default: {
        add(this.boxPiece(0.5, 0.8, 0.5, mats.wood), 0, 0.4);
        add(this.roofPiece(0.45, 0.3, mats.tile), 0, 0.95);
        break;
      }
    }

    return g;
  }

  /**
   * 把模型归一化：高度缩放到 targetHeight，水平居中，底面贴 y = 0。
   * GLB 和占位模型都走这一步，保证两者视觉大小一致。
   */
  normalize(model, targetHeight) {
    const THREE = this.THREE;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = targetHeight / (size.y || 1);
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);

    const box2 = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box2.min.y;
    return model;
  }

  /** 收集模型上所有材质，后面统一调自发光 */
  collectMaterials(model) {
    /** @type {any[]} */
    const mats = [];
    model.traverse((obj) => {
      const m = obj.material;
      if (!m) return;
      const arr = Array.isArray(m) ? m : [m];
      for (const one of arr) {
        if (!one) continue;
        if (one.userData.baseEmissive === undefined) {
          one.userData.baseEmissive = one.emissiveIntensity ?? 0;
        }
        // 没有 emissive 通道的材质（比如 MeshBasicMaterial）补一个浅色自发光
        if (one.emissive && one.emissive.getHex() === 0x000000) {
          one.emissive = new this.THREE.Color(0xffca7a);
        }
        mats.push(one);
      }
    });
    return mats;
  }

  // ─────────────────────────── 长出建筑 ───────────────────────────

  /**
   * 让某座建筑从壁画里长出来。
   * @param {import('./config.js').EGGS[number]} egg
   * @param {{modelUrl?:string|null, replace?:boolean}} [opts]
   */
  async grow(egg, { modelUrl = null, replace = false } = {}) {
    if (!this.ready) return null;
    if (this.buildings.has(egg.id)) {
      if (!replace) {
        // 已经长出来了：重新弹一次，给个"再点一次"的反馈
        const b = this.buildings.get(egg.id);
        b.phase = 'growing';
        b.t = 0;
        return b;
      }
      this.remove(egg.id);
    }

    const THREE = this.THREE;
    const targetHeight = STAGE3D.frustumHeight * STAGE3D.buildingHeightRatio;
    const mats = this.makeMaterials(egg.hue);

    let model = null;
    let source = 'placeholder';
    if (modelUrl) {
      try {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(modelUrl);
        model = gltf.scene;
        source = 'glb';
      } catch (err) {
        console.warn(`[stage3d] ${egg.id} 的 GLB 加载失败，改用占位建筑：`, err);
        model = null;
      }
    }
    if (!model) model = this.buildPlaceholder(egg.shape, mats);

    this.normalize(model, targetHeight);
    model.traverse((o) => {
      o.frustumCulled = false; // 建筑数量少，关掉剔除避免滚动时闪没
    });

    const wrap = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.add(model);
    wrap.add(pivot);

    const materialList = this.collectMaterials(model);

    // 地面光环
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(egg.hue, 0.9, 0.66),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.6, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    wrap.add(ring);

    // 建筑自己的暖光
    const light = new THREE.PointLight(new THREE.Color().setHSL(egg.hue, 0.7, 0.6), 0, 6, 2);
    light.position.set(0, targetHeight * 0.55, 0.4);
    wrap.add(light);

    this.scene.add(wrap);

    const building = {
      egg,
      wrap,
      pivot,
      model,
      ring,
      ringMat,
      light,
      mats: materialList,
      phase: 'growing',
      t: 0,
      glow: 0,
      source,
    };
    this.buildings.set(egg.id, building);
    return building;
  }

  remove(id) {
    const b = this.buildings.get(id);
    if (!b) return;
    this.scene?.remove(b.wrap);
    b.wrap.traverse?.((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
      else m?.dispose?.();
    });
    this.buildings.delete(id);
  }

  reset() {
    for (const id of [...this.buildings.keys()]) this.remove(id);
    this.finale = false;
  }

  async rebuildFound(foundEggs, resolveModel) {
    this.reset();
    for (const egg of foundEggs) {
      const url = resolveModel?.(egg) ?? null;
      await this.grow(egg, { modelUrl: url });
      const b = this.buildings.get(egg.id);
      if (b) {
        b.phase = 'idle';
        b.t = 1;
        b.glow = 1;
      }
    }
  }

  setFinale(on) {
    this.finale = on;
  }

  // ─────────────────────────── 每帧 ───────────────────────────

  /**
   * @param {number} dt 秒
   * @param {{scrollX:number, contentWidth:number, contentHeight:number, elapsed:number}} layout
   */
  update(dt, layout) {
    if (!this.ready) return;
    this.layout = layout;

    const vw = this.viewW;
    const vh = this.viewH;
    const visibleH = STAGE3D.frustumHeight;
    const visibleW = visibleH * (vw / vh);
    const targetHeight = STAGE3D.frustumHeight * STAGE3D.buildingHeightRatio;

    for (const b of this.buildings.values()) {
      const screenX = b.egg.x * layout.contentWidth - layout.scrollX;
      const screenY = b.egg.y * layout.contentHeight;

      // 视口外就不画了，省性能
      const visible = screenX > -vw * 0.6 && screenX < vw * 1.6 && screenY > -vh * 0.6;
      b.wrap.visible = visible;
      if (!visible) continue;

      b.wrap.position.x = (screenX / vw - 0.5) * visibleW;
      b.wrap.position.y = (0.5 - screenY / vh) * visibleH;

      // 长出动画（只动 pivot，不碰 model 的归一化缩放）
      if (b.phase === 'growing') {
        b.t = Math.min(1, b.t + dt / STAGE3D.growDuration);
        const e = easeOutBack(b.t);
        b.pivot.scale.y = Math.max(0.001, e);
        const lateral = 0.6 + 0.4 * easeOutCubic(b.t);
        b.pivot.scale.x = lateral;
        b.pivot.scale.z = lateral;
        b.ring.scale.setScalar(0.4 + 1.5 * easeOutCubic(b.t));
        b.ringMat.opacity = 0.75 * (1 - b.t) ** 1.5;
        b.glow = easeOutCubic(Math.min(1, b.t * 1.4));
        if (b.t >= 1) {
          b.phase = 'idle';
          b.pivot.scale.set(1, 1, 1);
          b.ring.visible = false;
        }
      } else {
        b.glow = Math.min(1, b.glow + dt * 0.5);
      }

      // 自转 + 悬停浮动
      const spin = STAGE3D.spinSpeed * (this.finale ? 1.6 : 1);
      b.pivot.rotation.y += spin * dt;
      const amp = STAGE3D.floatAmplitude * (this.finale ? 1.7 : 1);
      b.pivot.position.y = Math.sin(layout.elapsed * 0.9 + b.egg.no * 1.3) * amp * b.glow;

      // 发光
      const glow = (this.finale ? STAGE3D.glowIntensity * 1.6 : STAGE3D.glowIntensity) * b.glow;
      for (const m of b.mats) {
        m.emissiveIntensity = (m.userData.baseEmissive ?? 0) + glow;
      }
      b.light.intensity = glow * 1.4;
      b.light.distance = targetHeight * 8;
    }
  }

  render() {
    if (!this.ready) return;
    this.renderer.render(this.scene, this.camera);
  }

  /** 调试面板用 */
  get info() {
    return {
      ready: this.ready,
      revision: this.THREE?.REVISION ?? null,
      buildings: this.buildings.size,
      sources: [...this.buildings.values()].map((b) => `${b.egg.id}:${b.source}`),
      renderer: this.describeRenderer(),
    };
  }
}

export { EGGS, clamp };
