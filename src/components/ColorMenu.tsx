import { forwardRef, useEffect, useRef, useState } from "react";
import { Circle, GitFork, Grid3x3, Plus, SlidersHorizontal, Square } from "lucide-react";

type RGB = [number, number, number];
const hsvToRgb = (h: number, s: number, v: number): RGB => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
};
const rgbToHsv = ([r, g, b]: RGB): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) {
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
};
const toHex = (c: RGB) => "#" + c.map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
const fromHex = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hsvHex = (h: number, s: number, v: number) => toHex(hsvToRgb(h, s, v));
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const HUE = "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
const CONIC = "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

export const getColorName = (hex: string): string => {
  const [h, s, v] = rgbToHsv(fromHex(hex));
  if (v < 0.15) return "Black";
  if (s < 0.12) return v > 0.85 ? "White" : v > 0.5 ? "Light Gray" : "Dark Gray";
  const dark = v < 0.45 ? "Dark " : v > 0.85 && s < 0.4 ? "Light " : "";
  let base = "Color";
  if (h < 15 || h >= 345) base = v > 0.6 && s < 0.65 ? "Pink" : "Red";
  else if (h < 40) base = "Orange";
  else if (h < 70) base = "Yellow";
  else if (h < 155) base = "Green";
  else if (h < 185) base = "Cyan";
  else if (h < 210) base = "Cyan Blue";
  else if (h < 260) base = "Blue";
  else if (h < 290) base = "Purple";
  else if (h < 325) base = "Magenta";
  else base = "Magenta Pink";
  return `${dark}${base}`;
};

const rows = (h1: number, h2: number, specs: [number, number][], n = 10) =>
  specs.flatMap(([s, v]) => Array.from({ length: n }, (_, i) => hsvHex((h1 + ((h2 - h1) * i) / (n - 1) + 360) % 360, s, v)));

const palettes = [
  {
    name: "Ascend",
    colors: [
      "#32327C", "#492F7A", "#5C2D7A", "#752A78", "#992576", "#AD2275",
      "#C01C74", "#D41574", "#E01073", "#204988", "#3A4887", "#504887",
      "#6D4886", "#954784", "#AC4684", "#C04483", "#D54283", "#007CA5",
      "#2081A5", "#3A85A6", "#5D8AA6", "#8D92A6", "#A897A7", "#C09DA7"
    ]
  },
  {
    name: "Campfire",
    colors: [
      "#588C7E", "#689581", "#ACBC8A", "#ECD189", "#F2B476", "#E99469",
      "#DB6B5C", "#BC5952", "#934948", "#8C4646", "#789C8A", "#85A48C",
      "#BCC595", "#F0D794", "#F4BE82", "#EDA376", "#E2806A", "#C97062",
      "#A76258", "#A26057", "#BABCA2", "#C1C2A4", "#DDD8AB", "#F7E4AA",
      "#F9D49C", "#F6C193", "#F0AA89", "#E4A082", "#D3967B", "#CF9479"
    ]
  },
  {
    name: "Comic",
    colors: [
      "#681A37", "#6A1F10", "#B65A4B", "#C58273", "#EBBE8F", "#202237",
      "#27293A", "#361951", "#41314C", "#8B159E", "#A42542"
    ]
  },
  {
    name: "Flourish",
    colors: [
      "#8DF4A5", "#68E4AA", "#72D6BF", "#7EC6CC", "#86B3D3", "#849ED6",
      "#7E87D9", "#7C75DA", "#8067D8", "#6D4FD8", "#A1F798", "#A0E792",
      "#C3D59F", "#DAC0A7", "#E2A9AF", "#E090B9", "#D976C2", "#CE5FC8",
      "#C34FCE", "#C13ACE", "#CEF9AD", "#C8E17C", "#E0CB6E", "#EDB066",
      "#F5926E", "#F4737E", "#EC5689", "#E14192", "#D5389C", "#C3268A"
    ]
  },
  {
    name: "Iconic",
    colors: ["#1B9CF7", "#7C72E8", "#DB48DB", "#ED4795", "#FF424F", "#FF6830", "#FF8B0F"]
  },
  {
    name: "New Drink",
    colors: [
      "#9A13A4", "#BA44C2", "#C2449E", "#C2447D", "#C2444F", "#C25644",
      "#C26D44", "#721A78", "#783D89", "#6A3D89", "#5C3D89", "#413D89",
      "#3D5789", "#3D6B89", "#3D8089", "#3D8988", "#92AF63", "#5C893D",
      "#3D8955", "#3D8963", "#3D8975"
    ]
  }
];

