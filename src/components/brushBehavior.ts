import { DEFAULT_BRUSH_SETTINGS, type BrushSettings } from "./brushStudioData";

export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const numberSetting = (s: BrushSettings, id: string) => {
  const v = s[id] ?? DEFAULT_BRUSH_SETTINGS[id];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};
export const pressureResponse = (s: BrushSettings, pressure: number) => {
  let points: number[][] = [[0, 0], [1, 1]];
  try {
    const parsed: unknown = JSON.parse(String(s['pressureCurve'] ?? '[[0,0],[1,1]]'));
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((p): p is number[] => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && Number.isFinite(v)));
      points = [[0, 0], ...valid.filter(p => (p[0] ?? 0) > 0 && (p[0] ?? 1) < 1), [1, 1]].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
    }
  } catch { /* Invalid imported curve uses linear pressure. */ }
  const p = clamp(pressure);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!a || !b) continue;
    const ax = a[0] ?? 0, ay = a[1] ?? 0, bx = b[0] ?? 1, by = b[1] ?? 1;
    if (p <= bx) return clamp(ay + (by - ay) * (p - ax) / Math.max(0.0001, bx - ax));
  }
  return 1;
};
export function taperFactors(s: BrushSettings, pen: boolean, distance: number, total: number, size: number, finished: boolean, pressure = 1) {
  const prefix = pen ? 'p' : 't';
  const start = numberSetting(s, `${prefix}TaperLength`) / 100 * size * 10;
  const end = numberSetting(s, `${prefix}TaperEndLength`) / 100 * size * 10;
  const kStart = start > 0 ? clamp(1 - distance / start) : 0;
  const kEnd = finished && end > 0 ? clamp(1 - (total - distance) / end) : 0;
  const k = Math.max(kStart, kEnd);
  const tip = numberSetting(s, `${prefix}TaperTip`) / 100;
  const shape = s['classicTaper'] === true ? k : Math.pow(k, 1 + tip * 3);
  const natural = pen ? 1 - numberSetting(s, 'pTaperPressure') / 100 * (1 - pressure) : 1;
  return { size: clamp((1 - numberSetting(s, `${prefix}TaperSize`) / 100 * shape) * natural), opacity: clamp(1 - numberSetting(s, `${prefix}TaperOpacity`) / 100 * k) };
}
export function grainScale(s: BrushSettings, size = 100, sourceSize = 256) {
  const scale = Math.max(0.01, numberSetting(s, 'grainScale') / 100 * 3);
  if (s['grainMode'] === 'Texturized') return scale;
  const zoom = numberSetting(s, 'grainZoom') / 100;
  return scale * ((1 - zoom) * size / sourceSize + zoom);
}
export function blendValue(mode: string, a: number, b: number) {
  switch (mode) {
    case 'Multiply': return a * b;
    case 'Subtract': return Math.max(0, a - b);
    case 'Overlay': return a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
    case 'Screen': return 1 - (1 - a) * (1 - b);
    case 'Add': return Math.min(1, a + b);
    case 'Darken': return Math.min(a, b);
    case 'Lighten': return Math.max(a, b);
    case 'Color Burn': return b === 0 ? 0 : 1 - Math.min(1, (1 - a) / b);
    case 'Color Dodge': return b === 1 ? 1 : Math.min(1, a / (1 - b));
    default: return b;
  }
}