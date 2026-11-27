// Complete Procreate-Style Brush Engine
// Built from scratch to match Procreate's behavior exactly
// Based on Procreate 5.4+ brush documentation and behavior

import type { BrushSettings, PixelMap } from './brushImport';

export type BrushTool = 'paint' | 'smudge' | 'erase';
export type BrushInput = {
  x: number;
  y: number;
  pressure: number;
  tilt: number;
  azimuth: number;
  twist: number;
  pen: boolean;
  time: number;
};

export type RenderOptions = {
  color: string;
  secondaryColor?: string;
  size?: number;
  opacity?: number;
  pixelRatio?: number;
  rotation?: number;
  tool?: BrushTool;
  preview?: boolean;
  settings?: BrushSettings;
  sources?: { shape: PixelMap | null; grain: PixelMap | null };
};

export type BrushRenderer = {
  start(input: BrushInput): void;
  move(input: BrushInput): void;
  end(commit?: boolean): void;
  cancel(): void;
};

export class ProcreateBrushRenderer implements BrushRenderer {
  private s: BrushSettings;
  private options: RenderOptions;
  private ctx: CanvasRenderingContext2D;
  private stamps: BrushStamp[] = [];
  private last: BrushInput | null = null;
  private recent: BrushInput[] = [];
  private distance = 0;
  private carry = 0;
  private seed = Math.floor(Math.random() * 214748366) + 1;
  private baseSeed = this.seed;
  private frame = 0;
  private baseSize: number;
  private baseColor: [number, number, number];
  private secondary: [number, number, number];
  private tip: HTMLCanvasElement;
  private grain: HTMLCanvasElement | null;
  private paint: HTMLCanvasElement;
  private paintCtx: CanvasRenderingContext2D;
  private tipWork: HTMLCanvasElement;
  private tipCtx: CanvasRenderingContext2D;
  private offset: { x: number; y: number };
  private grainSource: PixelMap | null;
  private whiteTip = false;

  constructor(
    private destination: HTMLCanvasElement,
    private layer: HTMLCanvasElement,
    options: RenderOptions
  ) {
    const ctx = layer.getContext('2d');
    if (!ctx) throw new Error('Canvas drawing is unavailable');
    this.ctx = ctx;
    this.options = options;
    this.s = this.withDefaults(options.settings || {});

    this.grainSource = options.sources?.grain ?? null;
    const dpr = options.pixelRatio ?? 1;
    const min = this.numberSetting('minSize');
    const max = Math.max(min, this.numberSetting('maxSize'));
    const size = options.size ?? this.numberSetting(options.preview ? 'previewSize' : 'brushSize');

    this.baseSize = Math.max(0.5, 80 * dpr * (min + (max - min) * size / 100) / 100);
    this.secondary = this.hexToHsl(options.secondaryColor ?? '#000000');
    this.baseColor = this.hexToHsl(options.color);
    this.baseColor[0] += this.random() * this.numberSetting('strokeHue') * 1.8;
    this.baseColor[1] += this.random() * this.numberSetting('strokeSat') / 100;
    this.baseColor[2] += this.random() * this.numberSetting('strokeLight') / 200 - this.random() * this.numberSetting('strokeDark') / 200;
    this.baseColor = this.mix(this.baseColor, this.secondary, this.random() * this.numberSetting('strokeSecondary') / 100);

    this.offset = this.booleanSetting('grainOffsetJitter') && this.stringSetting('grainMode') === 'Moving'
      ? { x: this.random() * 1024, y: this.random() * 1024 }
      : { x: 0, y: 0 };

    const res = Math.max(64, Math.min(512, Math.ceil(this.baseSize * 2)));
    this.tip = this.buildMask(res, this.s, 0, { x: 0, y: 0 }, false, options.sources);
    this.grain = this.buildGrainCanvas(this.s, this.numberSetting('grainDepth') / 100, this.grainSource);

    this.paint = document.createElement('canvas');
    this.paint.width = layer.width;
    this.paint.height = layer.height;
    const pc = this.paint.getContext('2d');
    this.tipWork = document.createElement('canvas');
    this.tipWork.width = this.tipWork.height = res;
    const tc = this.tipWork.getContext('2d');

    if (!pc || !tc) throw new Error('Canvas drawing is unavailable');
    this.paintCtx = pc;
    this.tipCtx = tc;
    this.baseSeed = this.seed;
    this.whiteTip = /shape-(14|16|17|18|31)\.png/.test(JSON.stringify(this.s));
  }

  private withDefaults(s?: BrushSettings): BrushSettings {
    return {
      ...this.getDefaultSettings(),
      ...(s ?? {})
    };
  }

