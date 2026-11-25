export type StudioControl =
  | { kind: "slider"; id: string; label: string; value: number; centered?: boolean; max?: number; unit?: "count" }
  | { kind: "toggle"; id: string; label: string; value: boolean }
  | { kind: "choices"; id: string; options: string[]; selected: string; segmented?: boolean }
  | { kind: "menu"; id: string; label: string; value: string; options: string[] }
  | { kind: "graphic"; graphic: "taper" | "roundness" | "pressure" | "tilt" };
export type StudioSection = { title: string; controls: StudioControl[] };

const s = (id: string, label: string, value = 0, centered = false, max = 100): StudioControl => ({ kind: "slider", id, label, value, centered, max });
const t = (id: string, label: string, value = false): StudioControl => ({ kind: "toggle", id, label, value });
const c = (id: string, options: string[], selected: string, segmented = false): StudioControl => ({ kind: "choices", id, options, selected, segmented });
const BLENDS = ["Normal", "Multiply", "Subtract", "Overlay", "Screen", "Add", "Darken", "Lighten", "Color Burn", "Color Dodge"];
const m = (id: string, label: string, value: string): StudioControl => ({ kind: "menu", id, label, value, options: BLENDS });
const g = (graphic: "taper" | "roundness" | "pressure" | "tilt"): StudioControl => ({ kind: "graphic", graphic });
const filtering = ["No filtering", "Classic filtering", "Improved filtering"];
const colorJitter = (p: string) => [s(`${p}Hue`, "Hue"), s(`${p}Sat`, "Saturation"), s(`${p}Light`, "Lightness"), s(`${p}Dark`, "Darkness"), s(`${p}Secondary`, "Secondary color")];
const colorCentered = (p: string, centered: boolean) => [s(`${p}Hue`, "Hue", 0, centered), s(`${p}Sat`, "Saturation", 0, centered), s(`${p}Bright`, "Brightness", 0, centered), s(`${p}Secondary`, "Secondary Color")];