export function getCanvasLiveColors(): string[] {
  const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas) return [];
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return [];
  const step = Math.max(1, Math.floor(Math.max(w, h) / 320));
  const data = ctx.getImageData(0, 0, w, h).data;
  const counts = new Map<string, number>();

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const a = data[idx + 3] ?? 0;
      if (a > 30) {
        // Group near-identical anti-aliasing edges to find true core colors
        const r = Math.round((data[idx] ?? 0) / 8) * 8;
        const g = Math.round((data[idx + 1] ?? 0) / 8) * 8;
        const b = Math.round((data[idx + 2] ?? 0) / 8) * 8;
        const hex =
          "#" +
          [Math.min(255, r), Math.min(255, g), Math.min(255, b)]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase();
        counts.set(hex, (counts.get(hex) || 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([col]) => col);
}


let savedHistory: string[] = [];
let savedSecondary = "#FFFFFF";
let savedTab = "Disc";
let historyListeners: ((h: string[]) => void)[] = [];

export function recordDrawnColor(hex: string) {
  const norm = hex.toUpperCase();
  savedHistory = [norm, ...savedHistory.filter((c) => c !== norm)].slice(0, 30);
  historyListeners.forEach((fn) => fn(savedHistory));
}

type Track = (e: React.PointerEvent<HTMLElement>, fn: (x: number, y: number) => void) => void;

const Knob = ({ x, y, c, size = 18 }: { x: number; y: number; c: string; size?: number }) => (
  <span
    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-menu-text shadow"
    style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: size, height: size, backgroundColor: c }}
  />
);

const Bar = ({ t, val, bg, set, label, shown }: { t: Track; val: number; bg: string; set: (x: number) => void; label?: string; shown?: string }) => (
  <div className="flex items-center gap-[8px] text-[11px]">
    {label && <span className="w-[10px]">{label}</span>}
    <div className="relative h-[24px] flex-1 touch-none" onPointerDown={(e) => t(e, (x) => set(clamp(x)))}>
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: bg }} />
      <span className="pointer-events-none absolute top-1/2 h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md" style={{ left: `${val * 100}%`, backgroundColor: "#FFFFFF" }} />
    </div>
    {shown !== undefined && <span className="w-[34px] text-right">{shown}</span>}
  </div>
);

