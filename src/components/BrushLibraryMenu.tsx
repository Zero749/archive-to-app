import { forwardRef, useEffect, useRef, useState } from "react";
import {
  Compass,
  Cpu,
  Droplets,
  Feather,
  Flame,
  FolderInput,
  Highlighter,
  Hourglass,
  House,
  Layers,
  Lightbulb,
  MessageSquare,
  Paintbrush,
  Palette,
  Pencil,
  PenLine,
  Plus,
  Sparkles,
  SprayCan,
  SquarePen,
  SquarePlus,
  Type,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { activeBrush, parseArchive, selectBrush, stripExt, uid, type Brush, type Library } from "./brushImport";
import { BrushStrokePreview } from "./BrushStrokePreview";
import { BrushStudio } from "./BrushStudio";
import { STARTER_PENCIL, SHAPE_SOURCES } from "./brushSources";
import { withDefaults as newBrushDefaults } from "./brushImport";

const CATEGORIES: { name: string; icon: LucideIcon }[] = [
  { name: "Recent", icon: Hourglass },
  { name: "Pencils", icon: Pencil },
  { name: "Pens", icon: PenLine },
  { name: "Inks", icon: Feather },
  { name: "Markers", icon: Highlighter },
  { name: "Pastels", icon: Sparkles },
  { name: "Oils", icon: Paintbrush },
  { name: "Paints", icon: Palette },
  { name: "Gouache", icon: Paintbrush },
  { name: "Watercolors", icon: Droplets },
  { name: "Airbrushes", icon: Wind },
  { name: "Charcoals", icon: Flame },
  { name: "Basics", icon: Sparkles },
  { name: "Lettering", icon: Type },
  { name: "Comics", icon: MessageSquare },
  { name: "Design", icon: Compass },
  { name: "Grunge", icon: Layers },
  { name: "Street Art", icon: SprayCan },
  { name: "Digital", icon: Cpu },
  { name: "Creative", icon: Lightbulb },
];
const ICONS: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORIES.map((c) => [c.name, c.icon]),
);

type Store = { libs: Library[]; current: string };
const KEY = "brush-libraries-v1";
let cache: Store | null = null;

function refreshStarterPencil(brush: Brush): Brush {
  return brush.id === STARTER_PENCIL.id &&
    brush.presetVersion !== STARTER_PENCIL.presetVersion
    ? STARTER_PENCIL
    : brush;
}

function withDefaults(s: Store): Store {
  const libs = s.libs.map((l) => {
    let sets = l.sets.map((set) => ({
      ...set,
      brushes: set.brushes
        .filter(
          (b) =>
            !b.id.startsWith("placeholder-pencil-") &&
            !b.id.startsWith("p5-") &&
            !b.id.startsWith("airbrush-"),
        )
        .map(refreshStarterPencil),
    }));
    if (l.id === "procreate") {
      let pencils = sets.findIndex((set) => set.name === "Pencils");
      if (pencils === -1) {
        sets = [...sets, { id: "Pencils", name: "Pencils", brushes: [] }];
        pencils = sets.length - 1;
      }
      const pencilSet = sets[pencils]!;
      if (!pencilSet.brushes.some((b) => b.id === STARTER_PENCIL.id)) {
        sets[pencils] = { ...pencilSet, brushes: [...pencilSet.brushes, STARTER_PENCIL] };
      }
    }
    return { ...l, sets };
  });
  return {
    ...s,
    libs,
  };
}

function loadStore(): Store {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return (cache = withDefaults(JSON.parse(raw) as Store));
  } catch {
    /* ignore */
  }
  const lib: Library = {
    id: "procreate",
    name: "Procreate Library",
    sets: CATEGORIES.map((c) => ({
      id: c.name,
      name: c.name,
      brushes: [],
    })),
  };
  return (cache = withDefaults({ libs: [lib], current: lib.id }));
}

function saveStore(s: Store) {
  cache = s;
  try {
    const slim: Store = {
      ...s,
      libs: s.libs.map((l) => ({
        ...l,
        sets: l.sets.map((st) => ({
          ...st,
          brushes: st.brushes.map((b) =>
            b.id.startsWith("p5-") ? ({ id: b.id, name: b.name, settings: b.settings, resetSettings: b.resetSettings } as Brush) : b,
          ),
        })),
      })),
    };
    localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    /* too big to keep after reload; stays for this session */
  }
}

type ImportKind = "brush" | "brushset" | "brushlibrary";

const PLUS_ITEMS = [
  { label: "Create new brush", icon: SquarePen },
  { label: "Create new set", icon: SquarePlus },
  { label: "Import from Files", icon: FolderInput },
];

