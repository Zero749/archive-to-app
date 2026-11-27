import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { SelectionMode } from "./SelectionToolbar";
import {
  activeBrush,
  buildMask,
  DEFAULT_BRUSH_SETTINGS,
  hexToHsl,
  hslToRgb,
  buildGrainCanvas,
  grainTransform,
} from "./brushImport";
import { ProcreateBrushRenderer, type BrushInput, type BrushTool, type RenderOptions } from "./brushEngine";
import { getBrushRendererFactory } from "./brushRenderer";

/** Tip size (screen points) at 100% Maximum size and full Brush size. */
const MAX_TIP_PX = 80;

type Pt = { x: number; y: number };
type View = { x: number; y: number; s: number; r: number };

const TAP_MS = 500;
const TAP_MOVE = 18;
const NODE_RADIUS = 7;

type Props = {
  canvasWidth: number;
  canvasHeight: number;
  initialImage?: HTMLImageElement | null;
  embedded?: boolean;
  transparent?: boolean;
  brushActive: boolean;
  selectionActive: boolean;
  selectionMode: SelectionMode;
  selectionColorFill: boolean;
  currentColor: string;
  invertSelection: boolean;
  clearSelectionTrigger: number;
  onThresholdUpdate: (active: boolean, value: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onStrokeStart: () => void;
  onStrokeEnd: () => void;
  onStrokeCancel: () => void;
  eyedropperActive?: boolean;
  brushSize?: number;
  brushOpacity?: number;
  onPickColor?: (hex: string) => void;
};

export const DrawingCanvas = forwardRef<HTMLCanvasElement, Props>(
  function DrawingCanvas(props, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const strokeRef = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    useImperativeHandle(ref, () => canvasRef.current as HTMLCanvasElement);

    const cb = useRef(props);
    cb.current = props;

    const activeSettingsRef = useRef(activeBrush.settings);
    activeSettingsRef.current = activeBrush.settings;


    const selectionPathRef = useRef<Pt[]>([]);
    const lastClearedSelectionRef = useRef<Pt[]>([]);
    const rectStartRef = useRef<Pt | null>(null);
    const scaleRef = useRef(1);
    const autoDragRef = useRef<{ startX: number; baseVal: number } | null>(null);

    // Redraw selection paths & circular nodes
    const redrawSelection = (dpr: number) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const octx = overlay.getContext("2d");
      if (!octx) return;
      octx.clearRect(0, 0, overlay.width, overlay.height);

      const pts = selectionPathRef.current;
      if (pts.length === 0) return;

      octx.strokeStyle = "#2563EB";
      octx.lineWidth = 2.5 * dpr;
      octx.lineCap = "round";
      octx.lineJoin = "round";

      octx.beginPath();
      octx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i]!.x, pts[i]!.y);
      }
      octx.stroke();

      octx.fillStyle = "#3B82F6";
      for (const p of pts) {
        octx.beginPath();
        octx.arc(p.x, p.y, NODE_RADIUS * dpr, 0, Math.PI * 2);
        octx.fill();
        octx.strokeStyle = "#FFFFFF";
        octx.lineWidth = 1.5 * dpr;
        octx.stroke();
      }
    };

    // Fill closed selection with currentColor
    const fillShapeOnCanvas = (shapePts: Pt[], color: string) => {
      const canvas = canvasRef.current;
      if (!canvas || shapePts.length < 3) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      cb.current.onStrokeStart();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(shapePts[0]!.x, shapePts[0]!.y);
      for (let i = 1; i < shapePts.length; i++) {
        ctx.lineTo(shapePts[i]!.x, shapePts[i]!.y);
      }
      ctx.closePath();
      ctx.fill();
      cb.current.onStrokeEnd();
    };

    // Recolor filled shape if color changes while Color Fill is active
    useEffect(() => {
      if (cb.current.selectionColorFill && selectionPathRef.current.length > 2) {
        fillShapeOnCanvas(selectionPathRef.current, props.currentColor);
      }
    }, [props.currentColor]);

    // Clear selection: saves history so 2-finger tap undo reinstates it
    useEffect(() => {
      if (selectionPathRef.current.length > 0) {
        lastClearedSelectionRef.current = [...selectionPathRef.current];
      }
      selectionPathRef.current = [];
      const overlay = overlayRef.current;
      if (overlay) {
        const octx = overlay.getContext("2d");
        octx?.clearRect(0, 0, overlay.width, overlay.height);
      }
    }, [props.clearSelectionTrigger]);

    // Handle restoring selection on undo if recently cleared
    const handleUndo = () => {
      if (cb.current.selectionActive && lastClearedSelectionRef.current.length > 0) {
        selectionPathRef.current = [...lastClearedSelectionRef.current];
        lastClearedSelectionRef.current = [];
        redrawSelection(scaleRef.current);
        return;
      }
      cb.current.onUndo();
    };

    useEffect(() => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      if (!wrap || !canvas || !overlay) return;
      setReady(false);

      const cw = props.canvasWidth;
      const ch = props.canvasHeight;
      canvas.width = cw;
      canvas.height = ch;
      overlay.width = canvas.width;
      overlay.height = canvas.height;

      const view: View = { x: 0, y: 0, s: 1, r: 0 };
      let dpr = scaleRef.current;
      const apply = () => {
        const t = `translate(${view.x}px, ${view.y}px) rotate(${view.r}rad) scale(${view.s})`;
        canvas.style.transform = t;
        overlay.style.transform = t;
        if (strokeRef.current) strokeRef.current.style.transform = t;
      };

      let settledFrame = 0;
      let hasSettled = false;
      const settleLayout = () => {
        const rect = wrap.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || cw <= 0 || ch <= 0) return;

        const cssW = Math.min(rect.width, (rect.height * cw) / ch);
        const cssH = (cssW * ch) / cw;
        if (cssW <= 0 || cssH <= 0) return;

        dpr = scaleRef.current = cw / cssW;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        overlay.style.width = canvas.style.width;
        overlay.style.height = canvas.style.height;
        if (strokeRef.current) {
          strokeRef.current.style.width = canvas.style.width;
          strokeRef.current.style.height = canvas.style.height;
        }
        view.x = (rect.width - cssW) / 2;
        view.y = (rect.height - cssH) / 2;
        apply();

        if (!hasSettled) {
          hasSettled = true;
          setReady(true);
        }
      };

      settledFrame = requestAnimationFrame(settleLayout);
      const resizeObserver = new ResizeObserver(settleLayout);
      resizeObserver.observe(wrap);

      const ctx = canvas.getContext("2d");
      if (ctx && props.initialImage) {
        ctx.drawImage(props.initialImage, 0, 0, cw, ch);
      }
      const layer = strokeRef.current!;
      layer.width = cw;
      layer.height = ch;
      layer.style.width = canvas.style.width;
      layer.style.height = canvas.style.height;
      const lctx = layer.getContext("2d")!;
      const maskBuf = document.createElement("canvas");
      maskBuf.width = cw;
      maskBuf.height = ch;
      const mctx = maskBuf.getContext("2d", { willReadFrequently: true })!;
      const scratch = document.createElement("canvas");
      const xctx = scratch.getContext("2d")!;
      // Paint before grain is applied (canvas-fixed grain strokes only).
      const acc = document.createElement("canvas");
      acc.width = cw;
      acc.height = ch;
      const actx = acc.getContext("2d")!;
      let raf = 0;

      const S = () => activeBrush.settings;
      const n = (id: string) => {
        const v = S()[id];
        return typeof v === "number" ? v : Number(DEFAULT_BRUSH_SETTINGS[id] ?? 0);
      };
      const on = (id: string) => S()[id] === true;
      const str = (id: string) => String(S()[id] ?? DEFAULT_BRUSH_SETTINGS[id] ?? "");
      const rand = () => Math.random();
      const sym = () => Math.random() * 2 - 1;
      const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
      const centered = (v: number, x: number) => (v >= 0 ? 1 - v * (1 - x) : 1 - -v * x);

      type Input = { pressure: number; tilt: number; azimuth: number; twist: number; pen: boolean };
      type ActiveStroke = {
        id: number;
        input: Input;
        last: Pt;
        smooth: Pt;
        filtered: Pt;
        raws: Pt[];
        carry: number;
        distance: number;
        lastTime: number;
        speed: number;
        mask: HTMLCanvasElement;
        maxMode: boolean;
        texturized: boolean;
        depth: number;
        grainOffset: Pt;
        hsl: [number, number, number];
        rgb: [number, number, number];
        baseSize: number;
        baseAngle: number;
        opacity: number;
        bbox: { x0: number; y0: number; x1: number; y1: number } | null;
        stamps: number;
        grainPat: CanvasPattern | null;
        tinted: HTMLCanvasElement | null;
        levels: (HTMLCanvasElement | undefined)[];
        lastDirection: number;
      };
      let stroke: ActiveStroke | null = null;

      const toCanvas = (p: Pt): Pt => {
        const dx = p.x - view.x;
        const dy = p.y - view.y;
        return {
          x: ((Math.cos(-view.r) * dx - Math.sin(-view.r) * dy) / view.s) * dpr,
          y: ((Math.sin(-view.r) * dx + Math.cos(-view.r) * dy) / view.s) * dpr,
        };
      };

      const readInput = (e?: PointerEvent): Input => {
        const ev = e as
          (PointerEvent & { altitudeAngle?: number; azimuthAngle?: number }) | undefined;
        const pen = ev?.pointerType === "pen";
        if (!ev || !pen) return { pressure: 1, tilt: 0, azimuth: 0, twist: 0, pen: false };
        const tilt =
          typeof ev.altitudeAngle === "number"
            ? clamp01(1 - ev.altitudeAngle / (Math.PI / 2))
            : clamp01(Math.max(Math.abs(ev.tiltX || 0), Math.abs(ev.tiltY || 0)) / 90);
        const azimuth =
          typeof ev.azimuthAngle === "number"
            ? ev.azimuthAngle
            : Math.atan2(ev.tiltY || 0, ev.tiltX || 0);
        return {
          pressure: ev.pressure > 0 ? ev.pressure : 0.5,
          tilt,
          azimuth,
          twist: ((ev.twist || 0) * Math.PI) / 180,
          pen,
        };
      };

      const BLEND: Record<string, [GlobalCompositeOperation, string]> = {
        Normal: ["source-over", "normal"],
        Multiply: ["multiply", "multiply"],
        Subtract: ["difference", "difference"],
        Overlay: ["overlay", "overlay"],
        Screen: ["screen", "screen"],
        Add: ["lighter", "plus-lighter"],
        Darken: ["darken", "darken"],
        Lighten: ["lighten", "lighten"],
        "Color Burn": ["color-burn", "color-burn"],
        "Color Dodge": ["color-dodge", "color-dodge"],
      };

      const isBlending = () => str("renderingMode").includes("Blending");
      const colorVaries = () =>
        [
          "stampHue",
          "stampSat",
          "stampLight",
          "stampDark",
          "pressColorHue",
          "pressColorSat",
          "pressColorBright",
          "tiltColorHue",
          "tiltColorSat",
          "tiltColorBright",
          "barrelColorHue",
          "barrelColorSat",
          "barrelColorBright",
        ].some((k) => n(k) !== 0) ||
        (isBlending() && n("pull") > 0);

      // Size before per-stamp dynamics: Brush size slider between Minimum and Maximum size.
      const baseSizePx = () => {
        const minS = n("minSize");
        const maxS = Math.max(minS, n("maxSize"));
        const pct = minS + (maxS - minS) * ((cb.current.brushSize ?? n("brushSize")) / 100);
        return Math.max(1, (MAX_TIP_PX * dpr * pct) / 100);
      };

      const grow = (x: number, y: number, r: number) => {
        if (!stroke) return;
        const b = stroke.bbox;
        if (!b) stroke.bbox = { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
        else {
          b.x0 = Math.min(b.x0, x - r);
          b.y0 = Math.min(b.y0, y - r);
          b.x1 = Math.max(b.x1, x + r);
          b.y1 = Math.max(b.y1, y + r);
        }
      };

      const grainRegion = (x0: number, y0: number, w: number, h: number) => {
        if (!stroke?.grainPat) return;
        lctx.save();
        lctx.beginPath();
        lctx.rect(x0, y0, w, h);
        lctx.clip();
        lctx.globalCompositeOperation = "destination-in";
        lctx.imageSmoothingEnabled = str("grainFiltering") !== "No filtering";
        lctx.imageSmoothingQuality =
          str("grainFiltering") === "Classic filtering" ? "medium" : "high";
        lctx.fillStyle = stroke.grainPat;
        lctx.fillRect(x0, y0, w, h);
        lctx.restore();
      };

      // Updates the visible stroke once per frame (glaze max-paint and canvas grain).
      const flush = () => {
        raf = 0;
        if (!stroke || !stroke.bbox) return;
        const b = stroke.bbox;
        stroke.bbox = null;
        if (!stroke.maxMode && !stroke.grainPat) return;
        const x0 = Math.max(0, Math.floor(b.x0));
        const y0 = Math.max(0, Math.floor(b.y0));
        const x1 = Math.min(cw, Math.ceil(b.x1));
        const y1 = Math.min(ch, Math.ceil(b.y1));
        const w = x1 - x0;
        const h = y1 - y0;
        if (w <= 0 || h <= 0) return;
        if (stroke.maxMode) {
          const src = mctx.getImageData(x0, y0, w, h).data;
          const out = lctx.createImageData(w, h);
          const o = out.data;
          const [r, g, bl] = stroke.rgb;
          const thr = on("alphaThreshold") ? (n("thresholdAmount") / 100) * 255 : -1;
          for (let k = 0; k < o.length; k += 4) {
            const a = src[k]!;
            o[k] = r;
            o[k + 1] = g;
            o[k + 2] = bl;
            o[k + 3] = thr >= 0 ? (a > thr ? 255 : 0) : a;
          }
          lctx.putImageData(out, x0, y0);
        } else {
          lctx.clearRect(x0, y0, w, h);
          lctx.drawImage(acc, x0, y0, w, h, x0, y0, w, h);
        }
        grainRegion(x0, y0, w, h);
      };
      const schedule = () => {
        if (!raf) raf = requestAnimationFrame(flush);
      };

      // Wet mix pull: pick up colour already on the canvas (once per move, not per stamp).
      const pickUp = (s: ActiveStroke, pos: Pt) => {
        if (!ctx) return;
        const px = ctx.getImageData(Math.round(pos.x), Math.round(pos.y), 1, 1).data;
        if (px[3]! > 0) {
          const mix = (n("pull") / 100) * 0.35;
          const [ph, ps, pl] = hexToHsl(
            "#" + [px[0]!, px[1]!, px[2]!].map((v) => v.toString(16).padStart(2, "0")).join(""),
          );
          s.hsl = [
            s.hsl[0] + (ph - s.hsl[0]) * mix,
            s.hsl[1] + (ps - s.hsl[1]) * mix,
            s.hsl[2] + (pl - s.hsl[2]) * mix,
          ];
        }
      };

      const stampColor = (s: ActiveStroke, input: Input, pos: Pt): string => {
        let [h, sat, l] = s.hsl;
        h += sym() * (n("stampHue") / 100) * 180;
        sat += sym() * (n("stampSat") / 100);
        l += rand() * (n("stampLight") / 100) * 0.5 - rand() * (n("stampDark") / 100) * 0.5;
        const lp = 1 - input.pressure;
        h += (n("pressColorHue") / 100) * lp * 180;
        sat += (n("pressColorSat") / 100) * lp;
        l += (n("pressColorBright") / 100) * lp * 0.5;
        h += (n("tiltColorHue") / 100) * input.tilt * 180;
        sat += (n("tiltColorSat") / 100) * input.tilt;
        l += (n("tiltColorBright") / 100) * input.tilt * 0.5;
        const roll = 0.5 + 0.5 * Math.sin(input.twist);
        h += (n("barrelColorHue") / 100) * roll * 180;
        sat += (n("barrelColorSat") / 100) * roll;
        l += (n("barrelColorBright") / 100) * roll * 0.5;
        const [r, g, b] = hslToRgb(h, sat, l);
        return `rgb(${r},${g},${b})`;
      };

      const drawStamp = (
        pos: Pt,
        angle: number,
        size: number,
        sx: number,
        sy: number,
        alpha: number,
        color: string | null,
      ) => {
        if (!stroke || size <= 0.3 || alpha <= 0.002) return;
        const s = stroke;
        const res = s.mask.width;
        let img: HTMLCanvasElement;
        let ga = clamp01(alpha);
        if (s.maxMode) {
          // Cached grey tips per strength level, so each stamp is a single draw.
          const lv = Math.max(1, Math.round(ga * 64));
          let c = s.levels[lv];
          if (!c) {
            c = document.createElement("canvas");
            c.width = c.height = res;
            const x = c.getContext("2d")!;
            x.fillStyle = "#000";
            x.fillRect(0, 0, res, res);
            x.globalAlpha = lv / 64;
            x.drawImage(s.mask, 0, 0);
            s.levels[lv] = c;
          }
          img = c;
          ga = 1;
        } else if (s.tinted && !color) {
          img = s.tinted;
        } else {
          if (scratch.width !== res) scratch.width = scratch.height = res;
          xctx.globalCompositeOperation = "source-over";
          xctx.globalAlpha = 1;
          xctx.clearRect(0, 0, res, res);
          xctx.drawImage(s.mask, 0, 0);
          xctx.globalCompositeOperation = "source-in";
          xctx.fillStyle = color ?? cb.current.currentColor;
          xctx.fillRect(0, 0, res, res);
          xctx.globalCompositeOperation = "source-over";
          img = scratch;
        }
        const target = s.maxMode ? mctx : s.grainPat ? actx : lctx;
        target.save();
        target.imageSmoothingEnabled = str("shapeFiltering") !== "No filtering";
        target.globalCompositeOperation = s.maxMode ? "lighten" : "source-over";
        target.globalAlpha = ga;
        target.translate(pos.x, pos.y);
        target.rotate(angle);
        target.scale(sx, sy);
        const blur =
          size *
          ((n("wetEdges") * 0.08 + n("blur") * 0.12 + rand() * n("blurJitter") * 0.08) / 100);
        target.filter = blur > 0 ? `blur(${blur}px)` : "none";
        const burnt = n("burntEdges") / 100;
        if (burnt > 0) {
          target.globalCompositeOperation = (BLEND[str("burntMode")] ?? BLEND["Multiply"]!)[0];
          target.shadowColor = `rgba(0,0,0,${burnt * 0.65})`;
          target.shadowBlur = size * burnt * 0.05;
          target.drawImage(img, -size / 2, -size / 2, size, size);
          target.globalCompositeOperation = s.maxMode ? "lighten" : "source-over";
          target.shadowColor = "transparent";
          target.shadowBlur = 0;
        }
        target.drawImage(img, -size / 2, -size / 2, size, size);
        target.restore();
        grow(pos.x, pos.y, size * 0.75 + 2);
        s.stamps++;
      };

      // Places one step of stamps using every per-stamp setting.
      const emit = (pos: Pt, dir: number, input: Input) => {
        if (!stroke) return;
        const s = stroke;
        const isPen = input.pen;
        const p = isPen ? input.pressure : 1.0; // Mouse & touch act with full firm contact
        let size = s.baseSize;
        let alpha = Math.max(0.08, n("flow") / 100);
        if (str("renderingMode") === "Heavy Glaze") alpha = Math.min(1, alpha * 1.5);

        // Apple Pencil pressure (only applied when pen is present or pressure is variable)
        if (isPen) {
          size *= Math.max(0.02, centered(n("pencilPressureSize") / 100, p));
          alpha *= 1 - (n("pencilPressureOpacity") / 100) * (1 - p);
          alpha *= Math.max(0, centered(n("pencilPressureFlow") / 100, p));
          alpha *= 1 - (n("pencilPressureBleed") / 100) * (1 - p) * 0.6;
        }

        // Tilt
        if (input.pen) {
          const t = input.tilt;
          let tilted = 1 + (n("tiltSize") / 100) * t * 2;
          if (on("tiltSizeCompression")) tilted = Math.min(tilted, 1.6);
          size *= tilted;
          alpha *= 1 - (n("tiltOpacity") / 100) * t;
          alpha *= 1 - (n("tiltGradation") / 100) * t * 0.5;
          alpha *= 1 - (n("tiltBleed") / 100) * t * 0.6;
          const roll = 0.5 + 0.5 * Math.sin(input.twist);
          size *= Math.max(0.05, 1 + (n("barrelSize") / 100) * (roll - 0.5));
          alpha *= 1 - (n("barrelOpacity") / 100) * roll;
          alpha *= 1 - (n("barrelBleed") / 100) * roll * 0.6;
        }
        // Speed
        const sp = Math.min(1, s.speed / (3 * dpr));
        size *= Math.max(0.05, 1 + (n("speedSize") / 100) * sp);
        alpha *= clamp01(1 + (n("speedOpacity") / 100) * sp);
        // Taper (start of stroke)
        const pre = input.pen ? "p" : "t";
        const len = (n(`${pre}TaperLength`) / 100) * 400 * dpr;
        if (len > 0) {
          const k = 1 - Math.min(1, s.distance / len);
          const tipCurve = on("classicTaper")
            ? k
            : Math.pow(k, 1 / (1 + (n(`${pre}TaperTip`) / 100) * 3));
          const pressureLink = input.pen ? n("pTaperPressure") / 100 : 1;
          size *= 1 - (n(`${pre}TaperSize`) / 100) * tipCurve * Math.max(0.2, pressureLink);
          alpha *= 1 - (n(`${pre}TaperOpacity`) / 100) * k;
        }
        // Fall off
        if (n("fallOff") > 0)
          alpha *= Math.max(0, 1 - s.distance / ((101 - n("fallOff")) * 20 * dpr));
        // Wet mix
        if (isBlending()) {
          alpha *= 1 - (n("dilution") / 100) * 0.8;
          if (n("charge") > 0 && n("charge") < 100)
            alpha *= Math.max(0, 1 - s.distance / (((n("charge") / 100) ** 2 * 3000 + 50) * dpr));
          alpha *= 0.15 + 0.85 * (n("attack") / 100);
        }
        const minPx = (MAX_TIP_PX * dpr * n("minSize")) / 100;
        size = Math.max(minPx, size);

        // Angle
        const follow = on("relativeToStroke") ? 1 : n("rotation") / 100;
        let angle =
          s.baseAngle +
          dir * follow +
          (on("relativeToStroke") ? (n("rotation") / 100) * Math.PI : 0);
        if (on("randomized")) angle += rand() * Math.PI * 2;
        if (input.pen && str("inputStyle") !== "Touch only") angle += input.azimuth;
        if (input.pen && str("inputStyle") === "Azimuth and barrel roll") angle += input.twist;
        if (on("orientToScreen")) angle -= view.r;
        // Roundness
        let round = n("roundness") / 100;
        round *= Math.max(0.05, centered(n("pressureRoundness") / 100, p));
        round *= Math.max(0.05, centered(n("tiltRoundness") / 100, input.tilt));

        const count = Math.max(1, Math.round(n("count") * (1 - rand() * (n("countJitter") / 100))));
        const nx = -Math.sin(dir);
        const ny = Math.cos(dir);
        for (let c = 0; c < count; c++) {
          const lat = sym() * (n("jitterLateral") / 100) * size;
          const lin = sym() * (n("jitterLinear") / 100) * size;
          const at = {
            x: pos.x + nx * lat + Math.cos(dir) * lin,
            y: pos.y + ny * lat + Math.sin(dir) * lin,
          };
          const sz = size * (1 - rand() * (n("jitterSize") / 100));
          const a =
            alpha *
            (1 - rand() * (n("jitterOpacity") / 100)) *
            (1 - (isBlending() ? rand() * (n("wetnessJitter") / 100) : 0));
          const sx =
            (on("flipX") && rand() < 0.5 ? -1 : 1) * (1 - rand() * (n("roundHJitter") / 100));
          const sy =
            (on("flipY") && rand() < 0.5 ? -1 : 1) *
            Math.max(0.05, round * (1 - rand() * (n("roundVJitter") / 100)));
          const ang = angle + sym() * (n("scatter") / 100) * Math.PI;
          drawStamp(
            at,
            ang,
            sz,
            sx,
            sy,
            a,
            s.maxMode || s.tinted ? null : stampColor(s, input, at),
          );
        }
      };

      const beginStroke = (id: number, p: Pt, e?: PointerEvent) => {
        if (!ctx) return;
        cb.current.onStrokeStart();
        const c = toCanvas(p);
        const input = readInput(e);
        const baseSize = baseSizePx();
        // Stroke colour jitter (once per stroke)
        let [h, sat, l] = hexToHsl(cb.current.currentColor);
        h += sym() * (n("strokeHue") / 100) * 180;
        sat += sym() * (n("strokeSat") / 100);
        l += rand() * (n("strokeLight") / 100) * 0.5 - rand() * (n("strokeDark") / 100) * 0.5;
        const rgb = hslToRgb(h, sat, l);
        const mode = str("renderingMode");
        const maxMode = (mode === "Light Glaze" || mode === "Uniformed Glaze") && !colorVaries();
        const texturized = str("grainMode") === "Texturized" || n("grainMovement") >= 40;
        const depth =
          Math.max(n("grainDepthMin"), n("grainDepth") - rand() * n("grainDepthJitter")) / 100;
        const grainOffset = on("grainOffsetJitter")
          ? { x: (rand() * 2048), y: (rand() * 2048) }
          : { x: 0, y: 0 };
        const res = Math.max(24, Math.min(256, Math.round(baseSize)));

        // Build base shape mask without baking grain in (grain is applied to the stroke pass)
        const mask = buildMask(res, S(), depth, grainOffset, false);
        let grainPat: CanvasPattern | null = null;
        const gc = activeBrush.grain && depth > 0 ? buildGrainCanvas(S(), depth) : null;
        if (gc) {
          grainPat = lctx.createPattern(gc, "repeat");
          grainPat?.setTransform(grainTransform(S(), grainOffset));
        }

        let tinted: HTMLCanvasElement | null = null;
        if (!maxMode && !colorVaries()) {
          tinted = document.createElement("canvas");
          tinted.width = tinted.height = res;
          const tx = tinted.getContext("2d")!;
          tx.drawImage(mask, 0, 0);
          tx.globalCompositeOperation = "source-in";
          tx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
          tx.fillRect(0, 0, res, res);
        }
        const minO = n("minOpacity");
        const maxO = Math.max(minO, n("maxOpacity"));
        const opacity = (minO + (maxO - minO) * ((cb.current.brushOpacity ?? n("brushOpacity")) / 100)) / 100;

        lctx.clearRect(0, 0, cw, ch);
        if (grainPat) actx.clearRect(0, 0, cw, ch);
        if (maxMode) {
          mctx.globalCompositeOperation = "source-over";
          mctx.fillStyle = "#000";
          mctx.fillRect(0, 0, cw, ch);
        }
        layer.style.opacity = String(opacity);
        layer.style.mixBlendMode = on("luminanceBlending")
          ? "luminosity"
          : (BLEND[str("blendMode")] ?? BLEND["Normal"]!)[1];

        stroke = {
          id,
          input,
          last: c,
          smooth: c,
          filtered: c,
          raws: [c],
          carry: 0,
          distance: 0,
          lastTime: e?.timeStamp ?? performance.now(),
          speed: 0,
          mask,
          maxMode,
          texturized,
          depth,
          grainOffset,
          hsl: [h, sat, l],
          rgb,
          baseSize,
          baseAngle: 0,
          lastDirection: 0,
          opacity,
          bbox: null,
          stamps: 0,
          grainPat,
          tinted,
          levels: [],
        };
        emit(c, 0, input);
        schedule();
      };

      const strokeTo = (p: Pt, e?: PointerEvent) => {
        if (!ctx || !stroke) return;
        const s = stroke;
        const input = readInput(e);
        s.input = input;
        let raw = toCanvas(p);

        // Motion filtering: ignore tiny wobbles, Expression lets some through.
        const mf = n("motionFiltering");
        if (mf > 0) {
          const thr = (mf / 100) * 10 * dpr;
          if (Math.hypot(raw.x - s.filtered.x, raw.y - s.filtered.y) < thr) {
            const ex = n("motionExpression") / 100;
            raw = {
              x: s.filtered.x + (raw.x - s.filtered.x) * ex,
              y: s.filtered.y + (raw.y - s.filtered.y) * ex,
            };
          }
          s.filtered = raw;
        }
        // Stabilization: average of recent points.
        s.raws.push(raw);
        const keep = 1 + Math.round((n("stabilization") / 100) * 24);
        while (s.raws.length > keep) s.raws.shift();
        const avg = s.raws.reduce(
          (a, q) => ({ x: a.x + q.x / s.raws.length, y: a.y + q.y / s.raws.length }),
          { x: 0, y: 0 },
        );
        // StreamLine
        const sl =
          (n("streamline") / 100) * (1 - (n("streamlinePressure") / 100) * input.pressure * 0.8);
        const w = 1 - Math.min(sl * 0.92, 0.92);
        const c = {
          x: s.smooth.x + (avg.x - s.smooth.x) * w,
          y: s.smooth.y + (avg.y - s.smooth.y) * w,
        };

        const now = e?.timeStamp ?? performance.now();
        const dt = Math.max(1, now - s.lastTime);
        const dx = c.x - s.last.x;
        const dy = c.y - s.last.y;
        const dist = Math.hypot(dx, dy);
        s.speed = s.speed * 0.7 + Math.min(10 * dpr, dist / dt) * 0.3;
        const dir = Math.atan2(dy, dx);
        if (dist > 0) s.lastDirection = dir;

        const sp = Math.min(1, s.speed / (3 * dpr));
        const approx =
          s.baseSize * Math.max(0.05, centered(n("pencilPressureSize") / 100, input.pressure));
        if (isBlending() && n("pull") > 0) pickUp(s, c);
        const baseStep = Math.max(
          dpr,
          approx * 0.01,
          approx * (Math.max(0.5, n("spacing")) / 100) * (1 + (n("speedSpacing") / 100) * sp * 2),
        );
        const nextStep = () => Math.max(0.5, baseStep * (1 + sym() * (n("spacingJitter") / 100)));

        let t = nextStep() - s.carry;
        let lastT = 0;
        let ran = false;
        let guard = 0;
        while (t <= dist && guard++ < 4000) {
          ran = true;
          const k = t / dist;
          s.distance += t - lastT;
          lastT = t;
          emit({ x: s.last.x + dx * k, y: s.last.y + dy * k }, dir, input);
          t += nextStep();
        }
        if (ran) {
          s.distance += dist - lastT;
          s.carry = dist - lastT;
        } else {
          s.distance += dist;
          s.carry += dist;
        }
        s.last = c;
        s.smooth = c;
        s.lastTime = now;
        schedule();
      };

      const applyEndTaper = (s: ActiveStroke) => {
        const prefix = s.input.pen ? "p" : "t";
        const percent = n(`${prefix}TaperEndLength`);
        const len = Math.min((percent / 100) * 400 * dpr, s.distance * 0.45);
        if (len <= dpr) return;

        const maxTip = Math.max(s.baseSize, (MAX_TIP_PX * dpr * n("minSize")) / 100);
        const radius = (maxTip * (1 + Math.max(0, n("tiltSize")) / 50)) / 2 + dpr;
        const tipRadius = radius * (1 - clamp01(n(`${prefix}TaperSize`) / 100));
        const opacity = 1 - clamp01(n(`${prefix}TaperOpacity`) / 100);
        const curve = 1 / (1 + (n(`${prefix}TaperTip`) / 100) * 3);

        lctx.save();
        lctx.translate(s.last.x, s.last.y);
        lctx.rotate(s.lastDirection + Math.PI);
        lctx.beginPath();
        lctx.rect(0, -radius, len, radius * 2);
        lctx.clip();
        lctx.globalCompositeOperation = "destination-out";
        lctx.beginPath();
        lctx.moveTo(0, -radius);
        lctx.lineTo(len, -radius);
        lctx.quadraticCurveTo(len * curve, -radius, 0, -tipRadius);
        lctx.closePath();
        lctx.moveTo(0, tipRadius);
        lctx.quadraticCurveTo(len * curve, radius, len, radius);
        lctx.lineTo(len, radius);
        lctx.lineTo(0, radius);
        lctx.closePath();
        lctx.fill();
        lctx.globalCompositeOperation = "destination-in";
        const fade = lctx.createLinearGradient(0, 0, len, 0);
        fade.addColorStop(0, `rgba(0, 0, 0, ${opacity})`);
        fade.addColorStop(1, "rgba(0, 0, 0, 1)");
        lctx.fillStyle = fade;
        lctx.fillRect(0, -radius, len, radius * 2);
        lctx.restore();
      };

      const endStroke = () => {
        if (!stroke) return;
        if (raf) cancelAnimationFrame(raf);
        flush();
        applyEndTaper(stroke);
        if (ctx) {
          ctx.save();
          ctx.globalAlpha = stroke.opacity;
          ctx.globalCompositeOperation = (BLEND[str("blendMode")] ?? BLEND["Normal"]!)[0];
          ctx.drawImage(layer, 0, 0);
          ctx.restore();
        }
        lctx.clearRect(0, 0, cw, ch);
        stroke = null;
        cb.current.onStrokeEnd();
      };

      const cancelStroke = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        lctx.clearRect(0, 0, cw, ch);
        stroke = null;
        cb.current.onStrokeCancel();
      };

      let enginePointerId: number | null = null;
      let renderer: ProcreateBrushRenderer | null = null;
      let lastInput: BrushInput | null = null;

      const beginEngineStroke = (id: number, p: Pt, e: PointerEvent) => {
        const c = toCanvas(p);
        cb.current.onStrokeStart();
        try {
          const input: BrushInput = {
            x: c.x,
            y: c.y,
            pressure: e.pressure || 0.5,
            tilt: e.tilt || 0,
            azimuth: e.azimuth || 0,
            twist: e.twist || 0,
            pen: e.pointerType === 'pen' || e.pointerType === 'touch',
            time: Date.now(),
          };

          if (!renderer) {
            renderer = new ProcreateBrushRenderer(
              canvas,
              layer,
              {
                color: cb.current.currentColor,
                size: cb.current.brushSize,
                opacity: cb.current.brushOpacity,
                pixelRatio: dpr,
                tool: 'paint',
                preview: false,
                settings: activeSettingsRef.current,
                sources: { shape: activeBrush.shape, grain: activeBrush.grain },
              }
            );
          }

          renderer.start(input);
          enginePointerId = id;
        } catch (error) {
          cb.current.onStrokeCancel();
          throw error;
        }
      };

      const moveEngineStroke = (id: number, p: Pt, e: PointerEvent) => {
        if (enginePointerId !== id || !renderer) return;

        try {
          const input: BrushInput = {
            x: toCanvas(p).x,
            y: toCanvas(p).y,
            pressure: e.pressure || 0.5,
            tilt: e.tilt || 0,
            azimuth: e.azimuth || 0,
            twist: e.twist || 0,
            pen: e.pointerType === 'pen' || e.pointerType === 'touch',
            time: Date.now(),
          };

          renderer.move(input);
        } catch (error) {
          cb.current.onStrokeCancel();
          throw error;
        }
      };

      const endEngineStroke = () => {
        if (enginePointerId === null || !renderer) return;
        enginePointerId = null;
        try {
          renderer.end();
        } catch (error) {
          renderer.cancel();
          cb.current.onStrokeCancel();
          throw error;
        }
        cb.current.onStrokeEnd();
      };

      const cancelEngineStroke = () => {
        if (enginePointerId === null || !renderer) return;
        enginePointerId = null;
        renderer.cancel();
        cb.current.onStrokeCancel();
      };

      const pointers = new Map<number, Pt>();
      const downAt = new Map<number, Pt>();
      let session = { start: 0, max: 0, moved: false };
      let base: { view: View; c: Pt; d: number; a: number } | null = null;

      const sampleColorAt = (e: PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = wrap.getBoundingClientRect();
        const dx = e.clientX - rect.left - view.x;
        const dy = e.clientY - rect.top - view.y;
        const cos = Math.cos(view.r);
        const sin = Math.sin(view.r);
        const localX = (cos * dx + sin * dy) / view.s;
        const localY = (-sin * dx + cos * dy) / view.s;
        const cssWidth = Number.parseFloat(canvas.style.width);
        const cssHeight = Number.parseFloat(canvas.style.height);
        if (
          !cssWidth ||
          !cssHeight ||
          localX < 0 ||
          localY < 0 ||
          localX >= cssWidth ||
          localY >= cssHeight
        ) return;
        const x = Math.floor(localX * (canvas.width / cssWidth));
        const y = Math.floor(localY * (canvas.height / cssHeight));
        const ctx = canvas.getContext("2d");
        if (!ctx || x >= canvas.width || y >= canvas.height) return;
        const px = ctx.getImageData(x, y, 1, 1).data;
        const al = (px[3] ?? 0) / 255;
        const hex = "#" + [px[0], px[1], px[2]].map((c) => Math.round((c ?? 0) * al + 255 * (1 - al)).toString(16).padStart(2, "0")).join("").toUpperCase();
        props.onPickColor?.(hex);
      };
      
      const local = (e: PointerEvent): Pt => {
        const r = wrap.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      const pair = () => {
        const [p1, p2] = [...pointers.values()] as [Pt, Pt];
        return {
          c: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
          d: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1,
          a: Math.atan2(p2.y - p1.y, p2.x - p1.x),
        };
      };

      const resetBase = () => {
        base = pointers.size === 2 ? { view: { ...view }, ...pair() } : null;
      };

      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        wrap.setPointerCapture(e.pointerId);
        if (cb.current.eyedropperActive) {
          sampleColorAt(e);
          return;
        }
        const p = local(e);

        if (pointers.size === 0) session = { start: e.timeStamp, max: 0, moved: false };
        pointers.set(e.pointerId, p);
        downAt.set(e.pointerId, p);
        session.max = Math.max(session.max, pointers.size);

        if (cb.current.selectionActive && pointers.size === 1) {
          const cp = toCanvas(p);
          const selMode = cb.current.selectionMode;

          if (selMode === "Automatic") {
            // Procreate tap and hold threshold drag
            autoDragRef.current = { startX: p.x, baseVal: 47.4 };
            cb.current.onThresholdUpdate(true, 47.4);
          } else if (selMode === "Freehand") {
            const pts = selectionPathRef.current;
            if (pts.length > 2 && Math.hypot(cp.x - pts[0]!.x, cp.y - pts[0]!.y) < 25 * dpr) {
              pts.push({ ...pts[0]! });
              if (cb.current.selectionColorFill) {
                fillShapeOnCanvas(pts, cb.current.currentColor);
              }
            } else {
              pts.push(cp);
            }
            redrawSelection(dpr);
          } else if (selMode === "Rectangle" || selMode === "Ellipse") {
            rectStartRef.current = cp;
          }
          return;
        }

        if (pointers.size === 1 && cb.current.brushActive && enginePointerId === null) {
          beginEngineStroke(e.pointerId, p, e);
        } else if (pointers.size > 1 && enginePointerId !== null && pointers.has(enginePointerId)) {
          cancelEngineStroke();
        }
        resetBase();
      };

      const onMove = (e: PointerEvent) => {
        if (cb.current.eyedropperActive && e.buttons > 0) {
          sampleColorAt(e);
          return;
        }
        if (!pointers.has(e.pointerId)) return;
        const p = local(e);

        if (cb.current.selectionActive && pointers.size === 1) {
          const selMode = cb.current.selectionMode;

          if (selMode === "Automatic" && autoDragRef.current) {
            // Drag left/right adjusts threshold
            const deltaX = p.x - autoDragRef.current.startX;
            const newVal = Math.max(0, Math.min(100, autoDragRef.current.baseVal + deltaX * 0.25));
            cb.current.onThresholdUpdate(true, newVal);
            return;
          }

          const cp = toCanvas(p);
          if (selMode === "Freehand") {
            selectionPathRef.current.push(cp);
            redrawSelection(dpr);
          } else if (rectStartRef.current && (selMode === "Rectangle" || selMode === "Ellipse")) {
            const start = rectStartRef.current;
            selectionPathRef.current = [
              start,
              { x: cp.x, y: start.y },
              cp,
              { x: start.x, y: cp.y },
              start,
            ];
            redrawSelection(dpr);
          }
          return;
        }

        if (enginePointerId === e.pointerId) moveEngineStroke(e.pointerId, p, e);
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, p);

        const d0 = downAt.get(e.pointerId);
        if (d0 && Math.hypot(p.x - d0.x, p.y - d0.y) > TAP_MOVE) session.moved = true;
        if (!base || pointers.size !== 2) return;

        const { c, d, a } = pair();
        const b = base.view;
        const s = b.s * (d / base.d);
        const r = b.r + (a - base.a);
        const dx = base.c.x - b.x;
        const dy = base.c.y - b.y;
        const lx = (Math.cos(-b.r) * dx - Math.sin(-b.r) * dy) / b.s;
        const ly = (Math.sin(-b.r) * dx + Math.cos(-b.r) * dy) / b.s;
        view.s = s;
        view.r = r;
        view.x = c.x - s * (Math.cos(r) * lx - Math.sin(r) * ly);
        view.y = c.y - s * (Math.sin(r) * lx + Math.cos(r) * ly);
        apply();
      };

      const onUp = (e: PointerEvent) => {
        const cancelled = e.type === "pointercancel" || e.type === "lostpointercapture";
        if (cb.current.selectionActive) {
          if (autoDragRef.current) {
            autoDragRef.current = null;
            cb.current.onThresholdUpdate(false, 0);
          }
          if (rectStartRef.current) {
            if (cb.current.selectionColorFill && selectionPathRef.current.length > 2) {
              fillShapeOnCanvas(selectionPathRef.current, cb.current.currentColor);
            }
            rectStartRef.current = null;
          }
        }

        try {
          if (enginePointerId === e.pointerId) {
            if (cancelled) cancelEngineStroke();
            else endEngineStroke();
          }
        } catch (error) {
          session.moved = true;
          throw error;
        } finally {
          if (pointers.has(e.pointerId)) {
            if (cancelled) session.moved = true;
            pointers.delete(e.pointerId);
            downAt.delete(e.pointerId);

            if (pointers.size === 0) {
              const quick = e.timeStamp - session.start < TAP_MS && !session.moved;
              if (quick && session.max === 2) handleUndo();
              if (quick && session.max === 3) cb.current.onRedo();
            }
            resetBase();
          }
        }
      };

      const block = (e: Event) => e.preventDefault();

      wrap.addEventListener("pointerdown", onDown);
      wrap.addEventListener("pointermove", onMove);
      wrap.addEventListener("pointerup", onUp);
      wrap.addEventListener("pointercancel", onUp);
      wrap.addEventListener("lostpointercapture", onUp);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      document.addEventListener("gesturestart", block);
      document.addEventListener("gesturechange", block);
      return () => {
        cancelAnimationFrame(settledFrame);
        resizeObserver.disconnect();
        renderer?.cancel();
        wrap.removeEventListener("pointerdown", onDown);
        wrap.removeEventListener("pointermove", onMove);
        wrap.removeEventListener("pointerup", onUp);
        wrap.removeEventListener("pointercancel", onUp);
        wrap.removeEventListener("lostpointercapture", onUp);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.removeEventListener("gesturestart", block);
        document.removeEventListener("gesturechange", block);
      };
    }, [props.canvasWidth, props.canvasHeight, props.initialImage]);

    return (
      <div
        ref={wrapRef}
        className={`${props.embedded ? "absolute inset-[13%_7%_9%_4%]" : "fixed inset-x-0 bottom-0 top-0"} overflow-hidden ${
          ready ? "touch-none" : "invisible pointer-events-none"
        }`}
      >
        <canvas
          ref={canvasRef}
          className={`absolute left-0 top-0 origin-top-left [image-rendering:pixelated] ${
            props.transparent ? "" : "bg-paper"
          }`}
        />
        <canvas
          ref={strokeRef}
          className="pointer-events-none absolute left-0 top-0 origin-top-left [image-rendering:pixelated]"
        />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
        />
      </div>
    );
  },
);
