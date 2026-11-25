import { activeBrush, buildGrainCanvas, buildMask, hexToHsl, hslToRgb, withDefaults, type BrushSettings, type PixelMap } from "./brushImport";
import { clamp, pressureResponse } from "./brushBehavior";

/** Tip size (screen points) at 100% Maximum size and full Brush size. */
export const MAX_TIP_PX = 80;

type Pt = { x: number; y: number };
export type BrushInput = { x: number; y: number; pressure: number; tilt: number; azimuth: number; twist: number; pen: boolean; time: number };
export type BrushSources = { shape: PixelMap | null; grain: PixelMap | null };
export type EngineOptions = {
  destination: HTMLCanvasElement;
  layer: HTMLCanvasElement;
  pixelRatio: () => number;
  color: () => string;
  settings?: () => BrushSettings;
  sources?: () => BrushSources;
  size?: () => number | undefined;
  opacity?: () => number | undefined;
  sizeScale?: () => number;
  viewRotation?: () => number;
  wetMix?: boolean;
  fast?: boolean;
};

/** Reads pen pressure, tilt, azimuth and barrel roll from a pointer event. */
export function readPointer(e: PointerEvent, x: number, y: number): BrushInput {
  const isPen = e.pointerType === "pen";
  const rawP = typeof e.pressure === "number" && e.pressure > 0 ? e.pressure : isPen ? 0.5 : 1;
  const tiltX = e.tiltX ?? 0;
  const tiltY = e.tiltY ?? 0;
  const radX = (tiltX * Math.PI) / 180;
  const radY = (tiltY * Math.PI) / 180;
  const tilt = Math.min(Math.PI / 2, Math.acos(Math.cos(radX) * Math.cos(radY)));
  let azimuth = Math.atan2(Math.sin(radY), Math.sin(radX));
  if (azimuth < 0) azimuth += Math.PI * 2;
  const twist = (((e.twist ?? 0) % 360) * Math.PI) / 180;
  return { x, y, pressure: rawP, tilt, azimuth, twist, pen: isPen, time: e.timeStamp || performance.now() };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Pending = { pos: Pt; dir: number; input: BrushInput; distance: number; speed: number };
type Active = {
  id: number; input: BrushInput; last: Pt; smooth: Pt; filtered: Pt; raws: Pt[];
  lastTime: number; lastDirection: number;
  carry: number; distance: number; speed: number;
  mask: HTMLCanvasElement; maxMode: boolean; uniform: boolean; strength: number; threshold: boolean;
  movingGrain: boolean; grainOffset: Pt; grainPat: CanvasPattern | null; grainLevels: (CanvasPattern | null | undefined)[];
  hsl: [number, number, number]; secondary: [number, number, number]; rgb: [number, number, number]; rgbStr: string;
  baseSize: number; baseAngle: number; opacity: number;
  bbox: Box | null; all: Box | null; tinted: HTMLCanvasElement | null; levels: (HTMLCanvasElement | undefined)[];
  pending: Pending[]; stamps: Pending[];
};

const mixHsl = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => {
  const t = clamp(k), dh = ((b[0] - a[0] + 540) % 360) - 180;
  return [(a[0] + dh * t + 360) % 360, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
};

const BLEND_OPS: Record<string, GlobalCompositeOperation> = {
  Normal: "source-over", Multiply: "multiply", Screen: "screen", Overlay: "overlay",
  Darken: "darken", Lighten: "lighten", "Color Dodge": "color-dodge", "Color Burn": "color-burn",
  "Hard Light": "hard-light", "Soft Light": "soft-light", Difference: "difference", Exclusion: "exclusion",
  Hue: "hue", Saturation: "saturation", Color: "color", Luminosity: "luminosity",
  Add: "lighter", Subtract: "source-over", Divide: "source-over", LinearBurn: "source-over",
};

const BLEND_CSS: Record<string, string> = {
  Normal: "normal", Multiply: "multiply", Screen: "screen", Overlay: "overlay",
  Darken: "darken", Lighten: "lighten", "Color Dodge": "color-dodge", "Color Burn": "color-burn",
  "Hard Light": "hard-light", "Soft Light": "soft-light", Difference: "difference", Exclusion: "exclusion",
  Hue: "hue", Saturation: "saturation", Color: "color", Luminosity: "luminosity",
  Add: "plus-lighter", Subtract: "normal", Divide: "normal", LinearBurn: "normal",
};

/**
 * Creates a two-layer stroke engine.
 */
export function createStrokeEngine(o: EngineOptions) {
  const dst = o.destination;
  const layer = o.layer;
  const dctx = dst.getContext("2d")!;
  const lctx = layer.getContext("2d")!;
  const cw = dst.width;
  const ch = dst.height;

  const mcan = document.createElement("canvas");
  mcan.width = cw; mcan.height = ch;
  const mctx = mcan.getContext("2d")!;

  const acan = document.createElement("canvas");
  acan.width = cw; acan.height = ch;
  const actx = acan.getContext("2d")!;

  const scratch = document.createElement("canvas");
  const xctx = scratch.getContext("2d")!;

  let stroke: Active | null = null;
  let rafId: number | null = null;
  let seed = 0x1234567;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const sym = () => rand() * 2 - 1;

  const S = () => withDefaults(o.settings ? o.settings() : activeBrush.settings);
  const n = (k: string) => Number(S()[k] ?? 0);
  const on = (k: string) => S()[k] === true;
  const str = (k: string) => String(S()[k] ?? "");

  const mk = () => document.createElement("canvas");
  const ensure = () => {
    if (mcan.width !== dst.width || mcan.height !== dst.height) {
      mcan.width = acan.width = dst.width;
      mcan.height = acan.height = dst.height;
    }
  };

  const grainPx = (baseSize: number, dpr: number) => {
    const s = S();
    const sc = n("grainScale") / 100;
    if (str("grainMode") === "Texturized") return Math.max(0.05, sc * (dpr / 2));
    const zm = n("grainZoom") / 100;
    return Math.max(0.05, sc * (1 + (baseSize / (MAX_TIP_PX * dpr) - 1) * zm));
  };

  const colorVaries = (wet: boolean) =>
    n("stampHue") > 0 || n("stampSat") > 0 || n("stampLight") > 0 || n("stampDark") > 0 || n("stampSecondary") > 0 ||
    n("pressureHue") > 0 || n("pressureSat") > 0 || n("pressureLight") > 0 || n("pressureDark") > 0 || n("pressureSecondary") > 0 ||
    n("tiltHue") > 0 || n("tiltSat") > 0 || n("tiltLight") > 0 || n("tiltDark") > 0 || n("tiltSecondary") > 0 ||
    n("rollHue") > 0 || n("rollSat") > 0 || n("rollLight") > 0 || n("rollDark") > 0 || n("rollSecondary") > 0 ||
    (wet && (n("dilution") > 0 || n("attack") > 0));

  const stampColor = (s: Active, input: BrushInput, tilt: number, roll: number) => {
    const p = input.pressure;
    let [h, sat, l] = s.hsl;
    const dh = sym() * (n("stampHue") / 100) * 180 +
      (p * 2 - 1) * (n("pressureHue") / 100) * 180 +
      tilt * (n("tiltHue") / 100) * 180 +
      (roll / (Math.PI * 2)) * (n("rollHue") / 100) * 180;
    const ds = sym() * (n("stampSat") / 100) +
      (p * 2 - 1) * (n("pressureSat") / 100) +
      tilt * (n("tiltSat") / 100) +
      (roll / (Math.PI * 2)) * (n("rollSat") / 100);
    const dl = (rand() * (n("stampLight") / 100) - rand() * (n("stampDark") / 100)) * 0.5 +
      (p * 2 - 1) * ((n("pressureLight") - n("pressureDark")) / 200) +
      tilt * ((n("tiltLight") - n("tiltDark")) / 200) +
      (roll / (Math.PI * 2)) * ((n("rollLight") - n("rollDark")) / 200);
    let cur: [number, number, number] = [(h + dh + 360) % 360, clamp(sat + ds), clamp(l + dl)];
    const secK = clamp(
      rand() * (n("stampSecondary") / 100) +
      p * (n("pressureSecondary") / 100) +
      tilt * (n("tiltSecondary") / 100) +
      (roll / (Math.PI * 2)) * (n("rollSecondary") / 100)
    );
    if (secK > 0) cur = mixHsl(cur, s.secondary, secK);
    const rgb = hslToRgb(...cur);
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  };

  /** Tints mask into dst canvas keeping original white core pixels pure white. */
  const tintMask = (targetCanvas: HTMLCanvasElement, maskCanvas: HTMLCanvasElement, rgbColor: [number, number, number]) => {
    const res = maskCanvas.width;
    targetCanvas.width = targetCanvas.height = res;
    const tx = targetCanvas.getContext("2d")!;
    tx.clearRect(0, 0, res, res);
    tx.drawImage(maskCanvas, 0, 0);

    const imgData = tx.getImageData(0, 0, res, res);
    const data = imgData.data;

    let hasWhiteCore = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! > 30 && (data[i]! > 60 || data[i + 1]! > 60 || data[i + 2]! > 60)) {
        hasWhiteCore = true;
        break;
      }
    }

    if (hasWhiteCore) {
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]!;
        if (a === 0) continue;
        const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 765;
        data[i] = Math.round(rgbColor[0] * (1 - lum) + 255 * lum);
        data[i + 1] = Math.round(rgbColor[1] * (1 - lum) + 255 * lum);
        data[i + 2] = Math.round(rgbColor[2] * (1 - lum) + 255 * lum);
      }
      tx.putImageData(imgData, 0, 0);
    } else {
      tx.globalCompositeOperation = "source-in";
      tx.fillStyle = `rgb(${rgbColor[0]},${rgbColor[1]},${rgbColor[2]})`;
      tx.fillRect(0, 0, res, res);
    }
  };

  const movingMask = (
    s: Active, at: Pt, dir: number, ang: number, sx: number, sy: number, sz: number,
    projSize: number, bleed: number
  ) => {
    const src = o.sources ? o.sources() : { shape: activeBrush.shape, grain: activeBrush.grain };
    const depth = clamp(
      Math.max(n("grainDepthMin"), n("grainDepth") - rand() * n("grainDepthJitter")) / 100 - bleed
    );
    const rot = (n("grainRotation") / 100) * Math.PI + (on("followStroke") ? dir : 0);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const gk = (projSize / Math.max(1, sz)) / grainPx(s.baseSize, o.pixelRatio());
    const offset = {
      x: ((at.x - cw / 2) * cos + (at.y - ch / 2) * sin) * gk + s.grainOffset.x,
      y: (-(at.x - cw / 2) * sin + (at.y - ch / 2) * cos) * gk + s.grainOffset.y,
    };
    return buildMask(s.mask.width, S(), depth, offset, true, src);
  };

  const drawStamp = (
    s: Active, at: Pt, ang: number, sz: number, sx: number, sy: number, a: number,
    color: string | null, base: HTMLCanvasElement
  ) => {
    const res = base.width;
    const rad = (sz * Math.max(Math.abs(sx), Math.abs(sy))) / 2;
    const bx0 = Math.floor(at.x - rad);
    const by0 = Math.floor(at.y - rad);
    const bx1 = Math.ceil(at.x + rad);
    const by1 = Math.ceil(at.y + rad);
    if (bx1 < 0 || by1 < 0 || bx0 >= cw || by0 >= ch) return;

    let img: CanvasImageSource = base;
    let ga = a;

    if (s.maxMode) {
      if (color) {
        if (scratch.width !== res) scratch.width = scratch.height = res;
        xctx.globalCompositeOperation = "source-over";
        xctx.globalAlpha = 1; xctx.fillStyle = "#000"; xctx.fillRect(0, 0, res, res);
        xctx.globalAlpha = ga; xctx.drawImage(base, 0, 0); xctx.globalAlpha = 1;
        img = scratch;
      }
      ga = 1;
    } else if (s.tinted && !color && base === s.mask) {
      img = s.tinted;
    } else {
      if (scratch.width !== res) scratch.width = scratch.height = res;
      xctx.globalCompositeOperation = "source-over";
      xctx.globalAlpha = 1;
      xctx.clearRect(0, 0, res, res);

      const parsedRgb = color
        ? (color.match(/\d+/g)?.map(Number) as [number, number, number] | undefined) ?? s.rgb
        : s.rgb;
      tintMask(scratch, base, parsedRgb);
      img = scratch;
    }

    const ctx = s.maxMode ? mctx : lctx;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(ang);
    ctx.scale((sz * sx) / res, (sz * sy) / res);
    ctx.globalAlpha = ga;
    ctx.globalCompositeOperation = s.maxMode ? "lighter" : "source-over";
    ctx.drawImage(img, -res / 2, -res / 2);
    ctx.restore();

    const box: Box = { x0: Math.max(0, bx0), y0: Math.max(0, by0), x1: Math.min(cw, bx1), y1: Math.min(ch, by1) };
    s.bbox = s.bbox ? {
      x0: Math.min(s.bbox.x0, box.x0), y0: Math.min(s.bbox.y0, box.y0),
      x1: Math.max(s.bbox.x1, box.x1), y1: Math.max(s.bbox.y1, box.y1),
    } : box;
  };

  const scheduleFlush = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (!stroke) return;
      renderPending(stroke);
      commitBbox(stroke);
    });
  };

  const commitBbox = (s: Active) => {
    if (!s.bbox) return;
    const b = s.bbox;
    s.bbox = null;
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    if (bw <= 0 || bh <= 0) return;
    s.all = s.all ? {
      x0: Math.min(s.all.x0, b.x0), y0: Math.min(s.all.y0, b.y0),
      x1: Math.max(s.all.x1, b.x1), y1: Math.max(s.all.y1, b.y1),
    } : { ...b };
  };

  const renderPending = (s: Active) => {
    const list = s.stamps;
    s.stamps = [];
    if (!list.length) return;

    const round = Math.max(0.01, 1 - n("roundness") / 100);
    const mode = str("renderingMode");
    const dpr = o.pixelRatio();
    const count = Math.max(1, Math.round(n("count") + sym() * (n("countJitter") / 100) * n("count")));

    for (let li = 0; li < list.length; li++) {
      const p = list[li]!;
      const at = p.pos;
      const input = p.input;
      const dir = p.dir;

      const tilt = clamp((input.tilt - (n("tiltAngle") / 180) * (Math.PI / 2)) / (Math.PI / 2));
      const roll = input.twist;
      const pLinear = input.pressure;
      const spd = clamp(p.speed / (1500 * dpr));

      let size = s.baseSize;
      size *= (1 + (pLinear * 2 - 1) * (n("pencilPressureSize") / 100));
      const untilted = size;
      if (tilt > 0) size *= (1 + tilt * (n("tiltSize") / 100));
      if (roll !== 0) size *= (1 + (roll / (Math.PI * 2)) * (n("barrelSize") / 100));
      size *= (1 + (spd * 2 - 1) * (n("speedSize") / 100));

      let alpha = 1;
      alpha *= (1 - (1 - pLinear) * (n("pencilPressureOpacity") / 100));
      if (tilt > 0) alpha *= (1 - tilt * (n("tiltOpacity") / 100));
      if (roll !== 0) alpha *= (1 - (roll / (Math.PI * 2)) * (n("barrelOpacity") / 100));
      alpha *= (1 + (spd * 2 - 1) * (n("speedOpacity") / 100));
      alpha = clamp(alpha);

      let angle = s.baseAngle;
      if (on("orientToScreen") && o.viewRotation) angle += o.viewRotation();
      if (on("azimuth")) angle += input.azimuth;
      if (on("followStroke")) angle += dir;

      const bleed = (pLinear * n("pencilPressureBleed") + tilt * n("tiltBleed") + (roll / (Math.PI * 2)) * n("barrelBleed")) / 100;

      for (let ci = 0; ci < count; ci++) {
        const sz = size * (1 - rand() * (n("jitterSize") / 100));
        const a = alpha * (1 - rand() * (n("jitterOpacity") / 100));
        const sx = (on("flipX") && rand() < 0.5 ? -1 : 1) * Math.max(0.05, 1 - rand() * (n("roundHJitter") / 100));
        const sy = (on("flipY") && rand() < 0.5 ? -1 : 1) * Math.max(0.05, round * (1 - rand() * (n("roundVJitter") / 100)));
        const ang = angle + sym() * (n("scatter") / 100) * Math.PI;
        const color = s.maxMode || s.tinted ? null : stampColor(s, input, tilt, roll);
        const projSize = (on("tiltSizeCompression") ? untilted : size) * (size > 0 ? sz / size : 1);
        const base = s.movingGrain ? movingMask(s, at, dir, ang, sx, sy, sz, projSize, bleed) : s.mask;
        drawStamp(s, at, ang, sz, sx, sy, a, color, base);
      }
    }
  };

  const emit = (c: Pt, dir: number, input: BrushInput, dist = 0, speed = 0) => {
    if (!stroke) return;
    stroke.stamps.push({ pos: c, dir, input, distance: dist, speed });
    stroke.distance += dist;
    scheduleFlush();
  };

  const advanceTo = (to: Pt, input: BrushInput, now: number) => {
    if (!stroke) return;
    const s = stroke;
    const dt = Math.max(1, now - s.lastTime);
    s.lastTime = now;
    const dpr = o.pixelRatio();
    const streamline = clamp(n("streamline") / 100);
    const k = Math.min(1, Math.max(0.05, 1 - streamline * 0.9));
    const smooth: Pt = { x: s.smooth.x + (to.x - s.smooth.x) * k, y: s.smooth.y + (to.y - s.smooth.y) * k };
    s.smooth = smooth;

    const from = s.last;
    const dx = smooth.x - from.x, dy = smooth.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return;

    const speed = (d / dt) * 1000;
    s.speed = s.speed * 0.7 + speed * 0.3;
    const dir = Math.atan2(dy, dx);
    s.lastDirection = dir;

    const step = Math.max(1, (s.baseSize * Math.max(1, n("spacing"))) / 100);
    let dist = s.carry;
    while (dist + step <= d) {
      dist += step;
      const t = dist / d;
      emit({ x: from.x + dx * t, y: from.y + dy * t }, dir, input, step, s.speed);
    }
    s.carry = dist - d;
    s.last = smooth;
  };

  const begin = (input: BrushInput) => {
    ensure();
    const dpr = o.pixelRatio();
    const sizeScale = o.sizeScale?.() ?? 1;
    const minS = n("minSize"), maxS = Math.max(minS, n("maxSize"));
    const pct = minS + (maxS - minS) * ((o.size?.() ?? n("brushSize")) / 100);
    const baseSize = Math.max(1, (MAX_TIP_PX * dpr * sizeScale * pct) / 100);
    const secondary = hexToHsl(str("secondaryColor") || "#FFFFFF");
    let hsl = hexToHsl(o.color());
    hsl = [
      hsl[0] + sym() * (n("strokeHue") / 100) * 180,
      hsl[1] + sym() * (n("strokeSat") / 100),
      hsl[2] + rand() * (n("strokeLight") / 100) * 0.5 - rand() * (n("strokeDark") / 100) * 0.5,
    ];
    hsl = mixHsl(hsl, secondary, rand() * (n("strokeSecondary") / 100));
    const rgb = hslToRgb(...hsl);
    const rgbStr = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    const mode = str("renderingMode");
    const vary = colorVaries(false);
    const maxMode = (mode === "Light Glaze" || mode === "Uniformed Glaze") && !vary && !on("classicNormal");
    const strength = mode === "Intense Glaze" ? 1.25 : mode === "Heavy Glaze" ? 1.5 : mode === "Intense Blending" ? 1.2 : 1;
    const texturized = str("grainMode") === "Texturized";
    const src = o.sources ? o.sources() : { shape: activeBrush.shape, grain: activeBrush.grain };
    const hasGrain = !!src.grain;
    const depth = clamp(Math.max(n("grainDepthMin"), n("grainDepth") - rand() * n("grainDepthJitter")) / 100);
    const grainOffset = on("grainOffsetJitter") ? { x: rand() * 2048, y: rand() * 2048 } : { x: 0, y: 0 };
    const res = Math.max(24, Math.min(256, Math.round(baseSize)));
    const mask = buildMask(res, S(), 0, { x: 0, y: 0 }, false, src);

    let grainPat: CanvasPattern | null = null;
    if (hasGrain && texturized && depth > 0) {
      const gc = buildGrainCanvas(S(), depth, src.grain);
      if (gc) {
        grainPat = lctx.createPattern(gc, "repeat");
        grainPat?.setTransform(
          new DOMMatrix()
            .rotate((n("grainRotation") / 100) * 180)
            .scale(grainPx(baseSize, dpr))
            .translate(-grainOffset.x, -grainOffset.y)
        );
      }
    }
    const movingGrain = hasGrain && !texturized &&
      (n("grainDepth") > 0 || n("pencilPressureBleed") > 0 || n("tiltBleed") > 0 || n("barrelBleed") > 0);

    let tinted: HTMLCanvasElement | null = null;
    if (!maxMode && !vary) {
      tinted = mk();
      tintMask(tinted, mask, rgb);
    }

    const minO = n("minOpacity"), maxO = Math.max(minO, n("maxOpacity"));
    const opacity = (minO + (maxO - minO) * ((o.opacity?.() ?? n("brushOpacity")) / 100)) / 100;
    lctx.clearRect(0, 0, cw, ch);
    actx.clearRect(0, 0, cw, ch);
    if (maxMode) {
      mctx.globalCompositeOperation = "source-over";
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, cw, ch);
    }
    layer.style.opacity = String(opacity);
    layer.style.mixBlendMode = on("luminanceBlending") ? "luminosity" : (BLEND_CSS[str("blendMode")] ?? "normal");

    const c = { x: input.x, y: input.y };
    stroke = {
      id: 1, input, last: c, smooth: c, filtered: c, raws: [c],
      lastTime: input.time, lastDirection: 0,
      carry: 0, distance: 0, speed: 0,
      mask, maxMode, uniform: mode === "Uniformed Glaze" || mode === "Uniform Blending", strength, threshold: on("alphaThreshold"),
      movingGrain, grainOffset, grainPat, grainLevels: [],
      hsl, secondary, rgb, rgbStr, baseSize,
      baseAngle: on("randomized") ? rand() * Math.PI * 2 : 0,
      opacity, bbox: null, all: null, tinted, levels: [],
      pending: [{ pos: c, dir: 0, input, distance: 0, speed: 0 }],
      stamps: [{ pos: c, dir: 0, input, distance: 0, speed: 0 }],
    };

    emit(c, 0, input);
  };

  const move = (input: BrushInput) => {
    if (!stroke) return;
    advanceTo({ x: input.x, y: input.y }, input, input.time);
  };

  const end = () => {
    if (!stroke) return;
    renderPending(stroke);
    commitBbox(stroke);
    const s = stroke;
    stroke = null;

    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }

    const box = s.all ?? { x0: 0, y0: 0, x1: cw, y1: ch };
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    if (bw <= 0 || bh <= 0) return;

    if (s.maxMode) {
      lctx.clearRect(box.x0, box.y0, bw, bh);
      lctx.save();
      lctx.drawImage(mcan, box.x0, box.y0, bw, bh, box.x0, box.y0, bw, bh);
      lctx.globalCompositeOperation = "source-in";
      lctx.fillStyle = s.rgbStr;
      lctx.fillRect(box.x0, box.y0, bw, bh);
      lctx.restore();
    }

    dctx.save();
    dctx.globalAlpha = s.opacity;
    dctx.globalCompositeOperation = on("luminanceBlending")
      ? "luminosity"
      : (BLEND_OPS[str("blendMode")] ?? "source-over");
    dctx.drawImage(layer, box.x0, box.y0, bw, bh, box.x0, box.y0, bw, bh);
    dctx.restore();

    lctx.clearRect(box.x0, box.y0, bw, bh);
    layer.style.opacity = "1";
    layer.style.mixBlendMode = "normal";
  };

  const cancel = () => {
    if (!stroke) return;
    stroke = null;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    lctx.clearRect(0, 0, cw, ch);
    layer.style.opacity = "1";
    layer.style.mixBlendMode = "normal";
  };

  return { begin, move, end, cancel };
}