function StrokePreview({ brush }: { brush?: Brush }) {
  return brush ? (
    <BrushStrokePreview
      brush={brush}
      className="h-[2.6vw] w-full pointer-events-none"
    />
  ) : null;
}

let lastSelectedSet: string | null = null;

export const BrushLibraryMenu = forwardRef<HTMLDivElement, { anchorX: number }>(
  function BrushLibraryMenu({ anchorX }, ref) {
    const [store, setStore] = useState<Store>(loadStore);
    const lib = store.libs.find((l) => l.id === store.current) ??
      store.libs[0] ?? { id: "procreate", name: "Procreate Library", sets: [] };
    const [selectedSet, setSelectedSetState] = useState<string>(() => {
      if (lastSelectedSet && lib.sets.some((s) => s.id === lastSelectedSet)) {
        return lastSelectedSet;
      }
      return lib.sets.find((s) => s.name === "Pencils")?.id ?? lib.sets[0]?.id ?? "";
    });
    const setSelectedSet = (id: string) => {
      lastSelectedSet = id;
      setSelectedSetState(id);
    };
    
    const [selectedBrush, setSelectedBrush] = useState<string | null>(activeBrush.id);
    const [plusOpen, setPlusOpen] = useState(false);
    const [libOpen, setLibOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const currentBrush = store.libs
      .flatMap((l) => l.sets.flatMap((st) => st.brushes))
      .find((b) => b.id === selectedBrush);

    const update = (s: Store) => {
      saveStore(s);
      setStore(s);
    };

    const createBrush = () => {
      setPlusOpen(false);
      const nb = { id: uid(), name: "New brush", shape: SHAPE_SOURCES[0]?.image, grain: undefined, settings: { ...newBrushDefaults({}), grainDepth: 0, grainDepthMin: 0 } };
      const s = {
        ...store,
        libs: store.libs.map((l) => {
          if (l.id !== store.current) return l;
          const target = l.sets.some((x) => x.id === selectedSet) ? selectedSet : l.sets[0]?.id;
          if (!target) return { ...l, sets: [{ id: uid(), name: "My brushes", brushes: [nb] }] };
          return { ...l, sets: l.sets.map((x) => (x.id === target ? { ...x, brushes: [...x.brushes, nb] } : x)) };
        }),
      };
      update(s);
      setSelectedBrush(nb.id);
      setSettingsOpen(true);
    };

    const startImport = () => {
      setPlusOpen(false);
      fileRef.current?.click();
    };

    const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      let s = store;
      for (const f of files) {
        try {
          const base = stripExt(f.name);
          const sets = parseArchive(new Uint8Array(await f.arrayBuffer()), base);
          if (!sets.some((x) => x.brushes.length)) throw new Error("no brushes");
          const ext = f.name.split(".").pop()?.toLowerCase();
          const kind: ImportKind =
            ext === "brushlibrary" ? "brushlibrary" : ext === "brushset" ? "brushset" : "brush";
          if (kind === "brushlibrary") {
            const nl: Library = { id: uid(), name: base, sets };
            s = { libs: [...s.libs, nl], current: nl.id };
            setSelectedSet(sets[0]?.id ?? "");
          } else {
            const cur = s.current;
            s = {
              ...s,
              libs: s.libs.map((l) => {
                if (l.id !== cur) return l;
                if (kind === "brushset") return { ...l, sets: [...l.sets, ...sets] };
                const brushes = sets.flatMap((x) => x.brushes);
                const target = l.sets.some((x) => x.id === selectedSet)
                  ? selectedSet
                  : l.sets[0]?.id;
                if (!target) return { ...l, sets: [{ id: uid(), name: base, brushes }] };
                return {
                  ...l,
                  sets: l.sets.map((x) =>
                    x.id === target ? { ...x, brushes: [...x.brushes, ...brushes] } : x,
                  ),
                };
              }),
            };
            if (kind === "brushset" && sets[0]) setSelectedSet(sets[0].id);
          }
        } catch {
          alert(`Couldn't import "${f.name}". Make sure it's a Procreate brush file.`);
        }
      }
      update(s);
    };

    const windowWidth = typeof window !== "undefined" ? window.innerWidth : 800;
    const menuRight = 10;
    const triangleRight = Math.max(14, windowWidth - anchorX - menuRight - 9);
    const brushes = lib.sets.find((x) => x.id === selectedSet)?.brushes ?? [];

    return (
      <div
        ref={ref}
        style={{ right: menuRight }}
        className="liquid-glass-menu fixed bottom-[16px] top-[50px] z-20 flex w-[31.7vw] flex-col rounded-[1.4vw] px-[0.8vw] pt-[1.2vw] text-menu-text shadow-2xl"
      >
        <span
          aria-hidden
          style={{ right: triangleRight }}
          className="liquid-glass-menu absolute top-[-9px] h-[9px] w-[18px] [clip-path:polygon(50%_0,100%_100%,0_100%)]"
        />
        <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />

        {/* Header */}
        <div className="relative flex items-center justify-between px-[0.5vw] pb-[1vw]">
          <button
            type="button"
            onClick={() => {
              setLibOpen((o) => !o);
              setPlusOpen(false);
            }}
            className="flex min-w-0 items-center gap-[0.8vw] text-left"
          >
            <h2 className="truncate text-[1.75vw] font-semibold">{lib.name}</h2>
            <House className="h-[1vw] w-[1vw] shrink-0 opacity-50" />
          </button>
          <button
            type="button"
            aria-label="Add"
            onClick={() => {
              setPlusOpen((o) => !o);
              setLibOpen(false);
            }}
            className={plusOpen ? "text-menu-active" : ""}
          >
            <Plus className="h-[2vw] w-[2vw]" />
          </button>

          {libOpen && (
            <div className="liquid-glass absolute left-0 top-[2.8vw] z-30 w-[19vw] overflow-hidden rounded-[1vw] shadow-2xl">
              {store.libs.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    update({ ...store, current: l.id });
                    setSelectedSet(l.sets.find((s) => s.name === "Pencils")?.id ?? l.sets[0]?.id ?? "");
                    setSelectedBrush(null);
                    setLibOpen(false);
                  }}
                  className={`flex w-full items-center border-b border-menu-divider px-[1.2vw] py-[0.9vw] text-left text-[1.1vw] last:border-b-0 ${
                    l.id === lib.id ? "text-menu-active" : ""
                  }`}
                >
                  <span className="truncate">{l.name}</span>
                </button>
              ))}
            </div>
          )}

          {plusOpen && (
            <div className="liquid-glass absolute right-0 top-[2.8vw] z-30 w-[19vw] overflow-hidden rounded-[1vw] shadow-2xl">
              {PLUS_ITEMS.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={label === "Import from Files" ? startImport : label === "Create new brush" ? createBrush : undefined}
                  className="flex w-full items-center justify-between border-b border-menu-divider px-[1.2vw] py-[0.9vw] text-left text-[1.1vw] last:border-b-0 active:text-menu-active"
                >
                  {label}
                  <Icon className="h-[1.3vw] w-[1.3vw]" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Columns */}
        <div className="flex min-h-0 flex-1 gap-[1vw]">
          {/* Brush sets */}
          <div className="flex w-[10.6vw] shrink-0 flex-col gap-[1.1vw] overflow-y-auto pb-[1vw]">
            {lib.sets.map(({ id, name }) => {
              const Icon = ICONS[name] ?? Layers;
              const active = selectedSet === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedSet(id)}
                  className={`flex h-[3.45vw] shrink-0 items-center gap-[0.9vw] rounded-[0.7vw] px-[0.9vw] text-left text-[1.1vw] font-medium ${
                    active ? "bg-menu-active text-paper" : "bg-menu-group"
                  }`}
                >
                  <Icon className="h-[1.3vw] w-[1.3vw] shrink-0" />
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>

          {/* Brushes */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto pb-[1vw]">
            {brushes.map((brush) => {
              const { id, name } = brush;
              const active = selectedBrush === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (selectedBrush === id) {
                      setSettingsOpen(true);
                      return;
                    }
                    setSelectedBrush(id);
                    void selectBrush(brush);
                  }}
                  className={`flex shrink-0 flex-col gap-[0.5vw] rounded-[1vw] px-[1vw] py-[0.9vw] text-left ${
                    active ? "bg-menu-active text-paper" : "border-b border-menu-divider"
                  }`}
                >
                  <span className="truncate text-[1vw] font-medium">{name}</span>
                  <StrokePreview brush={brush} />
                </button>
              );
            })}
          </div>
        </div>

        {settingsOpen && currentBrush && (
          <BrushStudio
            brush={currentBrush}
            onClose={() => setSettingsOpen(false)}
            onSave={(nb) =>
              update({
                ...store,
                libs: store.libs.map((l) => ({
                  ...l,
                  sets: l.sets.map((st) => ({
                    ...st,
                    brushes: st.brushes.map((b) => (b.id === nb.id ? nb : b)),
                  })),
                })),
              })
            }
          />
        )}
      </div>
    );
  },
);
