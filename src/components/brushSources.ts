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
  { kind: "Shape", name: "Graphite Contact Tip", image: pencilTip, index: 0 },
  { kind: "Shape", name: "Felt tip pen (hard)", image: shape1Asset.url, index: 1 },
  { kind: "Shape", name: "Pen (digital)", image: shape2Asset.url, index: 2 },
  { kind: "Shape", name: "Pen (bleed)", image: shape3Asset.url, index: 3 },
  { kind: "Shape", name: "Pen (fade)", image: shape4Asset.url, index: 4 },
  { kind: "Shape", name: "Air (normal)", image: shape5Asset.url, index: 5 },
  { kind: "Shape", name: "Air (triangle)", image: shape6Asset.url, index: 6 },
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