export const STUDIO_PAGES: Record<string, StudioSection[]> = {
  "Stroke path": [{ title: "Stroke properties", controls: [s("spacing", "Spacing", 14), s("spacingJitter", "Spacing Jitter"), s("jitterLateral", "Jitter Lateral"), s("jitterLinear", "Jitter Linear"), s("fallOff", "Fall off")] }],
  Stabilization: [
    { title: "StreamLine", controls: [s("streamline", "Amount", 20), s("streamlinePressure", "Pressure")] },
    { title: "Stabilization", controls: [s("stabilization", "Amount")] },
    { title: "Motion filtering", controls: [s("motionFiltering", "Amount"), s("motionExpression", "Expression")] },
  ],
  Taper: [
    { title: "Pressure taper", controls: [g("taper"), t("pTaperLink", "Link tip sizes"), s("pTaperLength", "Start length", 0), s("pTaperEndLength", "End length", 0), s("pTaperSize", "Size"), s("pTaperOpacity", "Opacity"), s("pTaperPressure", "Pressure", 100), s("pTaperTip", "Tip"), t("pTaperAnim", "Tip animation", true)] },
    { title: "Touch taper", controls: [g("taper"), t("tTaperLink", "Link tip sizes"), s("tTaperLength", "Start length", 0), s("tTaperEndLength", "End length", 0), s("tTaperSize", "Size"), s("tTaperOpacity", "Opacity"), s("tTaperTip", "Tip")] },
    { title: "Taper properties", controls: [t("classicTaper", "Classic taper")] },
  ],
  Shape: [
    { title: "Input style", controls: [c("inputStyle", ["Touch only", "Azimuth", "Azimuth and barrel roll"], "Azimuth and barrel roll"), t("relativeToStroke", "Relative to stroke")] },
    { title: "Touch properties", controls: [s("rotation", "Rotation", 0, true)] },
    { title: "Shape properties", controls: [s("scatter", "Scatter"), s("count", "Count", 1, false, 16), s("countJitter", "Count jitter"), t("randomized", "Randomized"), t("flipX", "Flip X"), t("flipY", "Flip Y"), g("roundness"), s("roundness", "Roundness", 100), s("pressureRoundness", "Pressure Roundness", 0, true), s("tiltRoundness", "Tilt roundness", 0, true), s("roundVJitter", "Roundness Vertical Jitter"), s("roundHJitter", "Roundness Horizontal Jitter")] },
    { title: "Shape filtering", controls: [c("shapeFiltering", filtering, "Improved filtering")] },
  ],
  Grain: [
    { title: "Grain behavior", controls: [c("grainMode", ["Moving", "Texturized"], "Moving", true), s("grainMovement", "Movement", 100), s("grainScale", "Scale", 16), s("grainZoom", "Zoom"), s("grainRotation", "Rotation", 0, true), s("grainDepth", "Depth", 100), s("grainDepthMin", "Depth minimum"), s("grainDepthJitter", "Depth jitter"), t("grainOffsetJitter", "Offset jitter", true), m("grainBlend", "Blend mode", "Multiply"), s("grainBrightness", "Brightness", 0, true), s("grainContrast", "Contrast", 0, true)] },
    { title: "Grain filtering", controls: [c("grainFiltering", filtering, "Improved filtering")] },
  ],
  Rendering: [
    { title: "Rendering mode", controls: [c("renderingMode", ["Light Glaze", "Uniformed Glaze", "Intense Glaze", "Heavy Glaze", "Uniform Blending", "Intense Blending"], "Light Glaze")] },
    { title: "Blending", controls: [s("flow", "Flow", 100), s("wetEdges", "Wet edges"), s("burntEdges", "Burnt edges"), m("burntMode", "Burnt edges mode", "Multiply"), m("blendMode", "Blend mode", "Normal"), t("luminanceBlending", "Luminance blending"), t("alphaThreshold", "Alpha Threshold"), s("thresholdAmount", "Threshold Amount"), t("classicNormal", "Classic Normal Combine mode")] },
  ],
  "Wet Mix": [{ title: "Wet mix", controls: [s("dilution", "Dilution"), s("charge", "Charge", 100), s("attack", "Attack", 100), s("pull", "Pull"), s("grade", "Grade", 0, true), s("blur", "Blur"), s("blurJitter", "Blur jitter"), s("wetnessJitter", "Wetness jitter")] }],
  "Color dynamics": [
    { title: "Stamp color jitter", controls: colorJitter("stamp") },
    { title: "Stroke color jitter", controls: colorJitter("stroke") },
    { title: "Color pressure", controls: colorCentered("pressColor", true) },
    { title: "Color tilt", controls: colorCentered("tiltColor", true) },
    { title: "Color barrel roll", controls: colorCentered("barrelColor", false) },
  ],
  Dynamics: [
    { title: "Speed", controls: [s("speedSize", "Size", 0, true), s("speedOpacity", "Opacity", 0, true), s("speedSpacing", "Spacing")] },
    { title: "Jitter", controls: [s("jitterSize", "Size"), s("jitterOpacity", "Opacity")] },
  ],
  "Apple Pencil": [
    { title: "Pressure", controls: [g("pressure"), s("pencilPressureSize", "Size", 50, true), s("pencilPressureOpacity", "Opacity"), s("pencilPressureFlow", "Flow", 0, true), s("pencilPressureBleed", "Bleed")] },
    { title: "Tilt", controls: [g("tilt"), s("tiltOpacity", "Opacity"), s("tiltGradation", "Gradation"), s("tiltBleed", "Bleed"), s("tiltSize", "Size"), t("tiltSizeCompression", "Size compression", true)] },
    { title: "Barrel roll", controls: [s("barrelSize", "Size", 0, true), s("barrelOpacity", "Opacity"), s("barrelBleed", "Bleed")] },
    { title: "Cursor outline", controls: [c("cursorOutline", ["None", "Contrast", "Active color"], "Contrast")] },
    { title: "Hover", controls: [s("hoverPressure", "Estimated pressure", 12)] },
    { title: "Hover fill", controls: [c("hoverFill", ["None", "Shape", "All"], "All")] },
  ],
  Properties: [
    { title: "Brush properties", controls: [t("orientToScreen", "Orient to screen"), s("smudgePull", "Smudge Pull", 75), s("brushSize", "Brush size", 25), s("brushOpacity", "Brush opacity", 100)] },
    { title: "Brush behavior", controls: [s("maxSize", "Maximum size", 100, false, 220), s("minSize", "Minimum size", 1, false, 15), s("maxOpacity", "Maximum opacity", 100), s("minOpacity", "Minimum opacity")] },
  ],
  Preview: [{ title: "Preview properties", controls: [t("previewStamp", "Use stamp preview"), s("previewSize", "Size", 30), s("previewPressureMin", "Pressure Minimum", 50), s("previewPressureScale", "Pressure Scale", 69, false, 200), t("previewWetMix", "Wet Mix", true), s("previewTilt", "Tilt angle", 0, true)] }],
};

export type SettingValue = number | boolean | string;
export type BrushSettings = Record<string, SettingValue>;

/** Every setting's default value, plus hidden values that come from imported brushes. */
export const DEFAULT_BRUSH_SETTINGS: BrushSettings = (() => {
  const d: BrushSettings = { hardness: 100, shapeInverted: false, grainInverted: false, pTaperEndLength: 0, tTaperEndLength: 0, pressureCurve: "[[0,0],[1,1]]", tiltAngle: 90, secondaryColor: "#FFFFFF" };
  for (const sections of Object.values(STUDIO_PAGES))
    for (const { controls } of sections)
      for (const ctl of controls) {
        if (ctl.kind === "slider" || ctl.kind === "toggle" || ctl.kind === "menu") d[ctl.id] = ctl.value;
        else if (ctl.kind === "choices") d[ctl.id] = ctl.selected;
      }
  return d;
})();
