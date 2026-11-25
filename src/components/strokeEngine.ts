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
export function readPointer(e: PointerEvent | undefined, x: number, y: number): BrushInput {
  const ev = e as (PointerEvent & { altitudeAngle?: number; azimuthAngle?: number }) | undefined;
  const time = ev?.timeStamp ?? performance.now();
  if (!ev || ev.pointerType !== "pen") return { x, y, pressure: 1, tilt: 0, azimuth: 0, twist: 0, pen: false, time };
  const tilt = typeof ev.altitudeAngle === "number"
    ? clamp(1 - ev.altitudeAngle / (Math.PI / 2))
    : clamp(Math.max(Math.abs(ev.tiltX || 0), Math.abs(ev.tiltY || 0)) / 90);
  const azimuth = typeof ev.azimuthAngle === "number" ? ev.azimuthAngle : Math.atan2(ev.tiltY || 0, ev.tiltX || 0);
  return { x, y, pressure: ev.pressure > 0 ? ev.pressure : 0.5, tilt, azimuth, twist: ((ev.twist || 0) * Math.PI) / 180, pen: true, time };
}

const BLEND: Record<string, [GlobalCompositeOperation, string]> = {
  Normal: ["source-over", "normal"], Multiply: ["multiply", "multiply"], Subtract: ["source-over", "difference"],
  Overlay: ["overlay", "overlay"], Screen: ["screen", "screen"], Add: ["lighter", "plus-lighter"],
  Darken: ["darken", "darken"], Lighten: ["lighten", "lighten"], "Color Burn": ["color-burn", "color-burn"], "Color Dodge": ["color-dodge", "color-dodge"],
};
const blendOf = (m: string) => BLEND[m] ?? (["source-over", "normal"] as [GlobalCompositeOperation, string]);

