import { activeBrush, buildMask, buildGrainCanvas, hexToHsl, hslToRgb, withDefaults, type BrushSettings, type PixelMap } from './brushImport';
import { blendValue, clamp, grainScale, numberSetting, pressureResponse, taperFactors } from './brushBehavior';

export type BrushInput = { x: number; y: number; pressure: number; tilt: number; azimuth: number; twist: number; pen: boolean; time: number };
export type BrushTool = 'paint' | 'smudge' | 'erase';
type Stamp = BrushInput & { distance: number; direction: number; speed: number; random: number };
export type RenderOptions = { color: string; secondaryColor?: string; size?: number; opacity?: number; pixelRatio?: number; rotation?: number; tool?: BrushTool; preview?: boolean; settings?: BrushSettings; sources?: { shape: PixelMap | null; grain: PixelMap | null } };
const operations: Record<string, GlobalCompositeOperation> = { Normal: 'source-over', Multiply: 'multiply', Overlay: 'overlay', Screen: 'screen', Add: 'lighter', Darken: 'darken', Lighten: 'lighten', 'Color Burn': 'color-burn', 'Color Dodge': 'color-dodge' };
export const brushOperation = (mode: string): GlobalCompositeOperation => operations[mode] ?? 'source-over';
export function pointerInput(e: PointerEvent, x: number, y: number): BrushInput {
  const pen = e.pointerType === 'pen';
  const altitude = e.altitudeAngle;
  return { x, y, pen, pressure: pen ? e.pressure : 1, tilt: pen ? clamp(typeof altitude === 'number' ? 1 - altitude / (Math.PI / 2) : Math.hypot(e.tiltX, e.tiltY) / 90) : 0, azimuth: pen ? (e.azimuthAngle ?? Math.atan2(e.tiltY, e.tiltX)) : 0, twist: pen ? e.twist / 180 * Math.PI : 0, time: e.timeStamp };
}
/** One stroke pipeline, shared by the drawing surface and all previews. */
export class BrushRenderer {
  private s: BrushSettings;
  private options: RenderOptions;
  private ctx: CanvasRenderingContext2D;
  private stamps: Stamp[] = [];
  private last: BrushInput | null = null;
  private recent: BrushInput[] = [];
  private distance = 0;
  private carry = 0;
  private seed = Math.floor(Math.random() * 2147483646) + 1;
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
  constructor(private destination: HTMLCanvasElement, private layer: HTMLCanvasElement, options: RenderOptions) {
    const ctx = layer.getContext('2d');
    if (!ctx) throw new Error('Canvas drawing is unavailable');
    this.ctx = ctx;
    this.options = options;
    this.s = withDefaults(options.settings ?? activeBrush.settings);
    this.grainSource = options.sources?.grain ?? activeBrush.grain;
    const dpr = options.pixelRatio ?? 1;
    const min = this.n('minSize'), max = Math.max(min, this.n('maxSize'));
    const size = options.size ?? this.n(options.preview ? 'previewSize' : 'brushSize');
    this.baseSize = Math.max(0.5, 80 * dpr * (min + (max - min) * size / 100) / 100);
    this.secondary = hexToHsl(options.secondaryColor ?? String(this.s['secondaryColor']));
    this.baseColor = hexToHsl(options.color);
    this.baseColor[0] += this.sym() * this.n('strokeHue') * 1.8;
    this.baseColor[1] += this.sym() * this.n('strokeSat') / 100;
    this.baseColor[2] += this.random() * this.n('strokeLight') / 200 - this.random() * this.n('strokeDark') / 200;
    this.baseColor = this.mix(this.baseColor, this.secondary, this.random() * this.n('strokeSecondary') / 100);
    this.offset = this.on('grainOffsetJitter') && this.str('grainMode') === 'Moving' ? { x: this.random() * 1024, y: this.random() * 1024 } : { x: 0, y: 0 };
    const res = Math.max(64, Math.min(512, Math.ceil(this.baseSize * 2)));
    this.tip = buildMask(res, this.s, 0, { x: 0, y: 0 }, false, options.sources);
    this.grain = buildGrainCanvas(this.s, this.n('grainDepth') / 100, this.grainSource);
    this.paint = document.createElement('canvas'); this.paint.width = layer.width; this.paint.height = layer.height;
    const pc = this.paint.getContext('2d');
    this.tipWork = document.createElement('canvas'); this.tipWork.width = this.tipWork.height = res;
    const tc = this.tipWork.getContext('2d');
    if (!pc || !tc) throw new Error('Canvas drawing is unavailable');
    this.paintCtx = pc; this.tipCtx = tc;
    this.baseSeed = this.seed;
    this.whiteTip = /shape-(14|16|17|18|31)\.png/.test(JSON.stringify(this.s) + JSON.stringify(activeBrush.settings ?? {}));
  }
  private n(id: string) { return numberSetting(this.s, id); }
  private on(id: string) { return this.s[id] === true; }
  private str(id: string) { return String(this.s[id] ?? ''); }
  private random() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
  private sym() { return this.random() * 2 - 1; }
  private mix(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
    const dh = ((b[0] - a[0] + 540) % 360) - 180;
    return [a[0] + dh * clamp(k), a[1] + (b[1] - a[1]) * clamp(k), a[2] + (b[2] - a[2]) * clamp(k)];
  }
  start(input: BrushInput) {
    const p = { ...input, pressure: input.pen ? pressureResponse(this.s, input.pressure) : 1 };
    this.last = p; this.recent = [p];
    this.stamps.push({ ...p, direction: 0, distance: 0, speed: 0, random: this.baseSeed });
    this.schedule();
  }
  move(input: BrushInput) {
    const last = this.last; if (!last) return;
    const pressure = input.pen ? pressureResponse(this.s, input.pressure) : 1;
    const p = { ...input, pressure: last.pressure + (pressure - last.pressure) * (1 - this.n('streamlinePressure') / 100 * 0.98) };
    const dt = Math.max(1, input.time - last.time);
    const speed = Math.hypot(input.x - last.x, input.y - last.y) / dt / (this.options.pixelRatio ?? 1);
    const filter = this.n('motionFiltering') / 100;
    const delta = Math.hypot(p.x - last.x, p.y - last.y);
    const weight = clamp(delta / Math.max(0.1, filter * this.baseSize * 0.2), 0.02, 1);
    const expression = this.n('motionExpression') / 100 * (1 - filter);
    const fw = filter > 0 ? weight + (1 - weight) * expression : 1;
    p.x = last.x + (p.x - last.x) * fw; p.y = last.y + (p.y - last.y) * fw;
    this.recent.push(p);
    const keep = 1 + Math.round(this.n('stabilization') / 100 * (2 + Math.min(20, speed * 5)));
    while (this.recent.length > keep) this.recent.shift();
    const avg = this.recent.reduce((a, q) => ({ x: a.x + q.x / this.recent.length, y: a.y + q.y / this.recent.length }), { x: 0, y: 0 });
    const w = 1 - this.n('streamline') / 100 * 0.96;
    p.x = last.x + (avg.x - last.x) * w; p.y = last.y + (avg.y - last.y) * w;
    const dx = p.x - last.x, dy = p.y - last.y, distance = Math.hypot(dx, dy), direction = Math.atan2(dy, dx);
    const size = this.baseSize * (input.pen ? Math.max(0.02, this.signed(this.n('pencilPressureSize') / 100, p.pressure)) : 1);
    const step = Math.max(0.5, size * Math.max(0.5, this.n('spacing')) / 100 * (1 + this.n('speedSpacing') / 100 * clamp(speed / 3) * 2));
    let at = step - this.carry, previous = 0, guard = 0;
    while (at <= distance && guard++ < 8000) {
      const t = distance > 0 ? at / distance : 1;
      this.stamps.push({ ...p, x: last.x + dx * t, y: last.y + dy * t, pressure: last.pressure + (p.pressure - last.pressure) * t, distance: this.distance + at, direction, speed, random: this.seed });
      previous = at;
      at += Math.max(0.25, step * (1 + this.sym() * this.n('spacingJitter') / 100));
    }
    this.carry = previous > 0 ? distance - previous : this.carry + distance;
    this.distance += distance; this.last = p; this.schedule();
  }
  private signed(amount: number, value: number) { return amount >= 0 ? 1 - amount * (1 - value) : 1 + amount * value; }
  private schedule() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(false); }); }
  private color(stamp: Stamp): [number, number, number] {
    let [h, sat, light] = this.baseColor;
    h += this.sym() * this.n('stampHue') * 1.8; sat += this.sym() * this.n('stampSat') / 100;
    light += this.random() * this.n('stampLight') / 200 - this.random() * this.n('stampDark') / 200;
    const roll = stamp.pen ? (stamp.twist / (Math.PI * 2) + 1) % 1 : 0;
    for (const [prefix, v] of [['pressColor', stamp.pen ? stamp.pressure : 0], ['tiltColor', stamp.tilt], ['barrelColor', roll]] as const) {
      h += this.n(`${prefix}Hue`) / 100 * v * 180; sat += this.n(`${prefix}Sat`) / 100 * v; light += this.n(`${prefix}Bright`) / 200 * v;
    }
    let color: [number, number, number] = [h, sat, light];
    const secondary = clamp(this.random() * this.n('stampSecondary') / 100 + (stamp.pen ? this.n('pressColorSecondary') / 100 * stamp.pressure : 0) + this.n('tiltColorSecondary') / 100 * stamp.tilt + this.n('barrelColorSecondary') / 100 * roll);
    color = this.mix(color, this.secondary, secondary);
    const blending = this.str('renderingMode').includes('Blending');
    if ((blending && this.n('pull') > 0) || this.options.tool === 'smudge') {
      const dc = this.destination.getContext('2d', { willReadFrequently: true });
      if (dc) {
        const x = Math.round(clamp(stamp.x, 0, this.destination.width - 1)), y = Math.round(clamp(stamp.y, 0, this.destination.height - 1));
        const px = dc.getImageData(x, y, 1, 1).data;
        if ((px[3] ?? 0) > 0) {
          const hex = '#' + [px[0] ?? 0, px[1] ?? 0, px[2] ?? 0].map(v => v.toString(16).padStart(2, '0')).join('');
          const picked = hexToHsl(hex);
          color = this.mix(color, picked, this.options.tool === 'smudge' ? 1 : this.n('pull') / 100);
          if (blending) this.baseColor = this.mix(this.baseColor, picked, this.n('pull') / 100 * 0.03);
        } else if (this.options.tool === 'smudge') return [0, 0, -1];
      }
    }
    return color;
  }
  render(finished = false) {
    this.seed = this.baseSeed;
    const originalColor: [number, number, number] = [...this.baseColor];
    const ctx = this.paintCtx, w = this.paint.width, h = this.paint.height;
    ctx.clearRect(0, 0, w, h);
    const mode = this.str('renderingMode');
    const strength = mode === 'Intense Glaze' ? 1.35 : mode === 'Heavy Glaze' ? 1.75 : mode === 'Intense Blending' ? 2 : 1;
    const uniform = mode === 'Uniformed Glaze' || mode === 'Uniform Blending';
    for (const st of this.stamps) {
      this.seed = st.random;
      const p = st.pen ? st.pressure : 1;
      const angleThreshold = this.n('tiltAngle');
      const altitude = (1 - st.tilt) * 90;
      const tilt = st.pen && altitude <= angleThreshold ? clamp((angleThreshold - altitude) / Math.max(1, angleThreshold)) : 0;
      const stamp = { ...st, tilt };
      const roll = st.pen ? (st.twist / (Math.PI * 2) + 1) % 1 : 0;
      let size = this.baseSize;
      if (st.pen) size *= Math.max(0.02, this.signed(this.n('pencilPressureSize') / 100, p));
      size *= 1 + this.n('tiltSize') / 100 * tilt * 2;
      size *= Math.max(0.02, 1 + this.n('barrelSize') / 100 * roll);
      size *= Math.max(0.02, 1 + this.n('speedSize') / 100 * clamp(st.speed / 3));
      const taper = taperFactors(this.s, st.pen, st.distance, this.distance, this.baseSize, finished || (st.pen && this.on('pTaperAnim')), p);
      size *= taper.size;
      let alpha = this.n('flow') / 100 * strength * taper.opacity;
      if (st.pen) alpha *= this.signed(this.n('pencilPressureOpacity') / 100, p) * this.signed(this.n('pencilPressureFlow') / 100, p);
      alpha *= (1 - this.n('tiltOpacity') / 100 * tilt) * (1 - this.n('barrelOpacity') / 100 * roll);
      alpha *= clamp(1 + this.n('speedOpacity') / 100 * clamp(st.speed / 3));
      if (this.n('fallOff') > 0) alpha *= clamp(1 - st.distance / ((101 - this.n('fallOff')) * 20 * (this.options.pixelRatio ?? 1)));
      const wet = !this.options.preview || this.on('previewWetMix');
      if (wet) {
        alpha *= 1 - this.n('dilution') / 100 * 0.9;
        const charge = this.n('charge') / 100;
        alpha *= charge >= 1 ? 1 : clamp(1 - st.distance / Math.max(1, charge * charge * 3000 * (this.options.pixelRatio ?? 1)));
        alpha *= this.n('attack') / 100;
        alpha *= 1 - this.random() * this.n('wetnessJitter') / 100;
        alpha = Math.pow(clamp(alpha), Math.pow(2, -this.n('grade') / 100 * 2));
      }
      if (this.options.tool === 'smudge') alpha *= this.n('smudgePull') / 100;
      const count = Math.max(1, Math.round(this.n('count') * (1 - this.random() * this.n('countJitter') / 100)));
      let direction = this.on('relativeToStroke') ? st.direction + this.n('rotation') / 100 * Math.PI : st.direction * this.n('rotation') / 100;
      if (st.pen && this.str('inputStyle') !== 'Touch only') direction += st.azimuth;
      if (st.pen && this.str('inputStyle') === 'Azimuth and barrel roll') direction += st.twist;
      if (this.on('orientToScreen')) direction -= this.options.rotation ?? 0;
      if (this.on('randomized')) direction += this.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const lateral = this.sym() * this.n('jitterLateral') / 100 * size, linear = this.sym() * this.n('jitterLinear') / 100 * size;
        const x = st.x - Math.sin(st.direction) * lateral + Math.cos(st.direction) * linear;
        const y = st.y + Math.cos(st.direction) * lateral + Math.sin(st.direction) * linear;
        const sz = Math.max(0, size * (1 - this.random() * this.n('jitterSize') / 100));
        const a = alpha * (1 - this.random() * this.n('jitterOpacity') / 100);
        const color = this.color(stamp); if (color[2] < 0 || sz <= 0.1 || a <= 0) continue;
        const rgb = hslToRgb(...color), tc = this.tipCtx, res = this.tipWork.width;
        tc.clearRect(0, 0, res, res); tc.globalCompositeOperation = 'source-over'; tc.globalAlpha = 1;
        tc.drawImage(this.tip, 0, 0); tc.globalCompositeOperation = 'source-in';
        tc.fillStyle = `rgb(${rgb.join(',')})`; tc.fillRect(0, 0, res, res); { if (this.whiteTip) { const core = whiteCore(this.tip as unknown as CanvasImageSource & { width: number; height: number }); tc.globalCompositeOperation = 'source-over'; tc.drawImage(core, 0, 0); } }
        if (this.grain && this.str('grainMode') === 'Moving') {
          const depth = Math.max(this.n('grainDepthMin'), this.n('grainDepth') - this.random() * this.n('grainDepthJitter')) / 100;
          const gc = buildGrainCanvas(this.s, depth, this.grainSource);
          const pat = gc ? tc.createPattern(gc, 'repeat') : null;
          if (pat) {
            const projectionSize = this.on('tiltSizeCompression') ? this.baseSize : sz;
            const scale = grainScale(this.s, projectionSize, gc?.width ?? 256) * res / sz;
            const movement = this.n('grainMovement') / 100;
            pat.setTransform(new DOMMatrix().translate(res / 2, res / 2).rotate(-st.direction / Math.PI * 180 * this.n('grainRotation') / 100).scale(scale).translate(this.offset.x - st.x * movement / Math.max(0.001, scale * sz / res), this.offset.y - st.y * movement / Math.max(0.001, scale * sz / res)));
            tc.globalCompositeOperation = 'destination-in'; tc.fillStyle = pat; tc.fillRect(0, 0, res, res);
          }
        }
        const round = Math.max(0.01, this.n('roundness') / 100 * this.signed(this.n('pressureRoundness') / 100, p) * this.signed(this.n('tiltRoundness') / 100, tilt));
        const sx = (this.on('flipX') && this.random() < 0.5 ? -1 : 1) * Math.max(0.01, 1 - this.random() * this.n('roundHJitter') / 100);
        const sy = (this.on('flipY') && this.random() < 0.5 ? -1 : 1) * round * Math.max(0.01, 1 - this.random() * this.n('roundVJitter') / 100);
        const rotation = direction + this.sym() * this.n('scatter') / 100 * Math.PI;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(sx, sy);
        ctx.imageSmoothingEnabled = this.str('shapeFiltering') !== 'No filtering';
        ctx.imageSmoothingQuality = this.str('shapeFiltering') === 'Classic filtering' ? 'low' : 'high';
        ctx.globalAlpha = clamp(a);
        // Uniform modes accumulate fixed per-stamp transfer; light glaze uses max coverage below.
        ctx.globalCompositeOperation = uniform && this.on('classicNormal') ? 'lighter' : 'source-over';
        const bleed = (st.pen ? this.n('pencilPressureBleed') / 100 * p : 0) + this.n('tiltBleed') / 100 * tilt + this.n('barrelBleed') / 100 * roll;
        const blur = wet ? this.n('blur') / 100 + this.random() * this.n('blurJitter') / 100 : 0;
        const soft = clamp(this.n('wetEdges') / 100 + bleed + this.n('tiltGradation') / 100 * tilt);
        if (soft > 0) {
          ctx.globalAlpha = clamp(a) * soft * 0.35; ctx.filter = `blur(${sz * soft * 0.04}px)`;
          ctx.drawImage(this.tipWork, -sz * 0.53, -sz * 0.53, sz * 1.06, sz * 1.06);
          ctx.globalAlpha = clamp(a); ctx.filter = 'none';
        }
        ctx.filter = blur > 0 ? `blur(${sz * blur * 0.08}px)` : 'none';
        ctx.drawImage(this.tipWork, -sz / 2, -sz / 2, sz, sz); ctx.restore();
      }
    }
    this.baseColor = originalColor;
    // Fixed grain is applied to accumulated coverage, never erased by overlapping stamps.
    if (this.grain && this.str('grainMode') === 'Texturized') {
      const pat = ctx.createPattern(this.grain, 'repeat');
      if (pat) {
        pat.setTransform(new DOMMatrix().scale(grainScale(this.s)));
        ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = pat;
        ctx.imageSmoothingEnabled = this.str('grainFiltering') !== 'No filtering'; ctx.fillRect(0, 0, w, h); ctx.restore();
      }
    }
    this.ctx.clearRect(0, 0, w, h); this.ctx.globalAlpha = 1; this.ctx.globalCompositeOperation = 'source-over'; this.ctx.drawImage(this.paint, 0, 0);
    // Post-process alpha and edge pigment once per stroke, rather than on each stamp.
    if (this.on('alphaThreshold') || this.n('burntEdges') > 0 || mode === 'Light Glaze') {
      const image = this.ctx.getImageData(0, 0, w, h), data = image.data;
      const threshold = this.n('thresholdAmount') / 100 * 255;
      for (let k = 0; k < data.length; k += 4) {
        let a = (data[k + 3] ?? 0) / 255; if (a === 0) continue;
        if (mode === 'Light Glaze') a = Math.min(a, this.n('flow') / 100);
        const edge = 4 * a * (1 - a) * this.n('burntEdges') / 100;
        if (edge > 0) for (let j = 0; j < 3; j++) {
          const c = (data[k + j] ?? 0) / 255;
          data[k + j] = Math.round((c + (blendValue(this.str('burntMode'), c, c * 0.5) - c) * edge) * 255);
        }
        data[k + 3] = this.on('alphaThreshold') ? (a * 255 > threshold ? 255 : 0) : a * 255;
      }
      this.ctx.putImageData(image, 0, 0);
    }
    const minO = this.n('minOpacity'), maxO = Math.max(minO, this.n('maxOpacity'));
    this.layer.style.opacity = String((minO + (maxO - minO) * (this.options.opacity ?? this.n('brushOpacity')) / 100) / 100);
    this.layer.style.mixBlendMode = this.options.tool === 'erase' ? 'normal' : this.on('luminanceBlending') ? 'luminosity' : this.str('blendMode') === 'Normal' ? 'normal' : this.str('blendMode') === 'Add' ? 'plus-lighter' : this.str('blendMode').toLowerCase().replaceAll(' ', '-');
  }
  end(commit = true) {
    if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.render(true);
    const dc = this.destination.getContext('2d');
    if (commit && dc) {
      dc.save(); dc.globalAlpha = Number(this.layer.style.opacity || 1);
      dc.globalCompositeOperation = this.options.tool === 'erase' ? 'destination-out' : this.on('luminanceBlending') ? 'luminosity' : brushOperation(this.str('blendMode'));
      if (this.str('blendMode') === 'Subtract' && this.options.tool !== 'erase') {
        const a = dc.getImageData(0, 0, this.destination.width, this.destination.height), b = this.ctx.getImageData(0, 0, this.layer.width, this.layer.height);
        for (let k = 0; k < a.data.length; k += 4) for (let j = 0; j < 3; j++) a.data[k + j] = Math.max(0, (a.data[k + j] ?? 0) - (b.data[k + j] ?? 0) * (b.data[k + 3] ?? 0) / 255 * dc.globalAlpha);
        dc.putImageData(a, 0, 0);
      } else dc.drawImage(this.layer, 0, 0);
      dc.restore();
    }
    this.ctx.clearRect(0, 0, this.layer.width, this.layer.height);
  }
  cancel() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.ctx.clearRect(0, 0, this.layer.width, this.layer.height); }
}

const coreCache = new WeakMap<object, HTMLCanvasElement>();
function whiteCore(tip: CanvasImageSource & { width: number; height: number }) {
  const hit = coreCache.get(tip); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = tip.width; c.height = tip.height;
  const x = c.getContext('2d'); if (!x) return c;
  x.drawImage(tip, 0, 0); const d = x.getImageData(0, 0, c.width, c.height); const p = d.data;
  for (let i = 0; i < p.length; i += 4) { const a = p[i + 3] ?? 0; const k = a > 200 ? Math.min(1, (a - 200) / 40) : 0; p[i] = 255; p[i + 1] = 255; p[i + 2] = 255; p[i + 3] = Math.round(255 * k); }
  x.putImageData(d, 0, 0); coreCache.set(tip, c); return c;
}