const SV = ({ t, h, s, v, hex, set, round }: { t: Track; h: number; s: number; v: number; hex: string; set: (s: number, v: number) => void; round?: boolean }) => {
  let kx = s - 0.5;
  let ky = 1 - v - 0.5;
  if (round) {
    const d = Math.hypot(kx, ky);
    if (d > 0.48) {
      kx = (kx / d) * 0.48;
      ky = (ky / d) * 0.48;
    }
  }
  return (
    <div
      className={`relative h-full touch-none ${round ? "rounded-full" : "rounded-[6px]"}`}
      style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvHex(h, 1, 1)})` }}
      onPointerDown={(e) =>
        t(e, (x, y) => {
          if (round) {
            let dx = x - 0.5;
            let dy = y - 0.5;
            const d = Math.hypot(dx, dy);
            if (d > 0.48) {
              dx = (dx / d) * 0.48;
              dy = (dy / d) * 0.48;
            }
            set(clamp(dx + 0.5), clamp(1 - (dy + 0.5)));
          } else {
            set(clamp(x), 1 - clamp(y));
          }
        })
      }
    >
      <Knob x={round ? kx + 0.5 : s} y={round ? ky + 0.5 : 1 - v} c={hex} />
    </div>
  );
};

const Swatches = ({ colors, pick, cols = 10 }: { colors: string[]; pick: (c: string) => void; cols?: number }) => (
  <div className="grid overflow-hidden rounded-[4px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
    {colors.map((c, i) => (
      <button key={i} type="button" onClick={() => pick(c)} className="aspect-square" style={{ backgroundColor: c }} />
    ))}
  </div>
);

const tabs = [
  { I: Circle, l: "Disc" },
  { I: Square, l: "Classic" },
  { I: GitFork, l: "Harmony" },
  { I: SlidersHorizontal, l: "Value" },
  { I: Grid3x3, l: "Palettes" },
];

export const ColorMenu = forwardRef<HTMLDivElement, { anchorX: number; color: string; onChange: (hex: string) => void }>(function ColorMenu({ anchorX, color, onChange }, ref) {
  const [hsv, setHsv] = useState(() => rgbToHsv(fromHex(color)));
  const [tab, setTabState] = useState(savedTab);
  const [history, setHistory] = useState(savedHistory);
  const [secondary, setSecondary] = useState(savedSecondary);
  const [cards, setCards] = useState(false);
  const hexRef = useRef(color);
  const [h, s, v] = hsv;
  const hex = hsvHex(h, s, v);
  const hueHex = hsvHex(h, 1, 1);
  const [canvasPalette, setCanvasPalette] = useState<string[]>([]);

  useEffect(() => {
    setCanvasPalette(getCanvasLiveColors());
  }, [tab]);


  useEffect(() => {
    const l = (hList: string[]) => setHistory([...hList]);
    historyListeners.push(l);
    return () => {
      historyListeners = historyListeners.filter((fn) => fn !== l);
    };
  }, []);

  const setTab = (t: string) => {
    savedTab = t;
    setTabState(t);
  };
  const apply = (nh: number, ns: number, nv: number) => {
    setHsv([nh, ns, nv]);
    const x = hsvHex(nh, ns, nv);
    hexRef.current = x;
    onChange(x);
  };
  const pick = (x: string) => {
    const [a, b, c] = rgbToHsv(fromHex(x));
    apply(a, b, c);
    hexRef.current = x;
  };

  const track = (e: React.PointerEvent<HTMLElement>, fn: (x: number, y: number) => void) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const move = (ev: { clientX: number; clientY: number }) => fn((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
    move(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const angle = (x: number, y: number) => ((Math.atan2(x - 0.5, -(y - 0.5)) * 180) / Math.PI + 360) % 360;

  const [r, g, b] = hsvToRgb(h, s, v);
  const setRgb = (i: number, x: number) => {
    const c: RGB = [r, g, b];
    c[i] = Math.round(x * 255);
    const [a, bb, cc] = rgbToHsv(c);
    apply(bb ? a : h, bb, cc);
  };
  const menuW = 300,
    menuLeft = (typeof window !== "undefined" ? window.innerWidth : 1024) - menuW - 8;

  return (
    <div ref={ref} style={{ left: menuLeft, width: menuW }} className="liquid-glass-menu fixed top-[50px] z-20 rounded-[10px] px-[8px] pb-[8px] pt-[14px] text-menu-text shadow-2xl">
      <span aria-hidden style={{ left: anchorX - menuLeft - 9 }} className="liquid-glass-menu absolute top-[-9px] h-[9px] w-[18px] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      <div className="flex items-start justify-between px-[6px]">
        <div>
          <h2 className="text-[19px] font-semibold">{tab === "Palettes" ? "Palettes" : "Colors"}</h2>
          {tab === "Harmony" && <p className="text-[11px]">Complementary</p>}
        </div>
        {tab === "Palettes" ? (
          <Plus className="h-[18px] w-[18px]" />
        ) : (
          <div className="flex gap-[6px]">
            <span className="h-[18px] w-[30px] rounded-[4px]" style={{ backgroundColor: hex }} />
            <button
              type="button"
              aria-label="Swap colors"
              onClick={() => {
                savedSecondary = hex;
                setSecondary(hex);
                pick(secondary);
              }}
              className="h-[18px] w-[30px] rounded-[4px]"
              style={{ backgroundColor: secondary }}
            />
          </div>
        )}
      </div>

      <div className="mt-[10px] px-[4px]">
        {tab === "Disc" && (
          <div className="relative mx-auto aspect-square w-[250px] touch-none">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: CONIC,
                WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 24px), #000 calc(100% - 23px))",
                mask: "radial-gradient(farthest-side, transparent calc(100% - 24px), #000 calc(100% - 23px))",
              }}
              onPointerDown={(e) => track(e, (x, y) => apply(angle(x, y), s, v))}
            />
            <div className="absolute inset-[34px] overflow-hidden rounded-full">
              <SV t={track} h={h} s={s} v={v} hex={hex} set={(ns, nv) => apply(h, ns, nv)} round />
            </div>
            <Knob x={0.5 + Math.sin((h * Math.PI) / 180) * 0.452} y={0.5 - Math.cos((h * Math.PI) / 180) * 0.452} c={hueHex} size={26} />
          </div>
        )}
        {tab === "Classic" && (
          <div className="flex flex-col gap-[6px]">
            <div className="h-[230px]">
              <div className="h-full [&>div]:h-full">
                <SV t={track} h={h} s={s} v={v} hex={hex} set={(ns, nv) => apply(h, ns, nv)} />
              </div>
            </div>
            <Bar t={track} val={h / 360} bg={HUE} set={(x) => apply(x * 360, s, v)} />
            <Bar t={track} val={s} bg={`linear-gradient(to right, ${hsvHex(h, 0, v)}, ${hsvHex(h, 1, v)})`} set={(x) => apply(h, x, v)} />
            <Bar t={track} val={v} bg={`linear-gradient(to right, #000, ${hsvHex(h, s, 1)})`} set={(x) => apply(h, s, x)} />
          </div>
        )}
        {tab === "Harmony" && (
          <div className="flex flex-col gap-[10px]">
            <div
              className="relative mx-auto aspect-square w-[240px] touch-none rounded-full"
              style={{ background: `radial-gradient(closest-side, #fff, transparent), ${CONIC}` }}
              onPointerDown={(e) =>
                track(e, (x, y) => {
                  const dx = (x - 0.5) * 2,
                    dy = (y - 0.5) * 2;
                  apply(angle(x, y), clamp(Math.hypot(dx, dy)), v);
                })
              }
            >
              <div className="pointer-events-none absolute inset-0 rounded-full" style={{ backgroundColor: `rgba(0,0,0,${1 - v})` }} />
              {[0, 180].map((o) => {
                const a = ((h + o) * Math.PI) / 180;
                return <Knob key={o} x={0.5 + Math.sin(a) * s * 0.5} y={0.5 - Math.cos(a) * s * 0.5} c={hsvHex((h + o) % 360, s, v)} />;
              })}
            </div>
            <Bar t={track} val={v} bg={`linear-gradient(to right, #000, ${hsvHex(h, s, 1)})`} set={(x) => apply(h, s, x)} />
            <button type="button" onClick={() => pick(hsvHex((h + 180) % 360, s, v))} className="text-left text-[11px] text-menu-text/70">
              Use complementary
            </button>
          </div>
        )}
        {tab === "Value" && (
          <div className="flex flex-col gap-[4px]">
            <div className="rounded-[6px] bg-menu-group px-[8px] py-[4px]">
              <Bar t={track} label="H" val={h / 360} bg={HUE} set={(x) => apply(x * 360, s, v)} shown={`${Math.round(h)}°`} />
              <Bar t={track} label="S" val={s} bg={`linear-gradient(to right, ${hsvHex(h, 0, v)}, ${hsvHex(h, 1, v)})`} set={(x) => apply(h, x, v)} shown={`${Math.round(s * 100)}%`} />
              <Bar t={track} label="B" val={v} bg={`linear-gradient(to right, #000, ${hsvHex(h, s, 1)})`} set={(x) => apply(h, s, x)} shown={`${Math.round(v * 100)}%`} />
            </div>
            <div className="rounded-[6px] bg-menu-group px-[8px] py-[4px]">
              {(["R", "G", "B"] as const).map((l, i) => {
                const c: RGB[] = [
                  [0, g, b],
                  [r, 0, b],
                  [r, g, 0],
                ];
                const d: RGB[] = [
                  [255, g, b],
                  [r, 255, b],
                  [r, g, 255],
                ];
                return <Bar t={track} key={l + i} label={l} val={[r, g, b][i]! / 255} bg={`linear-gradient(to right, ${toHex(c[i]!)}, ${toHex(d[i]!)})`} set={(x) => setRgb(i, x)} shown={String([r, g, b][i])} />;
              })}
            </div>
            <label className="flex items-center justify-between rounded-[6px] bg-menu-group px-[8px] py-[6px] text-[12px]">
              Hexadecimal
              <input
                key={hex}
                defaultValue={hex}
                onBlur={(e) => /^#?[0-9a-f]{6}$/i.test(e.target.value) && pick("#" + e.target.value.replace("#", "").toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="w-[70px] rounded bg-transparent text-right text-[11px] outline-none"
              />
            </label>
          </div>
        )}
        {tab === "Palettes" && (
          <div>
            <div className="flex rounded-[6px] bg-menu-group p-[2px] text-[11px]">
              <button
                type="button"
                onClick={() => setCards(false)}
                className={`flex flex-1 items-center justify-center gap-[5px] rounded-[5px] py-[4px] font-medium transition-colors ${!cards ? "bg-menu-active text-white" : "text-menu-text/70"}`}
              >
                <svg className="h-[13px] w-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="12" height="10" rx="1.5" />
                  <line x1="2" y1="7" x2="14" y2="7" strokeWidth="1" />
                  <line x1="2" y1="10" x2="14" y2="10" strokeWidth="1" />
                </svg>
                Compact
              </button>
              <button
                type="button"
                onClick={() => setCards(true)}
                className={`flex flex-1 items-center justify-center gap-[5px] rounded-[5px] py-[4px] font-medium transition-colors ${cards ? "bg-menu-active text-white" : "text-menu-text/70"}`}
              >
                <svg className="h-[13px] w-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="12" height="10" rx="1.5" />
                  <line x1="4" y1="10" x2="9" y2="10" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Cards
              </button>
            </div>
            <div className="mt-[10px] flex max-h-[360px] flex-col gap-[14px] overflow-y-auto pr-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ name: "My Palette", colors: canvasPalette }, ...palettes].map((p, i) => (
                <div key={p.name} className="flex flex-col gap-[6px]">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-[6px]">
                      <span className="font-medium">{p.name}</span>
                    </div>
                    <span className="cursor-pointer tracking-wider text-menu-text/60 hover:text-menu-text">•••</span>
                  </div>
                  {cards ? (
                    <div className="grid grid-cols-3 gap-[1px] overflow-hidden rounded-[8px] bg-black/20">
                      {p.colors.map((c, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => pick(c)}
                          className="relative aspect-[1.1] w-full p-[6px] text-left transition-opacity active:opacity-80"
                          style={{ backgroundColor: c }}
                        >
                          <span className="absolute bottom-[5px] left-[6px] text-[9px] font-medium leading-tight text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                            {getColorName(c)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Swatches pick={pick} colors={p.colors} cols={10} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {tab !== "Palettes" && (
        <div className="mt-[10px] px-[4px]">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium">History</span>
            <button
              type="button"
              onClick={() => {
                savedHistory = [];
                setHistory([]);
                historyListeners.forEach((fn) => fn([]));
              }}
              className="rounded-full bg-white/[0.08] px-[9px] py-[2px] text-[10px] text-menu-text/80 transition-colors hover:bg-white/[0.14] active:bg-white/[0.2]"
            >
              Clear
            </button>
          </div>
          <div className="mt-[6px] flex gap-[3px] overflow-x-auto pb-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {Array.from({ length: Math.max(12, history.length) }, (_, i) =>
              history[i] ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(history[i]!)}
                  className="aspect-square min-w-[18px] flex-1 rounded-[1px]"
                  style={{ backgroundColor: history[i] }}
                />
              ) : (
                <span
                  key={i}
                  className="aspect-square min-w-[18px] flex-1 rounded-[1px] border border-white/[0.04] bg-white/[0.10]"
                />
              )
            )}
          </div>
          <div className="mt-[10px] flex max-h-[150px] flex-col gap-[12px] overflow-y-auto pr-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[...palettes, { name: "My Palette", colors: canvasPalette }].map((p) => (
              <div key={p.name} className="flex flex-col gap-[4px]">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium">{p.name}</span>
                  {p.name === "My Palette" && <span className="text-[10px] text-menu-text/60">{canvasPalette.length === 0 ? "Empty canvas" : `${canvasPalette.length} colors`}</span>}
                </div>
                <Swatches pick={pick} colors={p.colors} cols={10} />
              </div>
            ))}
          </div>
        </div>
      )}


      <div className="mt-[10px] flex justify-between px-[4px]">
        {tabs.map(({ I, l }) => (
          <button key={l} type="button" onClick={() => setTab(l)} className={`flex w-[50px] flex-col items-center gap-[3px] ${tab === l ? "text-menu-active" : "text-menu-text"}`}>
            <I className="h-[16px] w-[16px]" />
            <span className="text-[9px]">{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