/** Previews a brush stroke onto an arbitrary canvas element. */
export function renderBrushPreview(
  canvas: HTMLCanvasElement,
  settings: BrushSettings,
  color = "#000000",
  sources?: BrushSources
) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  const off = document.createElement("canvas");
  off.width = w; off.height = h;

  const engine = createStrokeEngine({
    destination: canvas,
    layer: off,
    pixelRatio: () => 1,
    color: () => color,
    settings: () => settings,
    sources: () => sources ?? { shape: activeBrush.shape, grain: activeBrush.grain },
    fast: true,
  });

  const pts: Pt[] = [
    { x: w * 0.1, y: h * 0.5 },
    { x: w * 0.35, y: h * 0.25 },
    { x: w * 0.65, y: h * 0.75 },
    { x: w * 0.9, y: h * 0.5 },
  ];

  engine.begin({ x: pts[0]!.x, y: pts[0]!.y, pressure: 0.3, tilt: 0, azimuth: 0, twist: 0, pen: true, time: 0 });
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p0 = pts[0]!, p1 = pts[1]!, p2 = pts[2]!, p3 = pts[3]!;
    const cx = (1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t ** 2 * p2.x + t ** 3 * p3.x;
    const cy = (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t ** 2 * p2.y + t ** 3 * p3.y;
    const pr = 0.3 + 0.7 * Math.sin(t * Math.PI);
    engine.move({ x: cx, y: cy, pressure: pr, tilt: 0, azimuth: 0, twist: 0, pen: true, time: i * 16 });
  }
  engine.end();
}