type Box = { x0: number; y0: number; x1: number; y1: number };
type Pending = { pos: Pt; dir: number; input: BrushInput; distance: number; speed: number };
type Stroke = {
  dpr: number; sizeScale: number; lenScale: number; wet: boolean;
  last: BrushInput; raw: BrushInput; smooth: Pt; filtered: Pt; raws: Pt[];
  motionHistory: Pt[]; stabBuffer: { x: number; y: number; time: number }[];
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
  return [a[0] + dh * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
};

/** One stroke pipeline shared by the canvas, the Brush Studio drawing pad and brush previews. */
export function createStrokeEngine(o: EngineOptions) {
  const lctx = o.layer.getContext("2d")!;
  const mk = () => document.createElement("canvas");
  const maskBuf = mk(), acc = mk(), scratch = mk(), gscratch = mk();
  const mctx = maskBuf.getContext("2d", { willReadFrequently: true })!;
  const actx = acc.getContext("2d")!;
  const xctx = scratch.getContext("2d")!;
  const gctx = gscratch.getContext("2d")!;
  let cw = 0, ch = 0, raf = 0;
  let S: BrushSettings = withDefaults();
  let src: BrushSources = { shape: null, grain: null };
  let stroke: Stroke | null = null;

  const n = (id: string) => {
    const cur = o.settings?.() ?? S;
    const v = cur[id] ?? S[id];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  const on = (id: string) => {
    const cur = o.settings?.() ?? S;
    return (cur[id] ?? S[id]) === true;
  };
  const str = (id: string) => {
    const cur = o.settings?.() ?? S;
    return String(cur[id] ?? S[id] ?? "");
  };
  
  const rand = () => Math.random();
  const sym = () => Math.random() * 2 - 1;
  const centered = (v: number, x: number) => (v >= 0 ? 1 - v * (1 - x) : 1 + v * x);

  const ensure = () => {
    const w = o.layer.width, h = o.layer.height;
    if (w === cw && h === ch) return;
    cw = w; ch = h;
    maskBuf.width = acc.width = w;
    maskBuf.height = acc.height = h;
  };

  const colorVaries = (wet: boolean) =>
    ["stampHue", "stampSat", "stampLight", "stampDark", "stampSecondary",
      "pressColorHue", "pressColorSat", "pressColorBright", "pressColorSecondary",
      "tiltColorHue", "tiltColorSat", "tiltColorBright", "tiltColorSecondary",
      "barrelColorHue", "barrelColorSat", "barrelColorBright", "barrelColorSecondary"].some((k) => n(k) !== 0) ||
    (wet && n("pull") > 0);

  /** Canvas pixels per grain pixel, from Scale and Zoom. */
  const grainPx = (size: number, dpr: number) => {
    const base = Math.max(0.02, n("grainScale") / 100) * 2;
    if (str("grainMode") === "Texturized") return base * dpr;
    const z = clamp(n("grainZoom") / 100);
    const gw = src.grain?.w ?? 256;
    return base * dpr * z + (1 - z) * base * size / gw;
  };

  const getTaperLengths = (s: Stroke, pen: boolean) => {
    const pre = pen ? "p" : "t";
    const startPercent = n(`${pre}TaperLength`);
    const endPercent = on(`${pre}TaperLink`) ? startPercent : (n(`${pre}TaperEndLength`) || startPercent);
    const maxTaperDistance = 250 * s.dpr * (s.lenScale || 1);
    const startLen = (startPercent / 100) * maxTaperDistance;
    const endLen = (endPercent / 100) * maxTaperDistance;
    return { startLen, endLen, pre };
  };

  const grow = (s: Stroke, x: number, y: number, r: number) => {
    for (const key of ["bbox", "all"] as const) {
      const b = s[key];
      if (!b) s[key] = { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
      else { b.x0 = Math.min(b.x0, x - r); b.y0 = Math.min(b.y0, y - r); b.x1 = Math.max(b.x1, x + r); b.y1 = Math.max(b.y1, y + r); }
    }
  };

  const flush = () => {
    raf = 0;
    const s = stroke;
    if (!s || !s.bbox) return;
    const b = s.bbox;
    s.bbox = null;
    if (!s.maxMode && !s.grainPat && !s.threshold) return;
    const x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0));
    const x1 = Math.min(cw, Math.ceil(b.x1)), y1 = Math.min(ch, Math.ceil(b.y1));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const thr = s.threshold ? (n("thresholdAmount") / 100) * 255 : -1;
    if (s.maxMode) {
      const sd = mctx.getImageData(x0, y0, w, h).data;
      const out = lctx.createImageData(w, h), od = out.data;
      const [r, g, bl] = s.rgb;
      for (let k = 0; k < od.length; k += 4) {
        const a = sd[k] ?? 0;
        od[k] = r; od[k + 1] = g; od[k + 2] = bl;
        od[k + 3] = thr >= 0 ? (a > thr ? 255 : 0) : a;
      }
      lctx.putImageData(out, x0, y0);
    } else {
      lctx.clearRect(x0, y0, w, h);
      lctx.drawImage(acc, x0, y0, w, h, x0, y0, w, h);
    }
    if (s.grainPat) {
      lctx.save();
      lctx.beginPath(); lctx.rect(x0, y0, w, h); lctx.clip();
      lctx.globalCompositeOperation = "destination-in";
      lctx.imageSmoothingEnabled = str("grainFiltering") !== "No filtering";
      lctx.imageSmoothingQuality = str("grainFiltering") === "Classic filtering" ? "medium" : "high";
      lctx.fillStyle = s.grainPat;
      lctx.fillRect(x0, y0, w, h);
      lctx.restore();
    }
    if (thr >= 0 && !s.maxMode) {
      const im = lctx.getImageData(x0, y0, w, h), d = im.data;
      for (let k = 3; k < d.length; k += 4) d[k] = (d[k] ?? 0) > thr ? 255 : 0;
      lctx.putImageData(im, x0, y0);
    }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(flush); };

  // Wet mix Pull: pick up colour already on the canvas.
  const pickUp = (s: Stroke, pos: Pt) => {
    const dctx = o.destination.getContext("2d");
    if (!dctx) return;
    const x = Math.round(clamp(pos.x, 0, cw - 1)), y = Math.round(clamp(pos.y, 0, ch - 1));
    const px = dctx.getImageData(x, y, 1, 1).data;
    if ((px[3] ?? 0) === 0) return;
    const hex = "#" + [px[0] ?? 0, px[1] ?? 0, px[2] ?? 0].map((v) => v.toString(16).padStart(2, "0")).join("");
    const mix = (n("pull") / 100) * (str("renderingMode") === "Intense Blending" ? 0.6 : 0.35);
    s.hsl = mixHsl(s.hsl, hexToHsl(hex), mix);
  };

  const stampColor = (s: Stroke, input: BrushInput, tilt: number, roll: number): string => {
    let [h, sat, l] = s.hsl;
    h += sym() * (n("stampHue") / 100) * 180;
    sat += sym() * (n("stampSat") / 100);
    l += rand() * (n("stampLight") / 100) * 0.5 - rand() * (n("stampDark") / 100) * 0.5;
    let sec = rand() * (n("stampSecondary") / 100);
    if (input.pen) {
      const dyn: [string, number][] = [["pressColor", input.pressure], ["tiltColor", tilt], ["barrelColor", roll]];
      for (const [pre, v] of dyn) {
        h += (n(`${pre}Hue`) / 100) * v * 180;
        sat += (n(`${pre}Sat`) / 100) * v;
        l += (n(`${pre}Bright`) / 100) * v * 0.5;
        sec += (n(`${pre}Secondary`) / 100) * v;
      }
    }
    const [r, g, b] = hslToRgb(...mixHsl([h, sat, l], s.secondary, sec));
    return `rgb(${r},${g},${b})`;
  };

  /** Moving grain: grain pressed into each stamp, sliding with the stroke by Movement. */
  const movingMask = (s: Stroke, pos: Pt, dir: number, ang: number, sx: number, sy: number, sz: number, projSize: number, bleed: number) => {
    const res = s.mask.width;
    if (gscratch.width !== res) gscratch.width = gscratch.height = res;
    gctx.globalCompositeOperation = "source-over";
    gctx.globalAlpha = 1;
    gctx.clearRect(0, 0, res, res);
    gctx.drawImage(s.mask, 0, 0);
    const jitter = o.fast ? 0 : rand() * n("grainDepthJitter");
    const depth = clamp(Math.max(n("grainDepthMin"), n("grainDepth") - jitter) / 100 + bleed);
    const lv = Math.round(depth * 10);
    if (lv <= 0) return gscratch;
    let pat = s.grainLevels[lv];
    if (pat === undefined) {
      const gc = buildGrainCanvas(S, lv / 10, src.grain);
      pat = gc ? gctx.createPattern(gc, "repeat") : null;
      s.grainLevels[lv] = pat;
    }
    if (!pat) return gscratch;
    const m = clamp(n("grainMovement") / 100);
    const theta = dir * (n("grainRotation") / 100) * 180 / Math.PI;
    pat.setTransform(new DOMMatrix()
      .translate(res / 2, res / 2).scale(1 / sx, 1 / sy).rotate((-ang * 180) / Math.PI).scale(res / Math.max(0.1, sz))
      .translate(-pos.x * (1 - m), -pos.y * (1 - m)).rotate(theta).scale(grainPx(projSize, s.dpr))
      .translate(-s.grainOffset.x, -s.grainOffset.y));
    gctx.imageSmoothingEnabled = str("grainFiltering") !== "No filtering";
    gctx.globalCompositeOperation = "destination-in";
    gctx.fillStyle = pat;
    gctx.fillRect(0, 0, res, res);
    gctx.globalCompositeOperation = "source-over";
    return gscratch;
  };

  const drawStamp = (s: Stroke, pos: Pt, angle: number, size: number, sx: number, sy: number, alpha: number, color: string | null, base: HTMLCanvasElement) => {
    if (size <= 0.3 || alpha <= 0.002) return;
    const res = s.mask.width;
    let img: HTMLCanvasElement;
    let ga = clamp(alpha);
    if (s.uniform) ga = Math.sqrt(ga);
    if (s.maxMode) {
      if (base === s.mask) {
        const lv = Math.max(1, Math.round(ga * 64));
        let c = s.levels[lv];
        if (!c) {
          c = mk(); c.width = c.height = res;
          const x = c.getContext("2d")!;
          x.fillStyle = "#000"; x.fillRect(0, 0, res, res);
          x.globalAlpha = lv / 64; x.drawImage(s.mask, 0, 0);
          s.levels[lv] = c;
        }
        img = c;
      } else {
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
      xctx.drawImage(base, 0, 0);
      xctx.globalCompositeOperation = "source-in";
      xctx.fillStyle = color ?? s.rgbStr;
      xctx.fillRect(0, 0, res, res);
      xctx.globalCompositeOperation = "source-over";
      img = scratch;
    }
    const target = s.maxMode ? mctx : s.grainPat || s.threshold ? actx : lctx;
    target.save();
    target.imageSmoothingEnabled = str("shapeFiltering") !== "No filtering";
    target.imageSmoothingQuality = str("shapeFiltering") === "Classic filtering" ? "medium" : "high";
    const normal: GlobalCompositeOperation = s.maxMode ? "lighten" : "source-over";
    target.globalCompositeOperation = normal;
    target.globalAlpha = ga;
    target.translate(pos.x, pos.y);
    target.rotate(angle);
    target.scale(sx, sy);
    const blur = size * ((n("wetEdges") * 0.08 + (s.wet ? n("blur") * 0.12 + rand() * n("blurJitter") * 0.08 : 0)) / 100);
    target.filter = blur > 0 ? `blur(${blur}px)` : "none";
    const burnt = n("burntEdges") / 100;
    if (burnt > 0) {
      target.globalCompositeOperation = s.maxMode ? "lighten" : blendOf(str("burntMode"))[0];
      target.shadowColor = `rgba(0,0,0,${burnt * 0.65})`;
      target.shadowBlur = size * burnt * 0.05;
      target.drawImage(img, -size / 2, -size / 2, size, size);
      target.globalCompositeOperation = normal;
      target.shadowColor = "transparent";
      target.shadowBlur = 0;
    }
    target.drawImage(img, -size / 2, -size / 2, size, size);
    target.restore();
    grow(s, pos.x, pos.y, size * 0.75 + 2 + blur * 2);
  };

  // Places one step of stamps using every per-stamp setting.
  const emit = (s: Stroke, pd: Pending, total: number | null) => {
    const { pos, dir, input } = pd;
    const pen = input.pen, p = pen ? input.pressure : 1, dpr = s.dpr;
    const alt = (1 - input.tilt) * 90, ta = n("tiltAngle") || 90;
    const tilt = pen && alt <= ta ? clamp((ta - alt) / Math.max(1, ta)) : 0;
    const roll = pen ? (((input.twist / (Math.PI * 2)) % 1) + 1) % 1 : 0;
    let size = s.baseSize;
    let alpha = (n("flow") / 100) * s.strength;
    let bleed = 0;
    if (pen) {
      size *= Math.max(0.02, centered(n("pencilPressureSize") / 100, p));
      alpha *= 1 - (n("pencilPressureOpacity") / 100) * (1 - p);
      alpha *= Math.max(0, centered(n("pencilPressureFlow") / 100, p));
      bleed += (n("pencilPressureBleed") / 100) * (1 - p);
      alpha *= 1 - (n("tiltOpacity") / 100) * tilt;
      alpha *= 1 - (n("tiltGradation") / 100) * tilt * 0.5;
      bleed += (n("tiltBleed") / 100) * tilt;
      size *= Math.max(0.05, 1 + (n("barrelSize") / 100) * (roll - 0.5) * 2);
      alpha *= 1 - (n("barrelOpacity") / 100) * roll;
      bleed += (n("barrelBleed") / 100) * roll;
    }
    size = Math.max((MAX_TIP_PX * dpr * s.sizeScale * n("minSize")) / 100, size);
    const untilted = size;
    if (pen) size *= 1 + (n("tiltSize") / 100) * tilt * 2;
    const sp = Math.min(1, pd.speed / (3 * dpr));
    size *= Math.max(0.05, 1 + (n("speedSize") / 100) * sp);
    alpha *= clamp(1 + (n("speedOpacity") / 100) * sp);
    // Taper: purely modulating stamp radius and alpha, zero destructive erasing
    const { startLen, endLen, pre } = getTaperLengths(s, pen);
    const d = pd.distance;

    let tStart = 1.0;
    if (startLen > 0 && d < startLen) {
      tStart = Math.max(0, Math.min(1, d / startLen));
    }

    let tEnd = 1.0;
    if (total !== null && endLen > 0) {
      const distFromEnd = Math.max(0, total - d);
      if (distFromEnd < endLen) {
        let rawTEnd = Math.max(0, Math.min(1, distFromEnd / endLen));
        if (pen) {
          const pressureTaper = n("pTaperPressure") / 100;
          if (pressureTaper > 0) {
            rawTEnd *= (1 - pressureTaper * (1 - Math.max(0, Math.min(1, p))));
          }
        }
        tEnd = rawTEnd;
      }
    }

    const t = Math.min(tStart, tEnd);
    if (t < 1.0) {
      const isClassic = on("classicTaper");
      const tipSlider = n(`${pre}TaperTip`);
      const sharpness = 0.25 + (tipSlider / 100) * 1.75;
      const easedT = isClassic ? t : Math.max(0, Math.min(1, 1 - Math.pow(1 - t, sharpness)));

      const sizeSlider = n(`${pre}TaperSize`);
      const minScale = 1 - (sizeSlider / 100);
      const sizeMult = minScale + (1 - minScale) * easedT;

      const opacitySlider = n(`${pre}TaperOpacity`);
      const minAlpha = 1 - (opacitySlider / 100);
      const opacityMult = minAlpha + (1 - minAlpha) * easedT;

      size *= Math.max(0, sizeMult);
      alpha *= Math.max(0, opacityMult);
    }

    const fallOffVal = n("fallOff");
    if (fallOffVal > 0) {
      const maxDistanceThreshold = Math.max(
        10 * dpr,
        (Math.pow((100 - Math.min(99.9, fallOffVal)) / 100, 2) * 5000 + size * 2) * (s.lenScale || 1)
      );
      alpha *= Math.max(0, 1 - d / maxDistanceThreshold);
    }
    if (s.wet) {
      alpha *= 1 - (n("dilution") / 100) * 0.8;
      const c = n("charge");
      if (c < 100) alpha *= Math.max(0, 1 - d / (((c / 100) ** 2 * 3000 + 50) * dpr * s.lenScale));
      alpha *= 0.15 + 0.85 * (n("attack") / 100);
      const g = n("grade") / 100;
      if (g !== 0) alpha = Math.pow(clamp(alpha), Math.pow(2, -g * 1.5));
    }
    if (!s.movingGrain) alpha *= 1 - Math.min(1, bleed) * 0.6;

    const follow = on("relativeToStroke") ? 1 : n("rotation") / 100;
    let angle = s.baseAngle + dir * follow + (on("relativeToStroke") ? (n("rotation") / 100) * Math.PI : 0);
    if (pen && str("inputStyle") !== "Touch only") angle += input.azimuth;
    if (pen && str("inputStyle") === "Azimuth and barrel roll") angle += input.twist;
    if (on("orientToScreen")) angle -= o.viewRotation?.() ?? 0;
    let round = n("roundness") / 100;
    round *= Math.max(0.05, centered(n("pressureRoundness") / 100, p));
    round *= Math.max(0.05, centered(n("tiltRoundness") / 100, tilt));

    const count = Math.max(1, Math.round(n("count") * (1 - rand() * (n("countJitter") / 100))));
    const tx = Math.cos(dir);
    const ty = Math.sin(dir);
    const nx = -ty;
    const ny = tx;

    const pencilModifier = pen
      ? Math.max(0.1, 1 + (n("pencilPressureSize") / 100) * (p - 0.5) + (n("tiltSize") / 100) * tilt + (n("barrelSize") / 100) * (roll - 0.5))
      : 1;

    const maxLateralOffset = size * (n("jitterLateral") / 100) * pencilModifier;
    const maxLinearOffset = size * (n("jitterLinear") / 100) * pencilModifier;

    for (let c = 0; c < count; c++) {
      const lat = (Math.random() * 2 - 1) * maxLateralOffset;
      const lin = (Math.random() * 2 - 1) * maxLinearOffset;
      const at = { x: pos.x + nx * lat + tx * lin, y: pos.y + ny * lat + ty * lin };

      const sz = size * (1 - rand() * (n("jitterSize") / 100));
      const a = alpha * (1 - rand() * (n("jitterOpacity") / 100)) * (1 - (s.wet ? rand() * (n("wetnessJitter") / 100) : 0));
      const sx = (on("flipX") && rand() < 0.5 ? -1 : 1) * Math.max(0.05, 1 - rand() * (n("roundHJitter") / 100));
      const sy = (on("flipY") && rand() < 0.5 ? -1 : 1) * Math.max(0.05, round * (1 - rand() * (n("roundVJitter") / 100)));
      const ang = angle + sym() * (n("scatter") / 100) * Math.PI;
      const color = s.maxMode || s.tinted ? null : stampColor(s, input, tilt, roll);
      const projSize = (on("tiltSizeCompression") ? untilted : size) * (size > 0 ? sz / size : 1);
      const base = s.movingGrain ? movingMask(s, at, dir, ang, sx, sy, sz, projSize, bleed) : s.mask;
      drawStamp(s, at, ang, sz, sx, sy, a, color, base);
    }
  };

  const redrawStroke = (s: Stroke, totalLen: number | null) => {
    lctx.clearRect(0, 0, cw, ch);
    if (actx) actx.clearRect(0, 0, cw, ch);
    if (mctx) mctx.clearRect(0, 0, cw, ch);
    s.bbox = null;
    s.all = null;
    for (let i = 0; i < s.stamps.length; i++) {
      emit(s, s.stamps[i]!, totalLen);
    }
  };

  const release = (s: Stroke) => {
    // Draw only new stamps each frame; the full taper redraw happens once on lift.
    while (s.pending.length) {
      const pd = s.pending.shift()!;
      s.stamps.push(pd);
      emit(s, pd, null);
    }
  };

  const begin = (raw: BrushInput) => {
    if (stroke) cancel();
    S = withDefaults(o.settings ? o.settings() : activeBrush.settings);
    src = o.sources ? o.sources() : { shape: activeBrush.shape, grain: activeBrush.grain };
    ensure();
    const dpr = o.pixelRatio();
    const sizeScale = o.sizeScale?.() ?? 1;
    const wet = o.wetMix ?? (S["wetMix"] !== false);
    const input = { ...raw, pressure: raw.pen ? pressureResponse(S, raw.pressure) : 1 };
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
    const vary = colorVaries(wet);
    const maxMode = (mode === "Light Glaze" || mode === "Uniformed Glaze") && !vary && !on("classicNormal");
    const strength = mode === "Intense Glaze" ? 1.25 : mode === "Heavy Glaze" ? 1.5 : mode === "Intense Blending" ? 1.2 : 1;
    const texturized = str("grainMode") === "Texturized";
    const hasGrain = !!src.grain;
    const depth = clamp(Math.max(n("grainDepthMin"), n("grainDepth") - rand() * n("grainDepthJitter")) / 100);
    const grainOffset = on("grainOffsetJitter") ? { x: rand() * 2048, y: rand() * 2048 } : { x: 0, y: 0 };
    const res = Math.max(24, Math.min(256, Math.round(baseSize)));
    const mask = buildMask(res, S, 0, { x: 0, y: 0 }, false, src);
    let grainPat: CanvasPattern | null = null;
    if (hasGrain && texturized && depth > 0) {
      const gc = buildGrainCanvas(S, depth, src.grain);
      if (gc) {
        grainPat = lctx.createPattern(gc, "repeat");
        grainPat?.setTransform(new DOMMatrix().rotate((n("grainRotation") / 100) * 180).scale(grainPx(baseSize, dpr)).translate(-grainOffset.x, -grainOffset.y));
      }
    }
    const movingGrain = hasGrain && !texturized &&
      (n("grainDepth") > 0 || n("pencilPressureBleed") > 0 || n("tiltBleed") > 0 || n("barrelBleed") > 0);
    let tinted: HTMLCanvasElement | null = null;
    if (!maxMode && !vary) {
      tinted = mk(); tinted.width = tinted.height = res;
      const tx = tinted.getContext("2d")!;
      tx.drawImage(mask, 0, 0);
      tx.globalCompositeOperation = "source-in";
      tx.fillStyle = rgbStr;
      tx.fillRect(0, 0, res, res);
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
    o.layer.style.opacity = String(opacity);
    o.layer.style.mixBlendMode = on("luminanceBlending") ? "luminosity" : blendOf(str("blendMode"))[1];
    const c = { x: input.x, y: input.y };
    stroke = {
      dpr, sizeScale, lenScale: sizeScale, wet,
      last: input, raw, smooth: c, filtered: c, raws: [c],
      motionHistory: [c], stabBuffer: [{ x: c.x, y: c.y, time: input.time }],
      carry: 0, distance: 0, speed: 0,
      mask, maxMode, uniform: mode === "Uniformed Glaze" || mode === "Uniform Blending", strength, threshold: on("alphaThreshold"),
      movingGrain, grainOffset, grainPat, grainLevels: [],
      hsl, secondary, rgb, rgbStr, baseSize,
      baseAngle: on("randomized") ? rand() * Math.PI * 2 : 0,
      opacity, bbox: null, all: null, tinted, levels: [],
      pending: [{ pos: c, dir: 0, input, distance: 0, speed: 0 }],
      stamps: [{ pos: c, dir: 0, input, distance: 0, speed: 0 }],
    };


    release(stroke);
    schedule();
  };

  const move = (raw: BrushInput, catchUp = false) => {
    const s = stroke;
    if (!s) return;
    if (!catchUp) s.raw = raw;

    // Filter 1: StreamLine Pressure (exponential smoothing)
    const pr = raw.pen ? pressureResponse(S, raw.pressure) : 1;
    const spVal = n("streamlinePressure") / 100;
    const pressureAlpha = spVal <= 0 ? 1 : Math.max(0.05, 1 - spVal * 0.95);
    const input = { ...raw, pressure: s.last.pressure + (pr - s.last.pressure) * pressureAlpha };

    let c: Pt = { x: raw.x, y: raw.y };
    if (!catchUp) {
      let pt: Pt = { x: raw.x, y: raw.y };

      // Filter 2: Motion Filtering (outlier / wobble rejection) & Expression
      const mfVal = n("motionFiltering") / 100;
      if (mfVal > 0) {
        s.motionHistory.push(pt);
        if (s.motionHistory.length >= 3) {
          const p0 = s.motionHistory[s.motionHistory.length - 3]!;
          const p1 = s.motionHistory[s.motionHistory.length - 2]!;
          const p2 = s.motionHistory[s.motionHistory.length - 1]!;
          const cx = p2.x - p0.x;
          const cy = p2.y - p0.y;
          const chordLen = Math.hypot(cx, cy);
          if (chordLen > 1e-4) {
            const dev = Math.abs((p1.x - p0.x) * cy - (p1.y - p0.y) * cx) / chordLen;
            const threshold = mfVal * 25 * s.dpr;
            if (dev < threshold) {
              const tProj = Math.max(0, Math.min(1, ((p1.x - p0.x) * cx + (p1.y - p0.y) * cy) / (chordLen * chordLen)));
              const projX = p0.x + cx * tProj;
              const projY = p0.y + cy * tProj;
              const exprVal = n("motionExpression") / 100;
              const effectiveExpression = exprVal * (1 - mfVal * 0.75);
              pt = {
                x: projX + (p1.x - projX) * effectiveExpression,
                y: projY + (p1.y - projY) * effectiveExpression,
              };
              s.motionHistory[s.motionHistory.length - 2] = pt;
            }
          }
        }
        if (s.motionHistory.length > 6) s.motionHistory.shift();
      } else {
        s.motionHistory = [pt];
      }

      // Filter 3: Stabilization (speed-dependent weighted moving average)
      const stabVal = n("stabilization") / 100;
      let stabPt = pt;
      if (stabVal > 0) {
        const lastSamp = s.stabBuffer[s.stabBuffer.length - 1];
        const dtSamp = Math.max(1, raw.time - (lastSamp ? lastSamp.time : raw.time - 16));
        const dSamp = lastSamp ? Math.hypot(pt.x - lastSamp.x, pt.y - lastSamp.y) : 0;
        const velocity = dSamp / dtSamp;
        const baseWindow = 1 + stabVal * 15;
        const velocityFactor = 1 + Math.min(2.5, velocity * 0.8);
        const windowSize = Math.max(1, Math.round(baseWindow * velocityFactor));

        s.stabBuffer.push({ x: pt.x, y: pt.y, time: raw.time });
        while (s.stabBuffer.length > windowSize) s.stabBuffer.shift();

        let totalWeight = 0;
        let sumX = 0;
        let sumY = 0;
        for (let i = 0; i < s.stabBuffer.length; i++) {
          const w = i + 1;
          sumX += s.stabBuffer[i]!.x * w;
          sumY += s.stabBuffer[i]!.y * w;
          totalWeight += w;
        }
        stabPt = { x: sumX / totalWeight, y: sumY / totalWeight };
      } else {
        s.stabBuffer = [{ x: pt.x, y: pt.y, time: raw.time }];
      }

      // Filter 4: StreamLine Amount (elastic pull-string lag filter)
      const slAmount = n("streamline") / 100;
      const alpha = slAmount <= 0 ? 1 : Math.max(0.05, 1 - slAmount * 0.95);
      c = {
        x: s.smooth.x + (stabPt.x - s.smooth.x) * alpha,
        y: s.smooth.y + (stabPt.y - s.smooth.y) * alpha,
      };
    } else {
      c = { x: raw.x, y: raw.y };
    }

    const dt = Math.max(1, raw.time - s.last.time);
    const dx = c.x - s.last.x, dy = c.y - s.last.y, dist = Math.hypot(dx, dy);
    s.speed = s.speed * 0.7 + Math.min(10 * s.dpr, dist / dt) * 0.3;
    const dir = Math.atan2(dy, dx);
    const sp = Math.min(1, s.speed / (3 * s.dpr));
    if (s.wet && n("pull") > 0) pickUp(s, c);
    const brushDiameter = s.baseSize * (input.pen ? Math.max(0.05, centered(n("pencilPressureSize") / 100, input.pressure)) : 1);
    const spacingVal = n("spacing");
    const spacingJitterVal = n("spacingJitter");
    const speedFactor = 1 + (n("speedSpacing") / 100) * sp * 2;
    const baseStep = Math.max(0.5, brushDiameter * (spacingVal / 100) * speedFactor);

    const spacingJitterFactor = spacingJitterVal / 100;
    const effectiveBase = spacingJitterFactor > 0 ? Math.max(1.5, baseStep) : baseStep;
    const pressureMod = input.pen ? (0.3 + 0.7 * input.pressure) : 1;

    const nextStep = () => {
      if (spacingJitterFactor <= 0) return baseStep;
      return Math.max(0.5, effectiveBase * (1 + Math.random() * spacingJitterFactor * 4 * pressureMod));
    };

    const start = s.distance;
    let t = nextStep() - s.carry, lastT = -1, guard = 0;
    while (t <= dist && guard++ < 4000) {
      const k = dist > 0 ? t / dist : 1;
      s.pending.push({
        pos: { x: s.last.x + dx * k, y: s.last.y + dy * k }, dir,
        input: { ...input, pressure: s.last.pressure + (input.pressure - s.last.pressure) * k },
        distance: start + t, speed: s.speed,
      });
      lastT = t;
      t += nextStep();
    }
    s.carry = lastT >= 0 ? dist - lastT : s.carry + dist;
    s.distance = start + dist;
    s.last = { ...input, x: c.x, y: c.y };
    s.smooth = c;
    release(s);
    schedule();
  };

  const end = () => {
    const s = stroke;
    if (!s) return;
    if (Math.hypot(s.raw.x - s.last.x, s.raw.y - s.last.y) > 0.5) move(s.raw, true);
    release(s);
    if (raf) cancelAnimationFrame(raf);
    flush();
    const { endLen } = getTaperLengths(s, s.last.pen);
    if (endLen > 0) {
      redrawStroke(s, s.distance);
      flush();
    }
    const dctx = o.destination.getContext("2d");

    const b = s.all;
    if (dctx && b) {
      const lum = on("luminanceBlending");
      if (!lum && str("blendMode") === "Subtract") {
        const x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0));
        const w = Math.min(cw, Math.ceil(b.x1)) - x0, h = Math.min(ch, Math.ceil(b.y1)) - y0;
        if (w > 0 && h > 0) {
          const a = dctx.getImageData(x0, y0, w, h), l = lctx.getImageData(x0, y0, w, h);
          for (let k = 0; k < a.data.length; k += 4) {
            const f = ((l.data[k + 3] ?? 0) / 255) * s.opacity;
            for (let j = 0; j < 3; j++) a.data[k + j] = Math.max(0, (a.data[k + j] ?? 0) - (l.data[k + j] ?? 0) * f);
          }
          dctx.putImageData(a, x0, y0);
        }
      } else {
        dctx.save();
        dctx.globalAlpha = s.opacity;
        dctx.globalCompositeOperation = lum ? "luminosity" : blendOf(str("blendMode"))[0];
        dctx.drawImage(o.layer, 0, 0);
        dctx.restore();
      }
    }
    lctx.clearRect(0, 0, cw, ch);
    stroke = null;
  };

  const cancel = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lctx.clearRect(0, 0, o.layer.width, o.layer.height);
    stroke = null;
  };

  return { begin, move: (input: BrushInput) => move(input), end, cancel, active: () => stroke !== null };
}
export type StrokeEngine = ReturnType<typeof createStrokeEngine>;

