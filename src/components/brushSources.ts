import shape26Asset from "@/assets/shapes/shape-26.png.asset.json";
import shape27Asset from "@/assets/shapes/shape-27.png.asset.json";
import shape28Asset from "@/assets/shapes/shape-28.png.asset.json";
import shape29Asset from "@/assets/shapes/shape-29.png.asset.json";
import shape30Asset from "@/assets/shapes/shape-30.png.asset.json";
import shape31Asset from "@/assets/shapes/shape-31.png.asset.json";
import shape25Asset from "@/assets/shapes/shape-25.png.asset.json";
import shape19Asset from "@/assets/shapes/shape-19.png.asset.json";
import shape20Asset from "@/assets/shapes/shape-20.png.asset.json";
import shape21Asset from "@/assets/shapes/shape-21.png.asset.json";
import shape22Asset from "@/assets/shapes/shape-22.png.asset.json";
import shape23Asset from "@/assets/shapes/shape-23.png.asset.json";
import shape24Asset from "@/assets/shapes/shape-24.png.asset.json";
import shape13Asset from "@/assets/shapes/shape-13.png.asset.json";
import shape14Asset from "@/assets/shapes/shape-14.png.asset.json";
import shape15Asset from "@/assets/shapes/shape-15.png.asset.json";
import shape16Asset from "@/assets/shapes/shape-16.png.asset.json";
import shape17Asset from "@/assets/shapes/shape-17.png.asset.json";
import shape18Asset from "@/assets/shapes/shape-18.png.asset.json";
import shape7Asset from "@/assets/shapes/shape-7.png.asset.json";
import shape8Asset from "@/assets/shapes/shape-8.png.asset.json";
import shape9Asset from "@/assets/shapes/shape-9.png.asset.json";
import shape10Asset from "@/assets/shapes/shape-10.png.asset.json";
import shape11Asset from "@/assets/shapes/shape-11.png.asset.json";
import shape12Asset from "@/assets/shapes/shape-12.png.asset.json";
import shape1Asset from "@/assets/shapes/shape-1.png.asset.json";
import shape2Asset from "@/assets/shapes/shape-2.png.asset.json";
import shape3Asset from "@/assets/shapes/shape-3.png.asset.json";
import shape4Asset from "@/assets/shapes/shape-4.png.asset.json";
import shape5Asset from "@/assets/shapes/shape-5.png.asset.json";
import shape6Asset from "@/assets/shapes/shape-6.png.asset.json";
import pencilGrain from "@/assets/brush-sources/graphite-micrograin.svg?url";
import pencilTip from "@/assets/brush-sources/pencil-tip.svg?url";
import { DEFAULT_BRUSH_SETTINGS } from "./brushStudioData";
import type { Brush } from "./brushImport";

export type BrushSourceOption = {
  kind: "Shape" | "Grain";
  name: string;
  image: string;
  index: number;
};

export const SHAPE_SOURCES: BrushSourceOption[] = [
  { kind: "Shape", name: "Felt tip pen (hard)", image: shape1Asset.url, index: 1 },
  { kind: "Shape", name: "Pen (digital)", image: shape2Asset.url, index: 2 },
  { kind: "Shape", name: "Pen (bleed)", image: shape3Asset.url, index: 3 },
  { kind: "Shape", name: "Pen (fade)", image: shape4Asset.url, index: 4 },
  { kind: "Shape", name: "Air (normal)", image: shape5Asset.url, index: 5 },
  { kind: "Shape", name: "Air (triangle)", image: shape6Asset.url, index: 6 },
  { kind: "Shape", name: "Air (Trapezoid 20%)", image: shape7Asset.url, index: 7 },
  { kind: "Shape", name: "Air (Trapezoid 40%)", image: shape8Asset.url, index: 8 },
  { kind: "Shape", name: "Air (Trapezoid 60%)", image: shape9Asset.url, index: 9 },
  { kind: "Shape", name: "Air (Trapezoid 80%)", image: shape10Asset.url, index: 10 },
  { kind: "Shape", name: "Air (Particle)", image: shape11Asset.url, index: 11 },
  { kind: "Shape", name: "Air (Particle L)", image: shape12Asset.url, index: 12 },
  { kind: "Shape", name: "Mottled", image: shape13Asset.url, index: 13 },
  { kind: "Shape", name: "Neon 1", image: shape14Asset.url, index: 14 },
  { kind: "Shape", name: "Neon 2", image: shape15Asset.url, index: 15 },
  { kind: "Shape", name: "Outline 1", image: shape16Asset.url, index: 16 },
  { kind: "Shape", name: "Outline 2", image: shape17Asset.url, index: 17 },
  { kind: "Shape", name: "Outline 3", image: shape18Asset.url, index: 18 },
  { kind: "Shape", name: "Dot", image: shape25Asset.url, index: 25 },
  { kind: "Shape", name: "Dot", image: shape26Asset.url, index: 25 },
  { kind: "Shape", name: "Dot", image: shape27Asset.url, index: 25 },
  { kind: "Shape", name: "Dot", image: shape28Asset.url, index: 25 },
  { kind: "Shape", name: "Dot", image: shape29Asset.url, index: 25 },
  { kind: "Shape", name: "Dot", image: shape30Asset.url, index: 25 },
  { kind: "Shape", name: "Dot", image: shape31Asset.url, index: 25 },
  { kind: "Shape", name: "Pencil", image: shape19Asset.url, index: 19 },
  { kind: "Shape", name: "Pencil (Graphite)", image: shape20Asset.url, index: 20 },
  { kind: "Shape", name: "Watercolor (Bleed)", image: shape21Asset.url, index: 21 },
  { kind: "Shape", name: "Watercolor (Point)", image: shape22Asset.url, index: 22 },
  { kind: "Shape", name: "Watercolor (Real)", image: shape23Asset.url, index: 23 },
  { kind: "Shape", name: "Oil (Rough)", image: shape24Asset.url, index: 24 },
];

export const GRAIN_SOURCES: BrushSourceOption[] = [
  { kind: "Grain", name: "Graphite Micrograin", image: pencilGrain, index: 0 },
];

export const STARTER_PENCIL: Brush = {
  id: "starter-pencil",
  presetVersion: 12,
  name: "Pencil",
  shape: pencilTip,
  grain: pencilGrain,
  settings: {
    ...DEFAULT_BRUSH_SETTINGS,
    hardness: 68,
    brushSize: 8,
    brushOpacity: 100,
    spacing: 5,
    spacingJitter: 0,
    flow: 50,
    randomized: false,
    relativeToStroke: true,
    jitterSize: 0,
    jitterOpacity: 0,
    streamline: 0,
    wetMix: false,
    scaleTaperToSize: true,
    pTaperLength: 8,
    pTaperEndLength: 8,
    pTaperSize: 100,
    pTaperOpacity: 25,
    pTaperTip: 0,
    tTaperLength: 8,
    tTaperEndLength: 8,
    tTaperSize: 100,
    tTaperOpacity: 25,
    tTaperTip: 0,
    grainMode: "Texturized",
    grainDepth: 32,
    grainDepthJitter: 5,
    grainScale: 100,
    grainZoom: 55,
    grainMovement: 0,
    grainBlend: "Multiply",
    grainInverted: false,
    grainOffsetJitter: true,
    pencilPressureSize: 35,
    pencilPressureOpacity: 75,
    pencilPressureFlow: 0,
  },
};
