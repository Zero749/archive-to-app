import { unzipSync } from "fflate";
import { blendValue, grainScale } from "./brushBehavior";
import { ProcreateBrushRenderer, type BrushInput, type BrushTool, type RenderOptions } from "./brushEngine";

import { DEFAULT_BRUSH_SETTINGS, STUDIO_PAGES, type BrushSettings } from "./brushStudioData";
export { DEFAULT_BRUSH_SETTINGS, type BrushSettings } from "./brushStudioData";
export { ProcreateBrushRenderer, type BrushInput, type BrushTool, type RenderOptions };

export type Brush = {
  id: string;
  name: string;
  presetVersion?: number;
  thumb?: string | undefined;
  shape?: string | undefined;
  grain?: string | undefined;
  settings?: BrushSettings;
  resetSettings?: BrushSettings;
  author?: string;
  signature?: string;
  createdAt?: string;
  resetAt?: string;
  procreateArchive?: string;
  bundledShape?: string;
  bundledGrain?: string;
};
export type BrushSet = { id: string; name: string; brushes: Brush[] };
export type Library = { id: string; name: string; sets: BrushSet[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = any;

/** Slider ranges, so imported numbers always fit the Brush Studio sliders. */
const RANGES: Record<string, [number, number]> = {};
for (const sections of Object.values(STUDIO_PAGES))
  for (const { controls } of sections)
    for (const c of controls)
      if (c.kind === "slider") RANGES[c.id] = [c.centered ? -100 : 0, c.max ?? 100];

// [setting id, Procreate Brush.archive keys, scale]
const NUM: [string, string[], number?][] = [
  ["spacing", ["plotSpacing", "spacing", "StrokeSpacing"]],
  ["spacingJitter", ["plotSpacingJitter", "spacingJitter"]],
  ["jitterLateral", ["plotJitter", "jitterLateral"]],
  ["jitterLinear", ["plotJitterLinear", "jitterLinear"]],
  ["fallOff", ["dynamicsFalloff", "plotFalloff", "falloff"]],
  ["streamline", ["plotSmoothing", "streamline", "streamlineAmount"]],
  ["streamlinePressure", ["plotSmoothingPressure", "streamlinePressure"]],
  ["stabilization", ["plotStabilization", "stabilization", "stabilizationAmount"]],
  ["motionFiltering", ["motionFilteringAmount", "motionFiltering"]],
  ["motionExpression", ["motionFilteringExpression"]],
  ["pTaperLength", ["pencilTaperStartLength", "taperStartLength"]],
  ["pTaperEndLength", ["pencilTaperEndLength", "taperEndLength"]],
  ["pTaperSize", ["pencilTaperSize", "taperSize"]],
  ["pTaperOpacity", ["pencilTaperOpacity", "taperOpacity"]],
  ["pTaperPressure", ["pencilTaperPressure", "taperPressure"]],
  ["pTaperTip", ["pencilTaperShape", "taperShape"]],
  ["tTaperLength", ["taperStartLength"]],
  ["tTaperEndLength", ["taperEndLength"]],
  ["tTaperSize", ["taperSize"]],
  ["tTaperOpacity", ["taperOpacity"]],
  ["tTaperTip", ["taperShape"]],
  ["rotation", ["shapeRotation"]],
  ["scatter", ["shapeScatter"]],
  ["count", ["shapeCount"], 1],
  ["countJitter", ["shapeCountJitter"]],
  ["roundness", ["shapeRoundness"]],
  ["roundVJitter", ["shapeRoundnessVerticalJitter"]],
  ["roundHJitter", ["shapeRoundnessHorizontalJitter"]],
  ["pressureRoundness", ["dynamicsPressureRoundness", "shapePressureRoundness"]],
  ["tiltRoundness", ["dynamicsTiltRoundness", "shapeTiltRoundness"]],
  ["grainMovement", ["textureMovement"]],
  ["grainScale", ["textureScale"]],
  ["grainZoom", ["textureZoom"]],
  ["grainRotation", ["textureRotation"]],
  ["grainDepth", ["textureDepth"]],
  ["grainDepthMin", ["textureDepthMinimum"]],
  ["grainDepthJitter", ["textureDepthJitter"]],
  ["grainBrightness", ["textureBrightness"]],
  ["grainContrast", ["textureContrast"]],
  ["flow", ["dynamicsGlazedFlow", "renderingFlow", "flow"]],
  ["wetEdges", ["dynamicsWetEdges"]],
  ["burntEdges", ["dynamicsBurntEdges"]],
  ["dilution", ["dynamicsMix"]],
  ["charge", ["dynamicsLoad"]],
  ["attack", ["dynamicsWetAccumulation"]],
  ["pull", ["dynamicsPull"]],
  ["grade", ["dynamicsGrade"]],
  ["blur", ["dynamicsBlur"]],
  ["blurJitter", ["dynamicsBlurJitter"]],
  ["wetnessJitter", ["dynamicsWetnessJitter"]],
  ["stampHue", ["dynamicsJitterHue"]],
  ["stampSat", ["dynamicsJitterSaturation"]],
  ["stampLight", ["dynamicsJitterLightness", "dynamicsJitterBrightness"]],
  ["stampDark", ["dynamicsJitterDarkness"]],
  ["stampSecondary", ["dynamicsJitterSecondaryColor"]],
  ["strokeHue", ["dynamicsJitterStrokeHue"]],
  ["strokeSat", ["dynamicsJitterStrokeSaturation"]],
  ["strokeLight", ["dynamicsJitterStrokeLightness", "dynamicsJitterStrokeBrightness"]],
  ["strokeDark", ["dynamicsJitterStrokeDarkness"]],
  ["strokeSecondary", ["dynamicsJitterStrokeSecondaryColor"]],
  ["pressColorSecondary", ["dynamicsPressureSecondaryColor"]],
  ["tiltColorSecondary", ["dynamicsTiltSecondaryColor"]],
  ["barrelColorSecondary", ["dynamicsBarrelRollSecondaryColor"]],
  ["pressColorHue", ["dynamicsPressureHue"]],
  ["pressColorSat", ["dynamicsPressureSaturation"]],
  ["pressColorBright", ["dynamicsPressureBrightness"]],
  ["tiltColorHue", ["dynamicsTiltHue"]],
  ["tiltColorSat", ["dynamicsTiltSaturation"]],
  ["tiltColorBright", ["dynamicsTiltBrightness"]],
  ["barrelColorHue", ["dynamicsBarrelRollHue"]],
  ["barrelColorSat", ["dynamicsBarrelRollSaturation"]],
  ["barrelColorBright", ["dynamicsBarrelRollBrightness"]],
  ["speedSize", ["dynamicsSpeedSize"]],
  ["speedOpacity", ["dynamicsSpeedOpacity"]],
  ["speedSpacing", ["dynamicsSpeedSpacing"]],
  ["jitterSize", ["dynamicsJitterSize"]],
  ["jitterOpacity", ["dynamicsJitterOpacity"]],
  ["pencilPressureSize", ["dynamicsPressureSize", "pressureSize"]],
  ["pencilPressureOpacity", ["dynamicsPressureOpacity", "pressureOpacity"]],
  ["pencilPressureFlow", ["dynamicsPressureFlow"]],
  ["pencilPressureBleed", ["dynamicsPressureBleed"]],
  ["tiltOpacity", ["dynamicsTiltOpacity"]],
  ["tiltGradation", ["dynamicsTiltGradation"]],
  ["tiltBleed", ["dynamicsTiltBleed"]],
  ["tiltSize", ["dynamicsTiltSize"]],
  ["barrelSize", ["dynamicsBarrelRollSize"]],
  ["barrelOpacity", ["dynamicsBarrelRollOpacity"]],
  ["barrelBleed", ["dynamicsBarrelRollBleed"]],
  ["tiltAngle", ["dynamicsTiltAngle"], 1],
  ["smudgePull", ["smudgePull", "dynamicsSmudgePull"]],
  ["brushSize", ["paintSize"]],
  ["brushOpacity", ["paintOpacity"]],
  ["maxSize", ["maxSize", "sizeMax"]],
  ["minSize", ["minSize", "sizeMin"]],
  ["maxOpacity", ["maxOpacity", "opacityMax"]],
  ["minOpacity", ["minOpacity", "opacityMin"]],
];
const BOOL: [string, string[]][] = [
  ["randomized", ["shapeRandomise", "shapeRandomize"]],
  ["flipX", ["shapeFlipXJitter", "flipX"]],
  ["flipY", ["shapeFlipYJitter", "flipY"]],
  ["grainOffsetJitter", ["textureOffsetJitter"]],
  ["shapeInverted", ["shapeInverted"]],
  ["grainInverted", ["textureInverted"]],
  ["orientToScreen", ["oriented", "orientToScreen"]],
  ["relativeToStroke", ["relativeToStroke", "orientToStroke"]],
  ["pTaperLink", ["pencilTaperLink"]],
  ["tTaperLink", ["taperLink"]],
  ["pTaperAnim", ["pencilTaperAnimation", "taperAnimation"]],
  ["tiltSizeCompression", ["dynamicsTiltSizeCompression"]],
  ["luminanceBlending", ["dynamicsLuminanceBlending"]],
  ["classicTaper", ["classicTaper"]],
  ["classicNormal", ["classicNormal"]],
];
const TEXT: [string, string[]][] = [
  ["burntMode", ["dynamicsBurntEdgesMode", "burntEdgesMode"]],
  ["blendMode", ["renderingBlendMode", "blendMode"]],
  ["grainBlend", ["textureBlendMode", "grainBlendMode"]],
];

function extractProcreateSettings(plist: P): BrushSettings {
  const s: BrushSettings = { ...DEFAULT_BRUSH_SETTINGS };
  if (!plist || typeof plist !== "object") return s;
  const objs = Array.isArray(plist.$objects) ? plist.$objects : [plist];
  const resolve = (value: P): P => {
    const seen = new Set<number>();
    while (value && typeof value === "object" && "UID" in value) {
      const index = value.UID;
      if (typeof index !== "number" || seen.has(index) || !objs[index]) break;
      seen.add(index);
      value = objs[index];
    }
    return value;
  };
  const findVal = (key: string): unknown => {
    for (const obj of objs) {
      if (obj && typeof obj === "object" && !Array.isArray(obj) && key in obj) {
        return resolve(obj[key]);
      }
    }
    return undefined;
  };
  const num = (keys: string[]) => {
    for (const k of keys) {
      const v = findVal(k);
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return undefined;
  };
  const bool = (keys: string[]) => {
    for (const k of keys) {
      const v = findVal(k);
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v !== 0;
    }
    return undefined;
  };
  for (const [id, keys, scale = 100] of NUM) {
    const v = num(keys);
    if (v === undefined) continue;
    const [lo, hi] = RANGES[id] ?? [-Infinity, Infinity];
    s[id] = Math.round(Math.max(lo, Math.min(hi, v * scale)));
  }
  for (const [id, keys] of BOOL) {
    const v = bool(keys);
    if (v !== undefined) s[id] = v;
  }
  for (const [id, keys] of TEXT) {
    const value = keys.map(findVal).find((v) => typeof v === "string");
    if (typeof value === "string") s[id] = value;
  }
  const recursive = bool(["renderingRecursiveMixing"]);
  const maxT = bool(["renderingMaxTransfer"]);
  const mod = bool(["renderingModulatedTransfer"]);
  if (recursive) s["renderingMode"] = mod ? "Uniform Blending" : "Intense Blending";
  else if (maxT && mod) s["renderingMode"] = "Heavy Glaze";
  else if (maxT) s["renderingMode"] = "Intense Glaze";
  else if (mod) s["renderingMode"] = "Uniformed Glaze";
  else s["renderingMode"] = "Light Glaze";

  // Procreate uses textureApplication: 1 for Texturized, 0 for Moving
  const texApp = findVal("textureApplication");
  if (texApp === 1 || texApp === "1" || bool(["textureTexturized", "texturized"])) {
    s["grainMode"] = "Texturized";
  } else {
    s["grainMode"] = "Moving";
  }

  // Respect texture and shape inversion directly from Procreate
  const texInv = bool(["textureInverted"]);
  if (texInv !== undefined) s["grainInverted"] = texInv;
  const shpInv = bool(["shapeInverted"]);
  if (shpInv !== undefined) s["shapeInverted"] = shpInv;

  return s;
}


export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function parseBplist(b: Uint8Array): P {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const readN = (o: number, n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + b[o + i]!;
    return v;
  };
  const t = b.length - 32;
  const offSize = b[t + 6]!;
  const refSize = b[t + 7]!;
  const top = readN(t + 16, 8);
  const tableOff = readN(t + 24, 8);
  const latin = new TextDecoder("latin1");
  const parse = (i: number): P => {
    let o = readN(tableOff + i * offSize, offSize);
    const m = b[o]!;
    const hi = m >> 4;
    const lo = m & 15;
    const len = () => {
      if (lo !== 15) {
        o += 1;
        return lo;
      }
      const n = 1 << (b[o + 1]! & 15);
      const v = readN(o + 2, n);
      o += 2 + n;
      return v;
    };
    switch (hi) {
      case 0:
        return lo === 8 ? false : lo === 9 ? true : null;
      case 1:
        return readN(o + 1, 1 << lo);
      case 2:
        return lo === 2 ? dv.getFloat32(o + 1) : dv.getFloat64(o + 1);
      case 3:
        return dv.getFloat64(o + 1);
      case 4: {
        const n = len();
        return b.subarray(o, o + n);
      }
      case 5: {
        const n = len();
        return latin.decode(b.subarray(o, o + n));
      }
      case 6: {
        const n = len();
        let s = "";
        for (let k = 0; k < n; k++) s += String.fromCharCode(dv.getUint16(o + k * 2));
        return s;
      }
      case 8:
        return { UID: readN(o + 1, lo + 1) };
      case 10:
      case 12: {
        const n = len();
        const a: P[] = [];
        for (let k = 0; k < n; k++) a.push(parse(readN(o + k * refSize, refSize)));
        return a;
      }
      case 13: {
        const n = len();
        const d: Record<string, P> = {};
        for (let k = 0; k < n; k++)
          d[String(parse(readN(o + k * refSize, refSize)))] = parse(
            readN(o + (n + k) * refSize, refSize),
          );
        return d;
      }
      default:
        return null;
    }
  };
  return parse(top);
}

function parseXml(el: Element): P {
  const kids = Array.from(el.children);
  switch (el.tagName) {
    case "plist":
      return kids[0] ? parseXml(kids[0]) : null;
    case "dict": {
      const d: Record<string, P> = {};
      for (let i = 0; i + 1 < kids.length; i += 2)
        d[kids[i]!.textContent ?? ""] = parseXml(kids[i + 1]!);
      return d;
    }
    case "array":
      return kids.map(parseXml);
    case "integer":
    case "real":
      return Number(el.textContent);
    case "true":
      return true;
    case "false":
      return false;
    default:
      return el.textContent;
  }
}

function parsePlist(b: Uint8Array): P {
  try {
    const head = new TextDecoder().decode(b.subarray(0, 8));
    if (head.startsWith("bplist")) return parseBplist(b);
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(b), "text/xml");
    return parseXml(doc.documentElement);
  } catch {
    return null;
  }
}

function plistName(p: P): string | undefined {
  let out: string | undefined;
  if (!p || typeof p !== "object") return out;
  if (typeof p.name === "string") return p.name;
  const objs = p.$objects;
  if (Array.isArray(objs)) {
    const root = objs[p.$top?.root?.UID ?? 1];
    const n = root?.name;
    if (typeof n === "string") return n;
    if (n && typeof n === "object" && "UID" in n && typeof objs[n.UID] === "string")
      out = objs[n.UID];
  }
  return out;
}

const toDataUrl = (d: Uint8Array) => {
  let s = "";
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return "data:image/png;base64," + btoa(s);
};

function findImg(files: Record<string, Uint8Array>, dir: string, re: RegExp) {
  const k = Object.keys(files).find((p) => p.startsWith(dir) && re.test(p.slice(dir.length)));
  return k ? toDataUrl(files[k]!) : undefined;
}

/** Generates standard procedural shapes for Procreate's bundled shape presets */
function synthesizeBundledShape(presetName: string, brushName: string): string {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const imgData = ctx.createImageData(128, 128);
  const d = imgData.data;
  const isChisel = /flat|marker|calligraphy|chisel|ribbon/i.test(presetName) || /calligraphy|flat/i.test(brushName);
  const isHard = /hard|ink|technical|mono|pen/i.test(presetName) || /pen|mono|hard|technical/i.test(brushName);
  const isMess = /mess|grunge|splatter|blotch|dab|burst|charcoal|sponge|dry/i.test(presetName) || /charcoal|spray|grunge|splatter|bleed/i.test(brushName);
  const isMedium = /medium/i.test(presetName);

  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const idx = (y * 128 + x) * 4;
      const nx = (x - 64) / 64;
      const ny = (y - 64) / 64;
      let alpha = 0;

      if (isChisel) {
        // Oval / calligraphy angle
        const dist = Math.hypot(nx * 1.8, ny * 0.6);
        alpha = dist < 0.9 ? 1 : Math.max(0, 1 - (dist - 0.9) / 0.1);
      } else if (isMess) {
        // Textured organic stamp
        const dist = Math.hypot(nx, ny);
        const noise = (Math.sin(x * 12.3 + y * 4.1) * 0.5 + 0.5) * (Math.cos(x * 3.7 - y * 8.9) * 0.5 + 0.5);
        if (dist < 0.95) {
          alpha = (1 - dist) * (0.4 + 0.6 * noise);
        }
      } else if (isHard) {
        // Sharp round ink/pen tip
        const dist = Math.hypot(nx, ny);
        alpha = dist <= 0.96 ? 1 : Math.max(0, 1 - (dist - 0.96) / 0.04);
      } else if (isMedium) {
        // Medium soft round
        const dist = Math.hypot(nx, ny);
        alpha = dist <= 0.6 ? 1 : Math.max(0, 0.5 + 0.5 * Math.cos((Math.PI * (dist - 0.6)) / 0.4));
      } else {
        // Soft airbrush
        const dist = Math.hypot(nx, ny);
        alpha = dist < 1 ? Math.max(0, 0.5 + 0.5 * Math.cos(Math.PI * dist)) : 0;
      }

      d[idx] = d[idx + 1] = d[idx + 2] = 255;
      d[idx + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL("image/png");
}

/** Generates standard procedural grain textures for Procreate's bundled grain presets */
function synthesizeBundledGrain(presetName: string, brushName: string): string | undefined {
  if (/blank/i.test(presetName) && !/charcoal|water|gouache|pencil|grunge/i.test(brushName)) return undefined;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const imgData = ctx.createImageData(128, 128);
  const d = imgData.data;
  const isCanvas = /canvas|linen|weave/i.test(presetName) || /canvas/i.test(brushName);
  const isPaper = /paper|board|rough|cotton/i.test(presetName) || /pencil|sketch|chalk/i.test(brushName);

  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const idx = (y * 128 + x) * 4;
      let val = 0.5;
      if (isCanvas) {
        val = 0.5 + 0.3 * Math.sin(x * 0.8) * Math.sin(y * 0.8);
      } else if (isPaper) {
        val = 0.4 + 0.35 * (Math.sin(x * 0.4 + y * 0.3) * 0.5 + 0.5) + (Math.random() - 0.5) * 0.25;
      } else {
        // Generic speckled grain
        val = 0.3 + 0.5 * Math.random();
      }
      const b = Math.round(Math.max(0, Math.min(1, val)) * 255);
      d[idx] = d[idx + 1] = d[idx + 2] = b;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL("image/png");
}

const trim = (p: string) => p.replace(/\/$/, "");
const lastSeg = (p: string) => trim(p).split("/").pop() ?? "";
export const stripExt = (n: string) => n.replace(/\.[^.]+$/, "");

/** Reads a .brush / .brushset / .brushlibrary file into brush sets. */
export function parseArchive(bytes: Uint8Array, base: string): BrushSet[] {
  const files = unzipSync(bytes, {
    filter: (f) => /(\.json|\.plist|\.archive|\.png|\.jpe?g|\.brush|\.brushset)$/i.test(f.name),
  });
  const manifest = files["CanvasBrush.json"];
  if (manifest) {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(manifest));
    if (!parsed || typeof parsed !== 'object' || !('format' in parsed) || parsed.format !== 'canvas-brush' || !('version' in parsed) || parsed.version !== 1 || !('sets' in parsed) || !Array.isArray(parsed.sets)) throw new Error('Unsupported Canvas brush format');
    return parsed.sets.map((set: unknown) => {
      if (!set || typeof set !== 'object' || !('name' in set) || typeof set.name !== 'string' || !('brushes' in set) || !Array.isArray(set.brushes)) throw new Error('Invalid brush set');
      return { id: uid(), name: set.name, brushes: set.brushes.map((b: unknown): Brush => {
        if (!b || typeof b !== 'object' || !('name' in b) || typeof b.name !== 'string') throw new Error('Invalid brush');
        const brush = b as Brush;
        for (const value of Object.values(brush.settings ?? {})) if (!['number', 'boolean', 'string'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Invalid setting');
        for (const image of [brush.shape, brush.grain, brush.thumb]) if (image && !/^data:image\/(png|jpeg|webp);base64,/i.test(image)) throw new Error('Exported brush sources must be embedded');
        return { ...brush, id: uid(), settings: withDefaults(brush.settings) };
      }) };
    });
  }
  const sets: BrushSet[] = [];
  const loose: Brush[] = [];
  const brushDirs = new Map<string, Brush>();

  for (const [path, data] of Object.entries(files)) {
    if (/\.brushset$/i.test(path)) sets.push(...parseArchive(data, stripExt(lastSeg(path))));
    else if (/\.brush$/i.test(path))
      loose.push(...parseArchive(data, stripExt(lastSeg(path))).flatMap((s) => s.brushes));
    else if (/(^|\/)Brush\.archive$/.test(path) && !/(^|\/)Reset\//i.test(path)) {
      const dir = path.slice(0, -"Brush.archive".length);
      const thumb = files[dir + "QuickLook/Thumbnail.png"];
      const parsed = parsePlist(data);
      const name = plistName(parsed) ?? (dir ? lastSeg(dir) : base);
      let shape = findImg(files, dir, /^shape[^/]*\.(png|jpe?g)$/i);
      let grain = findImg(files, dir, /^grain[^/]*\.(png|jpe?g)$/i);

      // Extract bundled presets from $objects if physical files are omitted
      const objs = Array.isArray(parsed?.$objects) ? parsed.$objects : [];
      const resolveObj = (v: any): any => (v && typeof v === "object" && "UID" in v ? objs[v.UID] : v);
      let bundledShape = "";
      let bundledGrain = "";
      for (const obj of objs) {
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          if ("bundledShapePath" in obj) bundledShape = String(resolveObj(obj.bundledShapePath) ?? "");
          if ("bundledGrainPath" in obj) bundledGrain = String(resolveObj(obj.bundledGrainPath) ?? "");
        }
      }

      if (!shape) {
        shape = synthesizeBundledShape(bundledShape, name);
      }
      if (!grain && bundledGrain && !/blank/i.test(bundledGrain)) {
        grain = synthesizeBundledGrain(bundledGrain, name);
      }

      const settings = extractProcreateSettings(parsed);
      brushDirs.set(dir, {
        id: uid(),
        name,
        thumb: thumb ? toDataUrl(thumb) : undefined,
        shape,
        grain,
        settings,
        resetSettings: { ...settings },
        procreateArchive: toDataUrl(data).split(',')[1] ?? '',
        bundledShape,
        bundledGrain,
      });
    }
  }

  const setPlists = Object.keys(files)
    .filter((p) => /(^|\/)brushset\.plist$/i.test(p))
    .sort((a, b) => b.length - a.length);
  for (const p of setPlists) {
    const dir = p.slice(0, -"brushset.plist".length);
    const plist = parsePlist(files[p]!);
    const order: string[] = Array.isArray(plist?.brushes) ? plist.brushes : [];
    const idx = (d: string) => {
      const i = order.indexOf(lastSeg(d));
      return i < 0 ? 1e9 : i;
    };
    const mine = [...brushDirs.keys()]
      .filter((d) => d.startsWith(dir))
      .sort((a, b) => idx(a) - idx(b));
    const brushes = mine.map((d) => {
      const br = brushDirs.get(d)!;
      brushDirs.delete(d);
      return br;
    });
    sets.push({ id: uid(), name: plistName(plist) ?? (dir ? lastSeg(dir) : base), brushes });
  }

  const rest = [...loose, ...brushDirs.values()];
  if (rest.length) sets.push({ id: uid(), name: base, brushes: rest });
  return sets;
}

// ---- Active brush: settings + tip/grain pictures used by the canvas ----
export type PixelMap = { w: number; h: number; v: Float32Array; brightBg: boolean };

export const activeBrush: {
  id: string | null;
  settings: BrushSettings;
  shape: PixelMap | null;
  grain: PixelMap | null;
} = { id: null, settings: { ...DEFAULT_BRUSH_SETTINGS }, shape: null, grain: null };

export const withDefaults = (s?: BrushSettings): BrushSettings => ({
  ...DEFAULT_BRUSH_SETTINGS,
  ...(s ?? {}),
});

const loadImg = (src?: string) =>
  src
    ? new Promise<HTMLImageElement | null>((r) => {
        const i = new Image();
        i.onload = () => r(i);
        i.onerror = () => r(null);
        i.src = src;
      })
    : Promise.resolve(null);

/** Reads a picture into brightness (or transparency) values, 0..1. */
function toPixelMap(img: HTMLImageElement | null, cap: number, shape = true): PixelMap | null {
  if (!img || !img.width || !img.height) return null;
  const k = Math.min(1, cap / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  let hasAlpha = false;
  for (let i = 3; i < d.length; i += 4)
    if (d[i]! < 245) {
      hasAlpha = true;
      break;
    }
  const v = new Float32Array(w * h);
  for (let i = 0; i < v.length; i++) {
    const lum = (d[i * 4]! + d[i * 4 + 1]! + d[i * 4 + 2]!) / 765;
    v[i] = shape && hasAlpha ? d[i * 4 + 3]! / 255 : lum * d[i * 4 + 3]! / 255;
  }
  // Never guess inversion from pixel 0,0 — always respect brush settings
  return { w, h, v, brightBg: false };
}

export function setActiveSettings(s: BrushSettings) {
  activeBrush.settings = withDefaults(s);
}

export async function brushSources(b: Brush) {
  const [shape, grain] = await Promise.all([loadImg(b.shape), loadImg(b.grain)]);
  return { shape: toPixelMap(shape, 1024, true), grain: toPixelMap(grain, 1024, false) };
}
let selectionVersion = 0;
export async function selectBrush(b: Brush) {
  const version = ++selectionVersion;
  activeBrush.id = b.id;
  activeBrush.settings = withDefaults(b.settings);
  const sources = await brushSources(b);
  if (version !== selectionVersion) return;
  activeBrush.shape = sources.shape;
  activeBrush.grain = sources.grain;
}

const num = (s: BrushSettings, id: string) => {
  const v = s[id];
  return typeof v === "number" ? v : Number(DEFAULT_BRUSH_SETTINGS[id] ?? 0);
};

/** Grain value 0..1 (1 = paint shows) at grain-picture coordinates, with brightness/contrast. */
function grainValue(s: BrushSettings, gx: number, gy: number, g = activeBrush.grain) {
  if (!g) return 1;
  const x = ((Math.floor(gx) % g.w) + g.w) % g.w;
  const y = ((Math.floor(gy) % g.h) + g.h) % g.h;
  let v = g.v[y * g.w + x]!;
  if (s["grainInverted"] === true) v = 1 - v;
  v = (v - 0.5) * (1 + num(s, "grainContrast") / 100) + 0.5 + num(s, "grainBrightness") / 200;
  return Math.max(0, Math.min(1, v));
}

const applyGrain = (s: BrushSettings, a: number, g: number, depth: number) => {
  const mode = String(s['grainBlend']);
  const texture = mode === 'Subtract' ? 1 - g : g;
  return Math.max(0, Math.min(1, a + (blendValue(mode, a, texture) - a) * depth));
};

/** Grain pixels per canvas/tip pixel, from Scale and Zoom. */
const grainStep = (s: BrushSettings) =>
  1 / grainScale(s);

/**
 * Builds the brush tip as a white picture whose transparency is the tip shape.
 * When `movingGrain` is true the grain is baked into the tip (Procreate "Moving" grain).
 */
export function buildMask(
  res: number,
  s: BrushSettings,
  depth: number,
  offset: { x: number; y: number },
  movingGrain: boolean,
  sources?: { shape: PixelMap | null; grain: PixelMap | null },
) {
  const c = document.createElement("canvas");
  c.width = c.height = res;
  const x = c.getContext("2d")!;
  const img = x.createImageData(res, res);
  const p = img.data;
  const sh = sources ? sources.shape : activeBrush.shape;
  const invert = sh ? s["shapeInverted"] === true || sh.brightBg : false;
  const hard = Math.min(0.999, num(s, "hardness") / 100);
  const rot = (num(s, "grainRotation") / 100) * Math.PI;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const gk = grainStep(s);
  const useGrain = movingGrain && activeBrush.grain && depth > 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      let a: number;
      if (sh) {
        const sx = Math.min(sh.w - 1, Math.floor(((i + 0.5) / res) * sh.w));
        const sy = Math.min(sh.h - 1, Math.floor(((j + 0.5) / res) * sh.h));
        a = sh.v[sy * sh.w + sx]!;
        if (invert) a = 1 - a;
      } else {
        const d = Math.hypot(i + 0.5 - res / 2, j + 0.5 - res / 2) / (res / 2);
        a = d >= 1 ? 0 : d <= hard ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (d - hard)) / (1 - hard));
      }
      if (useGrain && a > 0) {
        const u = (i - res / 2) * gk;
        const v = (j - res / 2) * gk;
        a = applyGrain(
          s,
          a,
          grainValue(s, u * cr - v * sr + offset.x, u * sr + v * cr + offset.y),
          depth,
        );
      }
      const k = (j * res + i) * 4;
      p[k] = p[k + 1] = p[k + 2] = 255;
      p[k + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** Grain as a white picture whose transparency is how much paint shows (canvas-fixed grain). */
export function buildGrainCanvas(s: BrushSettings, depth: number, g = activeBrush.grain): HTMLCanvasElement | null {
  if (!g || depth <= 0) return null;
  const c = document.createElement("canvas");
  c.width = g.w;
  c.height = g.h;
  const x = c.getContext("2d")!;
  const img = x.createImageData(g.w, g.h);
  const p = img.data;
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const k = (j * g.w + i) * 4;
      p[k] = p[k + 1] = p[k + 2] = 255;
      p[k + 3] = Math.round(applyGrain(s, 1, grainValue(s, i, j, g), depth) * 255);
    }
  x.putImageData(img, 0, 0);
  return c;
}

/** Maps grain-picture space onto canvas space (Scale, Zoom, Rotation, offset). */
export function grainTransform(s: BrushSettings, offset: { x: number; y: number }) {
  const deg = (num(s, "grainRotation") / 100) * 180;
  return new DOMMatrix()
    .rotate(-deg)
    .scale(1 / grainStep(s))
    .translate(-offset.x, -offset.y);
}

/** "Texturized" grain: multiplier for paint at a canvas position. */
export function texturedGrainAt(
  s: BrushSettings,
  cx: number,
  cy: number,
  depth: number,
  offset: { x: number; y: number },
) {
  const gk = grainStep(s);
  const rot = (num(s, "grainRotation") / 100) * Math.PI;
  const gx = (cx * Math.cos(rot) - cy * Math.sin(rot)) * gk + offset.x;
  const gy = (cx * Math.sin(rot) + cy * Math.cos(rot)) * gk + offset.y;
  return applyGrain(s, 1, grainValue(s, gx, gy), depth);
}

// ---- Color helpers ----
export function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255 || 0;
  const g = parseInt(h.slice(2, 4), 16) / 255 || 0;
  const b = parseInt(h.slice(4, 6), 16) / 255 || 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