  private getDefaultSettings(): BrushSettings {
    return {
      spacing: 20,
      spacingJitter: 0,
      jitterLateral: 0,
      jitterLinear: 0,
      fallOff: 0,
      streamline: 0,
      streamlinePressure: 0,
      stabilization: 0,
      motionFiltering: 0,
      motionExpression: 0,
      pTaperLength: 0,
      pTaperEndLength: 0,
      pTaperSize: 0,
      pTaperOpacity: 0,
      pTaperPressure: 0,
      pTaperTip: 0,
      tTaperLength: 0,
      tTaperEndLength: 0,
      tTaperSize: 0,
      tTaperOpacity: 0,
      tTaperTip: 0,
      rotation: 0,
      scatter: 0,
      count: 1,
      countJitter: 0,
      roundness: 100,
      roundVJitter: 0,
      roundHJitter: 0,
      pressureRoundness: 0,
      tiltRoundness: 0,
      grainMovement: 0,
      grainScale: 100,
      grainZoom: 50,
      grainRotation: 0,
      grainDepth: 0,
      grainDepthMin: 0,
      grainDepthJitter: 0,
      grainBrightness: 0,
      grainContrast: 0,
      flow: 100,
      wetEdges: 0,
      burntEdges: 0,
      dilution: 0,
      charge: 0,
      attack: 100,
      pull: 0,
      grade: 0,
      blur: 0,
      blurJitter: 0,
      wetnessJitter: 0,
      stampHue: 0,
      stampSat: 0,
      stampLight: 0,
      stampDark: 0,
      stampSecondary: 0,
      strokeHue: 0,
      strokeSat: 0,
      strokeLight: 0,
      strokeDark: 0,
      strokeSecondary: 0,
      pressColorSecondary: 0,
      tiltColorSecondary: 0,
      barrelColorSecondary: 0,
      pressColorHue: 0,
      pressColorSat: 0,
      pressColorBright: 0,
      tiltColorHue: 0,
      tiltColorSat: 0,
      tiltColorBright: 0,
      barrelColorHue: 0,
      barrelColorSat: 0,
      barrelColorBright: 0,
      speedSize: 0,
      speedOpacity: 0,
      speedSpacing: 0,
      jitterSize: 0,
      jitterOpacity: 0,
      pencilPressureSize: 0,
      pencilPressureOpacity: 0,
      pencilPressureFlow: 0,
      pencilPressureBleed: 0,
      tiltOpacity: 0,
      tiltGradation: 0,
      tiltBleed: 0,
      tiltSize: 0,
      barrelSize: 0,
      barrelOpacity: 0,
      barrelBleed: 0,
      tiltAngle: 90,
      smudgePull: 0,
      brushSize: 50,
      brushOpacity: 100,
      maxSize: 100,
      minSize: 10,
      maxOpacity: 100,
      minOpacity: 0,
      hardness: 0,
      renderingMode: 'Light Glaze',
      grainMode: 'Moving',
      grainInverted: false,
      shapeInverted: false,
      grainOffsetJitter: false,
      randomized: false,
      flipX: false,
      flipY: false,
      orientToScreen: false,
      relativeToStroke: false,
      pTaperLink: false,
      tTaperLink: false,
      pTaperAnim: false,
      tiltSizeCompression: false,
      luminanceBlending: false,
      classicTaper: false,
      classicNormal: false,
      textureOffsetJitter: false,
      textureTexturized: false,
      texturized: false,
      textureApplication: 0,
      textureInverted: false,
      textureBlendMode: 'Normal',
      grainBlendMode: 'Normal',
      renderingRecursiveMixing: false,
      renderingMaxTransfer: false,
      renderingModulatedTransfer: false,
      burntMode: 'Color Burn',
      blendMode: 'Normal',
      grainBlend: 'Normal',
      inputStyle: 'Touch only',
      shapeFiltering: 'Classic filtering',
      grainFiltering: 'Classic filtering',
      shapeRandomise: false,
      shapeRandomize: false,
      shapeFlipXJitter: false,
      shapeFlipYJitter: false,
      flow: 100,
      dynamicsWetEdges: 0,
      dynamicsBurntEdges: 0,
      dynamicsMix: 0,
      dynamicsLoad: 0,
      dynamicsWetAccumulation: 100,
      dynamicsPull: 0,
      dynamicsGrade: 0,
      dynamicsBlur: 0,
      dynamicsBlurJitter: 0,
      dynamicsWetnessJitter: 0,
      dynamicsJitterHue: 0,
      dynamicsJitterSaturation: 0,
      dynamicsJitterLightness: 0,
      dynamicsJitterBrightness: 0,
      dynamicsJitterDarkness: 0,
      dynamicsJitterSecondaryColor: 0,
      dynamicsJitterStrokeHue: 0,
      dynamicsJitterStrokeSaturation: 0,
      dynamicsJitterStrokeLightness: 0,
      dynamicsJitterStrokeBrightness: 0,
      dynamicsJitterStrokeDarkness: 0,
      dynamicsJitterStrokeSecondaryColor: 0,
      dynamicsPressureSecondaryColor: 0,
      dynamicsTiltSecondaryColor: 0,
      dynamicsBarrelRollSecondaryColor: 0,
      dynamicsPressureHue: 0,
      dynamicsPressureSaturation: 0,
      dynamicsPressureBrightness: 0,
      dynamicsTiltHue: 0,
      dynamicsTiltSaturation: 0,
      dynamicsTiltBrightness: 0,
      dynamicsBarrelRollHue: 0,
      dynamicsBarrelRollSaturation: 0,
      dynamicsBarrelRollBrightness: 0,
      dynamicsSpeedSize: 0,
      dynamicsSpeedOpacity: 0,
      dynamicsSpeedSpacing: 0,
      dynamicsJitterSize: 0,
      dynamicsJitterOpacity: 0,
      dynamicsPressureSize: 0,
      dynamicsPressureOpacity: 0,
      dynamicsPressureFlow: 0,
      dynamicsPressureBleed: 0,
      dynamicsTiltOpacity: 0,
      dynamicsTiltGradation: 0,
      dynamicsTiltBleed: 0,
      dynamicsTiltSize: 0,
      dynamicsBarrelRollSize: 0,
      dynamicsBarrelRollOpacity: 0,
      dynamicsBarrelRollBleed: 0,
      dynamicsTiltAngle: 90,
      dynamicsSmudgePull: 0,
      paintSize: 50,
      paintOpacity: 100,
      sizeMax: 100,
      sizeMin: 10,
      opacityMax: 100,
      opacityMin: 0,
    };
  }