/** Draws a brush's preview stroke using its Preview settings. */
export function renderBrushPreview(target: HTMLCanvasElement, settings: BrushSettings | undefined, sources: BrushSources, color: string, sizeScale = 1) {
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const w = target.width, h = target.height;
  ctx.clearRect(0, 0, w, h);
  const s = withDefaults(settings);
  const num = (id: string) => { const v = s[id]; return typeof v === "number" ? v : 0; };
  const layer = document.createElement("canvas");
  layer.width = w; layer.height = h;
  const dpr = window.devicePixelRatio || 1;
  const engine = createStrokeEngine({
    destination: target, layer, pixelRatio: () => dpr, color: () => color, settings: () => s, sources: () => sources,
    size: () => num("previewSize"), sizeScale: () => sizeScale, wetMix: s["wetMix"] !== false && s["previewWetMix"] === true, fast: true,
  });
  const pMin = clamp(num("previewPressureMin") / 100), pScale = num("previewPressureScale") / 100;
  const tilt = clamp(Math.abs(num("previewTilt")) / 100);
  const point = (x: number, y: number, pressure: number, time: number): BrushInput => ({ x, y, pressure: clamp(pressure), tilt, azimuth: 0, twist: 0, pen: true, time });
  if (s["previewStamp"] === true) {
    engine.begin(point(w / 2, h / 2, 1, 0));
    engine.end();
    return;
  }
  const pad = h * 0.6, steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = point(pad + t * (w - pad * 2), h / 2 - Math.sin(t * Math.PI * 2) * h * 0.18, pMin + (1 - pMin) * Math.sin(t * Math.PI) * pScale, i * 16);
    if (i === 0) engine.begin(p);
    else engine.move(p);
  }
  engine.end();
}
