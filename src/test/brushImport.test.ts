import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parseArchive } from "@/components/brushImport";

const plist = (contents: string) =>
  new TextEncoder().encode(
    `<?xml version="1.0"?><plist version="1.0"><dict>${contents}</dict></plist>`,
  );

const entry = (name: string, value: string) => `<key>${name}</key>${value}`;

describe("Procreate brush imports", () => {
  it("reads a nested .brush file and applies imported settings", () => {
    const brush = zipSync({
      "Brush.archive": plist(
        [
          entry("name", "<string>Imported Airbrush</string>"),
          entry("plotSpacing", "<real>0.42</real>"),
          entry("dynamicsWetEdges", "<real>0.5</real>"),
          entry("dynamicsBarrelRollHue", "<real>0.25</real>"),
          entry("classicTaper", "<true/>"),
          entry("renderingBlendMode", "<string>Multiply</string>"),
        ].join(""),
      ),
    });
    const archive = zipSync({ "Imported Airbrush.brush": brush });
    const sets = parseArchive(archive, "Imported Airbrush");
    const imported = sets.flatMap((set) => set.brushes)[0];

    expect(imported?.name).toBe("Imported Airbrush");
    expect(imported?.settings).toMatchObject({
      spacing: 42,
      wetEdges: 50,
      barrelColorHue: 25,
      classicTaper: true,
      blendMode: "Multiply",
    });
  });

  it("preserves brush order from a .brushset archive", () => {
    const archive = zipSync({
      "brushset.plist": plist(
        `${entry("name", "<string>Imported Set</string>")}${entry(
          "brushes",
          "<array><string>Second</string><string>First</string></array>",
        )}`,
      ),
      "First/Brush.archive": plist(entry("name", "<string>First</string>")),
      "Second/Brush.archive": plist(entry("name", "<string>Second</string>")),
    });

    const [set] = parseArchive(archive, "fallback");

    expect(set?.name).toBe("Imported Set");
    expect(set?.brushes.map((brush) => brush.name)).toEqual(["Second", "First"]);
  });
});
