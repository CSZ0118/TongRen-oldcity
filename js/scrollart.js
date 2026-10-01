/**
 * 占位长卷绘制。
 *
 * Day2 计科B 会用 AI 生成真正的《贵州人间长卷》壁纸。
 * Day1 不能干等，所以这里用代码画一幅**同构图**的占位长卷：
 * 山峦、云海、江面、6 个彩蛋场景，位置跟 config.js 里的 x/y 完全一致。
 * 这样一来：
 *   - 长卷滚动的手感、彩蛋热点的位置、3D 建筑长出来的位置，Day1 就能全部调好；
 *   - Day2 把真图塞进 config.SCROLL.image，把 x/y 微调一下，其余代码不用动。
 */

/** 确定性随机：同一份配置每次画出来都一样，方便截图对比 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一维平滑噪声：几个正弦叠加，够画出连绵山脊 */
function makeNoise(seed, octaves = 5) {
  const rnd = mulberry32(seed);
  const waves = Array.from({ length: octaves }, (_, i) => ({
    f: (i + 1) * 0.7,
    p: rnd() * Math.PI * 2,
    a: 1 / (i + 1.1),
  }));
  const norm = waves.reduce((s, w) => s + w.a, 0);
  return (t) => waves.reduce((s, w) => s + Math.sin(t * w.f + w.p) * w.a, 0) / norm;
}

const PALETTE = {
  paperTop: '#f3ecdd',
  paperBottom: '#e2d9c4',
  mist: 'rgba(255, 253, 246, 0.82)',
  ink: '#2f3f3c',
  seal: '#a63b2f',
};

/** 中式屋顶：正脊在中间最高，两端檐角上翘 */
function drawRoof(ctx, cx, topY, hw, h, tip = 0.2) {
  const dropY = topY + h;
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.quadraticCurveTo(cx - hw * 0.5, topY + h * 0.44, cx - hw, dropY - h * tip);
  ctx.quadraticCurveTo(cx - hw * 0.92, dropY + h * 0.08, cx - hw * 0.6, dropY - h * 0.03);
  ctx.quadraticCurveTo(cx, dropY + h * 0.24, cx + hw * 0.6, dropY - h * 0.03);
  ctx.quadraticCurveTo(cx + hw * 0.92, dropY + h * 0.08, cx + hw, dropY - h * tip);
  ctx.quadraticCurveTo(cx + hw * 0.5, topY + h * 0.44, cx, topY);
  ctx.closePath();
  ctx.fill();
}

/** 一排小柱子（廊/吊脚楼的支撑） */
function drawPosts(ctx, cx, topY, bottomY, count, spread, width) {
  const step = spread / (count - 1 || 1);
  for (let i = 0; i < count; i += 1) {
    const x = cx - spread / 2 + step * i;
    ctx.fillRect(x - width / 2, topY, width, bottomY - topY);
  }
}

/**
 * 画一个彩蛋场景。
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./config.js').EGGS[number]} egg
 * @param {number} cx 场景中心 x
 * @param {number} cy 场景中心 y
 * @param {number} s  场景尺度（1 ≈ 140px 高）
 */
