import { parseArchive, type Brush } from "./brushImport";
import Spraypaints from "@/assets/p5/Spraypaints.json";
import Water from "@/assets/p5/Water.json";
import Vintage from "@/assets/p5/Vintage.json";
import Painting from "@/assets/p5/Painting.json";
import Sketching from "@/assets/p5/Sketching.json";
import Textures from "@/assets/p5/Textures.json";
import Elements from "@/assets/p5/Elements.json";
import Luminance from "@/assets/p5/Luminance.json";
import Industrial from "@/assets/p5/Industrial.json";
import Inking from "@/assets/p5/Inking.json";
import Organic from "@/assets/p5/Organic.json";
import Drawing from "@/assets/p5/Drawing.json";
import Abstract from "@/assets/p5/Abstract.json";
import Charcoals from "@/assets/p5/Charcoals.json";
import Airbrushing from "@/assets/p5/Airbrushing.json";
import Calligraphy from "@/assets/p5/Calligraphy.json";
import P3Artistic from "@/assets/p5/P3Artistic.json";
import Artistic from "@/assets/p5/Artistic.json";
import P2Touchups from "@/assets/p5/P2Touchups.json";
import P2Water from "@/assets/p5/P2Water.json";
import P2Sketching from "@/assets/p5/P2Sketching.json";
import P2Spraypaints from "@/assets/p5/P2Spraypaints.json";
import P2Textures from "@/assets/p5/P2Textures.json";
import P2Retro from "@/assets/p5/P2Retro.json";
import P2Pocket from "@/assets/p5/P2Pocket.json";
import P2Inking from "@/assets/p5/P2Inking.json";
import P2Painting from "@/assets/p5/P2Painting.json";
import P2Industrial from "@/assets/p5/P2Industrial.json";
import P2Organic from "@/assets/p5/P2Organic.json";
import P2Luminance from "@/assets/p5/P2Luminance.json";
import P2Abstract from "@/assets/p5/P2Abstract.json";
import P2Charcoals from "@/assets/p5/P2Charcoals.json";
import Earth from "@/assets/p5/Earth.json";
import P2Elements from "@/assets/p5/P2Elements.json";

/** Bundled Procreate 5 brush sets: [source set, default category, file]. */
const SOURCES: [string, string, { url: string }][] = [
  ["Spraypaints", "Street Art", Spraypaints],
  ["Water", "Watercolors", Water],
  ["Vintage", "Creative", Vintage],
  ["Painting", "Paints", Painting],
  ["Sketching", "Pencils", Sketching],
  ["Textures", "Design", Textures],
  ["Elements", "Creative", Elements],
  ["Luminance", "Digital", Luminance],
  ["Industrial", "Grunge", Industrial],
  ["Inking", "Inks", Inking],
  ["Organic", "Creative", Organic],
  ["Drawing", "Pencils", Drawing],
  ["P2Pocket", "Basics", P2Pocket],
  ["P2Inking", "Inks", P2Inking],
  ["P2Painting", "Paints", P2Painting],
  ["P2Industrial", "Grunge", P2Industrial],
  ["P2Organic", "Creative", P2Organic],
  ["P2Luminance", "Digital", P2Luminance],
  ["P2Touchups", "Basics", P2Touchups],
  ["P2Water", "Watercolors", P2Water],
  ["P2Sketching", "Pencils", P2Sketching],
  ["P2Spraypaints", "Street Art", P2Spraypaints],
  ["P2Textures", "Design", P2Textures],
  ["P2Retro", "Creative", P2Retro],
  ["Abstract", "Creative", Abstract],
  ["Charcoals", "Charcoals", Charcoals],
  ["Airbrushing", "Airbrushes", Airbrushing],
  ["Calligraphy", "Lettering", Calligraphy],
  ["P3Artistic", "Paints", P3Artistic],
  ["Artistic", "Paints", Artistic],
  ["P2Abstract", "Creative", P2Abstract],
  ["P2Charcoals", "Charcoals", P2Charcoals],
  ["Earth", "Creative", Earth],
  ["P2Elements", "Creative", P2Elements],
];

/** Per-brush overrides by name, checked before the set's default category. */
const RULES: [RegExp, string][] = [
  [/watercolou?r|wash|bleed/i, "Watercolors"],
  [/gouache/i, "Gouache"],
  [/oil paint|turpentine|stucco|old brush|salamanca|nikko|fresco/i, "Oils"],
  [/pastel|crayon/i, "Pastels"],
  [/charcoal|vine|compressed/i, "Charcoals"],
  [/marker|highlighter|felt/i, "Markers"],
  [/\bpen\b|gel|ball|fineliner|technical pen|studio pen/i, "Pens"],
  [/grit|grunge|wood|rust|concrete|cement/i, "Grunge"],
  [/nozzle|splatter|burst|drip|flicks/i, "Street Art"],
];

export type P5Item = { category: string; brush: Brush };
let pending: Promise<P5Item[]> | null = null;

export function loadP5Brushes(): Promise<P5Item[]> {
  return (pending ??= Promise.all(
    SOURCES.map(async ([src, def, a]) => {
      try {
        const buf = new Uint8Array(await (await fetch(a.url)).arrayBuffer());
        const brushes = parseArchive(buf, src).flatMap((s) => s.brushes);
        return brushes.map((b, i): P5Item => {
          const name = b.name?.trim() || `${src} ${i + 1}`;
          const keep = ["Charcoals", "Airbrushing", "Calligraphy"].includes(src) || src === "Water" && /drip|flicks|splash/i.test(name);
          const category = keep ? def : (RULES.find(([r]) => r.test(name))?.[1] ?? def);
          return { category, brush: { ...b, id: `p5-${src}-${i}`, name } };
        });
      } catch {
        return [];
      }
    }),
  ).then((x) => x.flat()));
}