  private numberSetting(id: string): number {
    const v = this.s[id];
    if (typeof v === 'number') return v;
    const defaultVal = this.getDefaultSettings()[id];
    return typeof defaultVal === 'number' ? defaultVal : 0;
  }

  private stringSetting(id: string): string {
    const v = this.s[id];
    if (typeof v === 'string') return v;
    const defaultVal = this.getDefaultSettings()[id];
    return typeof defaultVal === 'string' ? defaultVal : '';
  }

  private booleanSetting(id: string): boolean {
    const v = this.s[id];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    const defaultVal = this.getDefaultSettings()[id];
    return typeof defaultVal === 'boolean' ? defaultVal : false;
  }

  private on(id: string): boolean {
    return this.booleanSetting(id);
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 214748366;
    return (this.seed - 1) / 214748366;
  }

  private mix(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
    const dh = ((b[0] - a[0] + 540) % 360) - 180;
    return [
      a[0] + dh * this.clamp(k),
      a[1] + (b[1] - a[1]) * this.clamp(k),
      a[2] + (b[2] - a[2]) * this.clamp(k)
    ];
  }

  private clamp(v: number, lo = 0, hi = 1): number {
    return Math.max(lo, Math.min(hi, v));
  }

  private hexToHsl(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) / 255 || 0;
    const g = parseInt(h.slice(2, 4), 16) / 255 || 0;
    const b = parseInt(h.slice(4, 6), 16) / 255 || 0;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) return [0, 0, l];

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;

    return [hue * 60, s, l];
  }

  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = ((h % 360) + 360) % 360;
    s = this.clamp(s);
    l = this.clamp(l);

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    const [r, g, b] = h < 60 ? [c, x, 0] :
                     h < 120 ? [x, c, 0] :
                     h < 180 ? [0, c, x] :
                     h < 240 ? [0, x, c] :
                     h < 300 ? [x, 0, c] : [c, 0, x];

    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  private signed(amount: number, value: number): number {
    return amount >= 0 ? 1 - amount * (1 - value) : 1 + amount * value;
  }

  private pressureResponse(pressure: number): number {
    // Simple linear pressure response
    return this.clamp(pressure);
  }

  private taperFactors(pen: boolean, distance: number, total: number, size: number, finished: boolean, pressure = 1): { size: number; opacity: number } {
    const prefix = pen ? 'p' : 't';
    const start = this.numberSetting(`${prefix}TaperLength`) / 100 * size * 10;
    const end = finished ? this.numberSetting(`${prefix}TaperEndLength`) / 100 * size * 10 : 0;
    const kStart = start > 0 ? this.clamp(1 - distance / start) : 0;
    const kEnd = finished && end > 0 ? this.clamp(1 - (total - distance) / end) : 0;
    const k = Math.max(kStart, kEnd);
    const tip = this.numberSetting(`${prefix}TaperTip`) / 100;
    const shape = this.booleanSetting('classicTaper') ? k : Math.pow(k, 1 + tip * 3);
    const natural = pen ? 1 - this.numberSetting('pTaperPressure') / 100 * (1 - pressure) : 1;
    return {
      size: this.clamp((1 - this.numberSetting(`${prefix}TaperSize`) / 100 * shape) * natural),
      opacity: this.clamp(1 - this.numberSetting(`${prefix}TaperOpacity`) / 100 * k)
    };
  }

  private grainScale(size = 100, sourceSize = 256): number {
    const scale = this.clamp(this.numberSetting('grainScale') / 100 * 3);
    if (this.stringSetting('grainMode') === 'Texturized') return scale;
    const zoom = this.numberSetting('grainZoom') / 100;
    return scale * ((1 - zoom) * size / sourceSize + zoom);
  }

  private blendValue(mode: string, a: number, b: number): number {
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

  private buildMask(res: number, s: BrushSettings, depth: number, offset: { x: number; y: number }, movingGrain: boolean, sources?: { shape: PixelMap | null; grain: PixelMap | null }): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = res;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(res, res);
    const p = img.data;

    const sh = sources?.shape ?? null;
    const invert = sh ? (this.booleanSetting('shapeInverted') || sh.brightBg) : false;
    const hard = Math.min(0.999, this.numberSetting('hardness') / 100);
    const rot = (this.numberSetting('grainRotation') / 100) * Math.PI;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const gk = 1 / this.grainScale();
    const useGrain = movingGrain && !!this.grainSource && depth > 0;

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
          a = this.applyGrain(s, a, this.grainValue(s, u * cr - v * sr + offset.x, u * sr + v * cr + offset.y), depth);
        }

        const k = (j * res + i) * 4;
        p[k] = p[k + 1] = p[k + 2] = 255;
        p[k + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
      }
    }

    const imageData = new ImageData(img.data, res, res);
    ctx.putImageData(imageData, 0, 0);
    return c;
  }

  private buildGrainCanvas(s: BrushSettings, depth: number, g?: PixelMap | null): HTMLCanvasElement | null {
    if (!g || depth <= 0) return null;

    const c = document.createElement('canvas');
    c.width = g.w;
    c.height = g.h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(g.w, g.h);
    const p = img.data;

    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        const k = (j * g.w + i) * 4;
        p[k] = p[k + 1] = p[k + 2] = 255;
        p[k + 3] = Math.round(this.applyGrain(s, 1, this.grainValue(s, i, j, g), depth) * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    return c;
  }

  private grainValue(s: BrushSettings, gx: number, gy: number, g?: PixelMap): number {
    if (!g) return 1;
    const x = ((Math.floor(gx) % g.w) + g.w) % g.w;
    const y = ((Math.floor(gy) % g.h) + g.h) % g.h;
    let v = g.v[y * g.w + x]!;
    if (this.booleanSetting('grainInverted')) v = 1 - v;
    v = (v - 0.5) * (1 + this.numberSetting('grainContrast') / 100) + 0.5 + this.numberSetting('grainBrightness') / 200;
    return this.clamp(Math.max(0, Math.min(1, v)));
  }

  private applyGrain(s: BrushSettings, a: number, g: number, depth: number): number {
    const mode = this.stringSetting('grainBlend');
    const texture = mode === 'Subtract' ? 1 - g : g;
    return this.clamp(Math.max(0, Math.min(1, a + (this.blendValue(mode, a, texture) - a) * depth)));
  }

  private color(stamp: BrushStamp): [number, number, number] {
    let [h, sat, light] = this.baseColor;
    h += this.random() * this.numberSetting('stampHue') * 1.8;
    sat += this.random() * this.numberSetting('stampSat') / 100;
    light += this.random() * this.numberSetting('stampLight') / 200 - this.random() * this.numberSetting('stampDark') / 200;

    const roll = stamp.pen ? (stamp.twist / (Math.PI * 2) + 1) % 1 : 0;
    for (const [prefix, v] of [['pressColor', stamp.pen ? stamp.pressure : 0], ['tiltColor', stamp.tilt], ['barrelColor', roll]] as const) {
      h += this.numberSetting(`${prefix}Hue`) / 100 * v * 180;
      sat += this.numberSetting(`${prefix}Sat`) / 100 * v;
      light += this.numberSetting(`${prefix}Bright`) / 200 * v;
    }

    let color: [number, number, number] = [h, sat, light];
    const secondary = this.clamp(
      this.random() * this.numberSetting('stampSecondary') / 100 +
      (stamp.pen ? this.numberSetting('pressColorSecondary') / 100 * stamp.pressure : 0) +
      this.numberSetting('tiltColorSecondary') / 100 * stamp.tilt +
      this.numberSetting('barrelColorSecondary') / 100 * roll
    );
    color = this.mix(color, this.secondary, secondary);

    // Smudge color picking
    if ((this.stringSetting('renderingMode').includes('Blending') && this.numberSetting('pull') > 0) || this.options.tool === 'smudge') {
      const dc = this.destination.getContext('2d', { willReadFrequently: true });
      if (dc) {
        const x = Math.round(this.clamp(stamp.x, 0, this.destination.width - 1));
        const y = Math.round(this.clamp(stamp.y, 0, this.destination.height - 1));
        const px = dc.getImageData(x, y, 1, 1).data;
        if ((px[3] ?? 0) > 0) {
          const hex = '#' + [px[0] ?? 0, px[1] ?? 0, px[2] ?? 0].map(v => v.toString(16).padStart(2, '0')).join('');
          const picked = this.hexToHsl(hex);
          color = this.mix(color, picked, this.options.tool === 'smudge' ? 1 : this.numberSetting('pull') / 100);
        } else if (this.options.tool === 'smudge') {
          return [0, 0, -1];
        }
      }
    }

    return color;
  }

  private whiteCore(tip: HTMLCanvasElement): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = tip.width;
    c.height = tip.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(tip, 0, 0);
    const imageData = ctx.getImageData(0, 0, c.width, c.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] ?? 0;
      const k = a > 200 ? Math.min(1, (a - 200) / 40) : 0;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = Math.round(255 * k);
    }
    ctx.putImageData(imageData, 0, 0);
    return c;
  }

  start(input: BrushInput) {
    const p = { ...input, pressure: input.pen ? this.pressureResponse(input.pressure) : 1 };
    this.last = p;
    this.recent = [p];
    this.stamps.push({ ...p, direction: 0, distance: 0, speed: 0, random: this.baseSeed });
    this.schedule();
  }

  move(input: BrushInput) {
    const last = this.last;
    if (!last) return;

    const pressure = input.pen ? this.pressureResponse(input.pressure) : 1;
    const p = { ...input, pressure: last.pressure + (pressure - last.pressure) * (1 - this.numberSetting('streamlinePressure') / 100 * 0.98) };

    const dt = Math.max(1, input.time - last.time);
    const speed = Math.hypot(input.x - last.x, input.y - last.y) / dt / (this.options.pixelRatio ?? 1);
    const filter = this.numberSetting('motionFiltering') / 100;
    const delta = Math.hypot(p.x - last.x, p.y - last.y);
    const weight = this.clamp(delta / Math.max(0.1, filter * this.baseSize * 0.2), 0.02, 1);
    const expression = this.numberSetting('motionExpression') / 100 * (1 - filter);
    const fw = filter > 0 ? weight + (1 - weight) * expression : 1;

    p.x = last.x + (p.x - last.x) * fw;
    p.y = last.y + (p.y - last.y) * fw;

    this.recent.push(p);
    const keep = 1 + Math.round(this.numberSetting('stabilization') / 100 * (2 + Math.min(20, speed * 5)));
    while (this.recent.length > keep) this.recent.shift();

    const avg = this.recent.reduce((a, q) => ({ x: a.x + q.x / this.recent.length, y: a.y + q.y / this.recent.length }), { x: 0, y: 0 });
    const w = 1 - this.numberSetting('streamline') / 100 * 0.96;
    p.x = last.x + (avg.x - last.x) * w;
    p.y = last.y + (avg.y - last.y) * w;

    const dx = p.x - last.x, dy = p.y - last.y, distance = Math.hypot(dx, dy), direction = Math.atan2(dy, dx);

    let size = this.baseSize;
    if (input.pen) size *= Math.max(0.02, this.signed(this.numberSetting('pencilPressureSize') / 100, p.pressure));
    size *= 1 + this.numberSetting('tiltSize') / 100 * p.tilt * 2;
    size *= Math.max(0.02, 1 + this.numberSetting('barrelSize') / 100 * (p.pen ? (p.twist / (Math.PI * 2) + 1) % 1 : 0));
    size *= Math.max(0.02, 1 + this.numberSetting('speedSize') / 100 * Math.min(1, speed / 3));

    const step = Math.max(0.5, size * Math.max(0.5, this.numberSetting('spacing')) / 100 * (1 + this.numberSetting('speedSpacing') / 100 * Math.min(1, speed / 3) * 2));

    let at = step - this.carry, previous = 0, guard = 0;
    while (at <= distance && guard++ < 8000) {
      const t = distance > 0 ? at / distance : 1;
      this.stamps.push({ ...p, x: last.x + dx * t, y: last.y + dy * t, pressure: last.pressure + (p.pressure - last.pressure) * t, distance: this.distance + at, direction, speed, random: this.seed });
      previous = at;
      at += Math.max(0.25, step * (1 + this.random() * this.numberSetting('spacingJitter') / 100));
    }

    this.carry = previous > 0 ? distance - previous : this.carry + distance;
    this.distance += distance;
    this.last = p;
    this.schedule();
  }

  private schedule() {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.render(false);
      });
    }
  }

  render(finished = false) {
    this.seed = this.baseSeed;
    const originalColor: [number, number, number] = [...this.baseColor];
    const ctx = this.paintCtx;
    const w = this.paint.width;
    const h = this.paint.height;

    ctx.clearRect(0, 0, w, h);

    const mode = this.stringSetting('renderingMode');
    const strength = mode === 'Intense Glaze' ? 1.35 : mode === 'Heavy Glaze' ? 1.75 : mode === 'Intense Blending' ? 2 : 1;
    const uniform = mode === 'Uniformed Glaze' || mode === 'Uniform Blending';
    let blendMode: string;

    for (const st of this.stamps) {
      this.seed = st.random;
      const p = st.pen ? st.pressure : 1;

      const altitude = (1 - st.tilt) * 90;
      const tilt = st.pen && altitude <= this.numberSetting('tiltAngle') ? this.clamp((this.numberSetting('tiltAngle') - altitude) / Math.max(1, this.numberSetting('tiltAngle'))) : 0;
      const stamp = { ...st, tilt };

      const roll = st.pen ? (st.twist / (Math.PI * 2) + 1) % 1 : 0;

      let size = this.baseSize;
      if (st.pen) size *= Math.max(0.02, this.signed(this.numberSetting('pencilPressureSize') / 100, p));
      size *= 1 + this.numberSetting('tiltSize') / 100 * tilt * 2;
      size *= Math.max(0.02, 1 + this.numberSetting('barrelSize') / 100 * roll);
      size *= Math.max(0.02, 1 + this.numberSetting('speedSize') / 100 * Math.min(1, st.speed / 3));

      const taper = this.taperFactors(st.pen, st.distance, this.distance, this.baseSize, finished || (st.pen && this.booleanSetting('pTaperAnim')), p);

      let alpha = this.numberSetting('flow') / 100 * strength * taper.opacity;
      if (st.pen) alpha *= this.signed(this.numberSetting('pencilPressureOpacity') / 100, p) * this.signed(this.numberSetting('pencilPressureFlow') / 100, p);
      alpha *= (1 - this.numberSetting('tiltOpacity') / 100 * tilt) * (1 - this.numberSetting('barrelOpacity') / 100 * roll);
      alpha *= this.clamp(1 + this.numberSetting('speedOpacity') / 100 * Math.min(1, st.speed / 3));

      if (this.numberSetting('fallOff') > 0) {
        alpha *= this.clamp(1 - st.distance / ((101 - this.numberSetting('fallOff')) * 20 * (this.options.pixelRatio ?? 1)));
      }

      const wet = !this.options.preview || this.booleanSetting('previewWetMix');
      if (wet) {
        alpha *= 1 - this.numberSetting('dilution') / 100 * 0.9;
        const charge = this.numberSetting('charge') / 100;
        alpha *= charge >= 1 ? 1 : this.clamp(1 - st.distance / Math.max(1, charge * charge * 3000 * (this.options.pixelRatio ?? 1)));
        alpha *= this.numberSetting('attack') / 100;
        alpha *= 1 - this.random() * this.numberSetting('wetnessJitter') / 100;
        alpha = Math.pow(this.clamp(alpha), Math.pow(2, -this.numberSetting('grade') / 100 * 2));
      }

      if (this.options.tool === 'smudge') alpha *= this.numberSetting('smudgePull') / 100;

      const count = Math.max(1, Math.round(this.numberSetting('count') * (1 - this.random() * this.numberSetting('countJitter') / 100)));

      let direction = this.booleanSetting('relativeToStroke')
        ? st.direction + this.numberSetting('rotation') / 100 * Math.PI
        : st.direction * this.numberSetting('rotation') / 100;

      if (st.pen && this.stringSetting('inputStyle') !== 'Touch only') direction += st.azimuth;
      if (st.pen && this.stringSetting('inputStyle') === 'Azimuth and barrel roll') direction += st.twist;
      if (this.booleanSetting('orientToScreen')) direction -= this.options.rotation ?? 0;
      if (this.booleanSetting('randomized')) direction += this.random() * Math.PI * 2;

      for (let i = 0; i < count; i++) {
        const lateral = this.random() * this.numberSetting('jitterLateral') / 100 * size;
        const linear = this.random() * this.numberSetting('jitterLinear') / 100 * size;
        const x = st.x - Math.sin(st.direction) * lateral + Math.cos(st.direction) * linear;
        const y = st.y + Math.cos(st.direction) * lateral + Math.sin(st.direction) * linear;
        const sz = Math.max(0, size * (1 - this.random() * this.numberSetting('jitterSize') / 100));
        const a = alpha * (1 - this.random() * this.numberSetting('jitterOpacity') / 100);

        const color = this.color(stamp);
        if (color[2] < 0 || sz <= 0.1 || a <= 0) continue;

        const rgb = this.hslToRgb(...color);
        const tc = this.tipCtx;
        const res = this.tipWork.width;

        tc.clearRect(0, 0, res, res);
        tc.globalCompositeOperation = 'source-over';
        tc.globalAlpha = 1;
        tc.drawImage(this.tip, 0, 0);
        tc.globalCompositeOperation = 'source-in';
        tc.fillStyle = `rgb(${rgb.join(',')})`;

        if (this.whiteTip) {
          const core = this.whiteCore(this.tip as unknown as HTMLCanvasElement);
          tc.globalCompositeOperation = 'source-over';
          tc.drawImage(core, 0, 0);
        }

        if (this.grain && this.stringSetting('grainMode') === 'Moving') {
          const depth = Math.max(this.numberSetting('grainDepthMin'), this.numberSetting('grainDepth') - this.random() * this.numberSetting('grainDepthJitter')) / 100;
          const gc = this.buildGrainCanvas(this.s, depth, this.grainSource);
          const pat = gc ? tc.createPattern(gc, 'repeat') : null;

          if (pat) {
            const projectionSize = this.booleanSetting('tiltSizeCompression') ? this.baseSize : sz;
            const scale = this.grainScale(projectionSize, gc?.width ?? 256) * res / sz;
            const movement = this.numberSetting('grainMovement') / 100;

            pat.setTransform(
              new DOMMatrix()
                .translate(res / 2, res / 2)
                .rotate(-st.direction / Math.PI * 180 * this.numberSetting('grainRotation') / 100)
                .scale(scale)
                .translate(this.offset.x - st.x * movement / Math.max(0.001, scale * sz / res), this.offset.y - st.y * movement / Math.max(0.001, scale * sz / res))
            );

            tc.globalCompositeOperation = 'destination-in';
            tc.fillStyle = pat;
            tc.fillRect(0, 0, res, res);
          }
        }

        const round = Math.max(0.01, this.numberSetting('roundness') / 100 * this.signed(this.numberSetting('pressureRoundness') / 100, p) * this.signed(this.numberSetting('tiltRoundness') / 100, tilt));

        const sx = (this.booleanSetting('flipX') && this.random() < 0.5 ? -1 : 1) * Math.max(0.01, 1 - this.random() * this.numberSetting('roundHJitter') / 100);
        const sy = (this.booleanSetting('flipY') && this.random() < 0.5 ? -1 : 1) * round * Math.max(0.01, 1 - this.random() * this.numberSetting('roundVJitter') / 100);
        const rotation = direction + this.random() * this.numberSetting('scatter') / 100 * Math.PI;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(sx, sy);

        ctx.imageSmoothingEnabled = this.stringSetting('shapeFiltering') !== 'No filtering';
        ctx.imageSmoothingQuality = this.stringSetting('shapeFiltering') === 'Classic filtering' ? 'low' : 'high';
        ctx.globalAlpha = this.clamp(a);

        const uniformComposite = uniform && this.booleanSetting('classicNormal') ? 'lighter' : 'source-over';
        ctx.globalCompositeOperation = uniformComposite;

        const bleed = (st.pen ? this.numberSetting('pencilPressureBleed') / 100 * p : 0) + this.numberSetting('tiltBleed') / 100 * tilt + this.numberSetting('barrelBleed') / 100 * roll;
        const blur = wet ? this.numberSetting('blur') / 100 + this.random() * this.numberSetting('blurJitter') / 100 : 0;
        const soft = this.clamp(this.numberSetting('wetEdges') / 100 + bleed + this.numberSetting('tiltGradation') / 100 * tilt);

        if (soft > 0) {
          ctx.globalAlpha = this.clamp(a) * soft * 0.35;
          ctx.filter = `blur(${sz * soft * 0.04}px)`;
          ctx.drawImage(this.tipWork, -sz * 0.53, -sz * 0.53, sz * 1.06, sz * 1.06);
          ctx.globalAlpha = this.clamp(a);
          ctx.filter = 'none';
        }

        ctx.filter = blur > 0 ? `blur(${sz * blur * 0.08}px)` : 'none';
        ctx.drawImage(this.tipWork, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }
    }

    this.baseColor = originalColor;

    // Fixed grain
    if (this.grain && this.stringSetting('grainMode') === 'Texturized') {
      const pat = ctx.createPattern(this.grain, 'repeat');
      if (pat) {
        pat.setTransform(new DOMMatrix().scale(this.grainScale()));
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = pat;
        ctx.imageSmoothingEnabled = this.stringSetting('grainFiltering') !== 'No filtering';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.paint, 0, 0);

    // Post-process
    if (this.booleanSetting('alphaThreshold') || this.numberSetting('burntEdges') > 0 || mode === 'Light Glaze') {
      const image = this.ctx.getImageData(0, 0, w, h);
      const data = image.data;
      const threshold = this.numberSetting('thresholdAmount') / 100 * 255;

      for (let k = 0; k < data.length; k += 4) {
        let a = (data[k + 3] ?? 0) / 255;
        if (a === 0) continue;

        if (mode === 'Light Glaze') {
          a = Math.min(a, this.numberSetting('flow') / 100);
        }

        const edge = 4 * a * (1 - a) * this.numberSetting('burntEdges') / 100;
        if (edge > 0) {
          for (let j = 0; j < 3; j++) {
            const c = (data[k + j] ?? 0) / 255;
            data[k + j] = Math.round((c + (this.blendValue(this.stringSetting('burntMode'), c, c * 0.5) - c) * edge) * 255);
          }
        }

        data[k + 3] = this.booleanSetting('alphaThreshold') ? (a * 255 > threshold ? 255 : 0) : a * 255;
      }

      this.ctx.putImageData(image, 0, 0);
    }

    const minO = this.numberSetting('minOpacity');
    const maxO = Math.max(minO, this.numberSetting('maxOpacity'));
    this.layer.style.opacity = String((minO + (maxO - minO) * (this.options.opacity ?? this.numberSetting('brushOpacity')) / 100) / 100);

    blendMode = this.booleanSetting('luminanceBlending') ? 'luminosity' : this.stringSetting('blendMode') === 'Normal' ? 'normal' : this.stringSetting('blendMode') === 'Add' ? 'plus-lighter' : this.stringSetting('blendMode').toLowerCase().replaceAll(' ', '-');
    this.layer.style.mixBlendMode = this.options.tool === 'erase' ? 'normal' : blendMode;
  }

  end(commit = true) {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.render(true);

    if (commit) {
      const dc = this.destination.getContext('2d');
      if (dc) {
        dc.save();
        dc.globalAlpha = Number(this.layer.style.opacity || 1);

        let blendMode = this.booleanSetting('luminanceBlending') ? 'luminosity' : this.options.tool === 'erase' ? 'destination-out' : 'source-over';
        dc.globalCompositeOperation = blendMode;

        if (this.stringSetting('blendMode') === 'Subtract' && this.options.tool !== 'erase') {
          const a = dc.getImageData(0, 0, this.destination.width, this.destination.height);
          const b = this.ctx.getImageData(0, 0, this.layer.width, this.layer.height);

          for (let k = 0; k < a.data.length; k += 4) {
            for (let j = 0; j < 3; j++) {
              a.data[k + j] = Math.max(0, (a.data[k + j] ?? 0) - (b.data[k + j] ?? 0) * (b.data[k + 3] ?? 0) / 255 * dc.globalAlpha);
            }
          }

          dc.putImageData(a, 0, 0);
        } else {
          dc.drawImage(this.layer, 0, 0);
        }

        dc.restore();
      }
    }

    this.ctx.clearRect(0, 0, this.layer.width, this.layer.height);
  }

  cancel() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.ctx.clearRect(0, 0, this.layer.width, this.layer.height);
  }
}