function drawScene(ctx, egg, cx, cy, s) {
  const ink = `hsl(${Math.round(egg.hue * 360)} 20% 31%)`;
  const inkSoft = `hsl(${Math.round(egg.hue * 360)} 16% 45%)`;

  ctx.save();
  ctx.translate(cx, cy);

  // 彩蛋所在处的柔光：让玩家能"隐约"看到画里有一处不一样
  const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, s * 1.6);
  halo.addColorStop(0, 'rgba(255, 246, 214, 0.5)');
  halo.addColorStop(1, 'rgba(255, 246, 214, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ink;

  switch (egg.shape) {
    // 城楼：台基 + 门洞 + 楼身 + 重檐
    case 'gateTower': {
      ctx.fillStyle = inkSoft;
      ctx.fillRect(-s * 1.15, s * 0.45, s * 2.3, s * 0.42); // 台基
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, s * 0.87);
      ctx.lineTo(-s * 0.22, s * 0.52);
      ctx.quadraticCurveTo(0, s * 0.28, s * 0.22, s * 0.52);
      ctx.lineTo(s * 0.22, s * 0.87);
      ctx.closePath();
      ctx.fill(); // 门洞
      ctx.fillRect(-s * 0.72, -s * 0.05, s * 1.44, s * 0.5); // 楼身
      drawRoof(ctx, 0, -s * 0.3, s * 0.95, s * 0.34);
      ctx.fillRect(-s * 0.42, -s * 0.66, s * 0.84, s * 0.3);
      drawRoof(ctx, 0, -s * 0.92, s * 0.68, s * 0.3);
      ctx.fillRect(-s * 0.03, -s * 1.22, s * 0.06, s * 0.2); // 宝顶
      break;
    }

    // 鼓楼：多层密檐往上收，顶上宝珠（要瘦高，不能摊成蘑菇）
    case 'drumTower': {
      const tiers = 5;
      for (let i = 0; i < tiers; i += 1) {
        const t = i / (tiers - 1);
        const hw = s * (0.62 - t * 0.36);
        const y = s * 0.62 - t * s * 1.42;
        drawRoof(ctx, 0, y - s * 0.26, hw, s * 0.3, 0.26);
        ctx.fillRect(-hw * 0.44, y + s * 0.02, hw * 0.88, s * 0.1);
      }
      ctx.beginPath();
      ctx.arc(0, -s * 0.94, s * 0.075, 0, Math.PI * 2);
      ctx.fill();
      drawPosts(ctx, 0, -s * 0.02, s * 0.62, 4, s * 0.56, s * 0.045);
      break;
    }

    // 风雨桥：拱桥 + 桥上长廊（屋顶要立体，不能做成飞碟）
    case 'bridge': {
      ctx.beginPath();
      ctx.moveTo(-s * 1.6, s * 0.42);
      ctx.quadraticCurveTo(0, -s * 0.5, s * 1.6, s * 0.42);
      ctx.lineTo(s * 1.5, s * 0.56);
      ctx.quadraticCurveTo(0, -s * 0.3, -s * 1.5, s * 0.56);
      ctx.closePath();
      ctx.fill(); // 桥拱
      drawPosts(ctx, 0, -s * 0.16, s * 0.3, 7, s * 2.1, s * 0.06);
      ctx.fillStyle = ink;
      drawRoof(ctx, 0, -s * 0.86, s * 1.05, s * 0.42, 0.3);
      ctx.fillRect(-s * 1.02, -s * 0.5, s * 2.04, s * 0.09);
      // 水中倒影
      ctx.globalAlpha = 0.25;
      ctx.save();
      ctx.scale(1, -0.5);
      drawRoof(ctx, 0, -s * 0.86, s * 1.05, s * 0.42, 0.3);
      ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }

    // 楼阁：三层飞檐 + 水中倒影
    case 'pavilion': {
      for (let i = 0; i < 3; i += 1) {
        const y = s * 0.58 - i * s * 0.46;
        const hw = s * (0.72 - i * 0.1);
        ctx.fillRect(-hw * 0.6, y - s * 0.26, hw * 1.2, s * 0.26);
        drawRoof(ctx, 0, y - s * 0.58, hw, s * 0.32, 0.3);
      }
      ctx.fillRect(-s * 0.02, -s * 1.06, s * 0.04, s * 0.18);
      ctx.globalAlpha = 0.22;
      ctx.save();
      ctx.scale(1, -0.45);
      for (let i = 0; i < 3; i += 1) {
        const y = s * 0.58 - i * s * 0.46;
        const hw = s * (0.72 - i * 0.1);
        drawRoof(ctx, 0, y - s * 0.58, hw, s * 0.32, 0.3);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }

    // 山坡 + 吊脚楼：镇远古镇
    case 'hillside': {
      ctx.fillStyle = inkSoft;
      ctx.beginPath();
      ctx.moveTo(-s * 1.8, s * 0.9);
      ctx.quadraticCurveTo(-s * 0.6, -s * 0.5, s * 0.5, s * 0.15);
      ctx.quadraticCurveTo(s * 1.2, s * 0.55, s * 1.8, s * 0.9);
      ctx.closePath();
      ctx.fill(); // 山坡
      ctx.fillStyle = ink;
      const houses = [
        [-s * 0.75, -s * 0.02, 0.46],
        [-s * 0.18, s * 0.22, 0.4],
        [s * 0.36, s * 0.42, 0.34],
      ];
      for (const [hx, hy, hw] of houses) {
        ctx.fillRect(hx - s * hw * 0.45, hy, s * hw * 0.9, s * 0.34);
        drawRoof(ctx, hx, hy - s * 0.24, s * hw * 0.62, s * 0.2, 0.3);
        drawPosts(ctx, hx, hy + s * 0.32, hy + s * 0.56, 3, s * hw * 0.7, s * 0.045); // 吊脚
      }
      // 挑担的小人
      ctx.fillRect(-s * 1.32, s * 0.5, s * 0.05, s * 0.3);
      ctx.beginPath();
      ctx.arc(-s * 1.3, s * 0.44, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-s * 1.6, s * 0.44, s * 0.6, s * 0.035);
      break;
    }

    // 金顶：双峰 + 顶上小殿 + 云海
    case 'goldenSummit': {
      ctx.beginPath();
      ctx.moveTo(-s * 1.5, s * 0.9);
      ctx.lineTo(-s * 0.42, -s * 0.72);
      ctx.lineTo(s * 0.05, s * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.05, s * 0.9);
      ctx.lineTo(s * 0.55, -s * 0.5);
      ctx.lineTo(s * 1.45, s * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = ink;
      drawRoof(ctx, -s * 0.42, -s * 1.0, s * 0.34, s * 0.18, 0.36);
      ctx.fillRect(-s * 0.6, -s * 0.84, s * 0.36, s * 0.16);
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = PALETTE.mist;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.5, s * 1.9, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }

    default:
      break;
  }

  ctx.restore();
}

/** 在场景下方写一行小字（画上的题名）。底色被压暗过，所以用纸色才看得见 */
function drawSceneLabel(ctx, egg, cx, bottomY) {
  ctx.save();
  ctx.font = '500 15px "STKaiti","KaiTi","Songti SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20, 34, 36, 0.45)';
  ctx.fillStyle = 'rgba(246, 239, 226, 0.86)';
  const text = `${egg.no} · ${egg.place}`;
  ctx.strokeText(text, cx, bottomY);
  ctx.fillText(text, cx, bottomY);
  ctx.restore();
}

/** 结尾的题跋与印章 */
function drawColophon(ctx, x, midY) {
  const chars = '贵州人间长卷'.split('');
  ctx.save();
  ctx.font = '600 34px "STKaiti","KaiTi","Songti SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(47, 63, 60, 0.8)';
  const startY = midY - (chars.length - 1) * 42 / 2;
  chars.forEach((ch, i) => ctx.fillText(ch, x, startY + i * 42));

  ctx.font = '400 14px "STKaiti","KaiTi",serif';
  ctx.fillStyle = 'rgba(47, 63, 60, 0.5)';
  ['彩蛋隐于画中', '点亮则天宫现'].forEach((line, i) =>
    line.split('').forEach((ch, j) => ctx.fillText(ch, x - 34, midY - 120 + i * 210 + j * 20)),
  );

  // 朱红印章
  ctx.fillStyle = PALETTE.seal;
  ctx.globalAlpha = 0.86;
  ctx.fillRect(x - 20, midY + 118, 40, 40);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f6efe2';
  ctx.font = '600 22px "STKaiti","KaiTi",serif';
  ctx.fillText('贵', x, midY + 146);
  ctx.restore();
}

/** 纸纹做旧：细颗粒 + 几道竖向纤维 */
function drawPaperTexture(ctx, w, h, seed) {
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#6b5b3e';
  for (let i = 0; i < 2600; i += 1) {
    const x = rnd() * w;
    const y = rnd() * h;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.globalAlpha = 0.035;
  ctx.strokeStyle = '#8a7452';
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i += 1) {
    const x = rnd() * w;
    const y = rnd() * h * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (rnd() - 0.5) * 60, y + 120, x + (rnd() - 0.5) * 90, y + 260);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 把占位长卷画到 canvas 上。
 * @param {HTMLCanvasElement} canvas
 * @param {{width:number, height:number, eggs:Array}} opts
 * @returns {{width:number, height:number, pixels:number, ms:number}} 实际像素尺寸（含 DPR 缩放）
 */
export function paintPlaceholderScroll(canvas, { width, height, eggs }) {
  const t0 = performance.now();
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const MAX_PIXELS = 12_000_000; // 再大就吃显存了，长卷本来就是超宽图，这里主动封顶

  let scale = Math.min(dpr, (window?.devicePixelRatio > 1 ? 2 : 1));
  if (width * height * scale * scale > MAX_PIXELS) {
    scale = Math.sqrt(MAX_PIXELS / (width * height));
  }

  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return { width, height, pixels: 0, ms: 0 };
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // 1) 纸底
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, PALETTE.paperTop);
  bg.addColorStop(0.55, '#ece3cf');
  bg.addColorStop(1, PALETTE.paperBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // 2) 远山五层，越远越淡
  const layers = [
    { baseY: height * 0.42, amp: height * 0.16, freq: 2.6, color: 'rgba(150, 172, 168, 0.55)', seed: 11 },
    { baseY: height * 0.50, amp: height * 0.20, freq: 3.6, color: 'rgba(122, 150, 145, 0.62)', seed: 23 },
    { baseY: height * 0.58, amp: height * 0.24, freq: 4.8, color: 'rgba(94, 126, 120, 0.70)', seed: 37 },
    { baseY: height * 0.68, amp: height * 0.26, freq: 6.4, color: 'rgba(66, 98, 94, 0.80)', seed: 53 },
    { baseY: height * 0.80, amp: height * 0.22, freq: 8.5, color: 'rgba(42, 68, 66, 0.88)', seed: 71 },
  ];

  for (const layer of layers) {
    const noise = makeNoise(layer.seed, 6);
    ctx.beginPath();
    ctx.moveTo(0, layer.baseY);
    for (let x = 0; x <= width; x += 5) {
      const t = (x / width) * layer.freq * Math.PI * 2;
      const y = layer.baseY - layer.amp * (noise(t) * 0.5 + 0.5);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = layer.color;
    ctx.fill();

    // 山脚云海
    const mist = ctx.createLinearGradient(0, layer.baseY - layer.amp * 0.35, 0, layer.baseY + height * 0.1);
    mist.addColorStop(0, 'rgba(255, 253, 246, 0)');
    mist.addColorStop(0.5, PALETTE.mist);
    mist.addColorStop(1, 'rgba(255, 253, 246, 0)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, layer.baseY - layer.amp * 0.35, width, height * 0.16);
  }

  // 3) 江面
  const riverY = height * 0.845;
  const river = ctx.createLinearGradient(0, riverY, 0, height);
  river.addColorStop(0, 'rgba(196, 214, 210, 0.92)');
  river.addColorStop(1, 'rgba(168, 192, 190, 0.96)');
  ctx.fillStyle = river;
  ctx.fillRect(0, riverY, width, height - riverY);

  // 水纹
  ctx.save();
  ctx.strokeStyle = 'rgba(90, 122, 118, 0.28)';
  ctx.lineWidth = 1.4;
  const wrnd = mulberry32(97);
  for (let i = 0; i < 260; i += 1) {
    const x = wrnd() * width;
    const y = riverY + wrnd() * (height - riverY);
    const len = 20 + wrnd() * 90;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len / 2, y - 2.5, x + len, y);
    ctx.stroke();
  }
  ctx.restore();

  // 4) 6 个彩蛋场景
  //    尺度有意压小：彩蛋是"藏在画里"的，不该比山还抢眼
  const sceneScale = Math.min(height * 0.115, width * 0.021);
  for (const egg of eggs) {
    drawScene(ctx, egg, egg.x * width, egg.y * height, sceneScale);
    drawSceneLabel(ctx, egg, egg.x * width, height * 0.958);
  }

  // 5) 题跋 + 印章
  drawColophon(ctx, width - 78, height * 0.42);

  // 6) 上下压暗，让 HUD 文字更清楚
  const topVeil = ctx.createLinearGradient(0, 0, 0, height * 0.22);
  topVeil.addColorStop(0, 'rgba(28, 44, 44, 0.30)');
  topVeil.addColorStop(1, 'rgba(28, 44, 44, 0)');
  ctx.fillStyle = topVeil;
  ctx.fillRect(0, 0, width, height * 0.22);

  const bottomVeil = ctx.createLinearGradient(0, height * 0.78, 0, height);
  bottomVeil.addColorStop(0, 'rgba(28, 44, 44, 0)');
  bottomVeil.addColorStop(1, 'rgba(28, 44, 44, 0.42)');
  ctx.fillStyle = bottomVeil;
  ctx.fillRect(0, height * 0.78, width, height * 0.22);

  drawPaperTexture(ctx, width, height, 20240501);

  return {
    width: canvas.width,
    height: canvas.height,
    pixels: canvas.width * canvas.height,
    ms: Math.round(performance.now() - t0),
  };
}
