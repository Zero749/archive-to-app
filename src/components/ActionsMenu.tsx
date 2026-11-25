import { forwardRef, useState } from "react";
import { CircleHelp, Image, Play, Share, SquarePlus, ToggleRight } from "lucide-react";

const tabs = [
  { I: SquarePlus, l: "Add" },
  { I: Image, l: "Canvas" },
  { I: Share, l: "Share" },
  { I: Play, l: "Video" },
  { I: ToggleRight, l: "Prefs" },
  { I: CircleHelp, l: "Help" },
];

type Item = { l: string; disabled?: boolean; toggle?: boolean; value?: string; slider?: number };
type Group = { title?: string; items: Item[] };

const g = (...l: (string | Item)[]): Group => ({ items: l.map((x) => (typeof x === "string" ? { l: x } : x)) });

const pages: Record<string, Group[]> = {
  Add: [
    g("Insert a file", "Insert a photo", "Take a photo", "Add Text"),
    g("Cut", "Copy", "Copy canvas", { l: "Paste", disabled: true }),
  ],
  Canvas: [
    g("Crop & Resize"),
    g({ l: "Page Assist", toggle: false }, { l: "Drawing Guide", toggle: false }, { l: "Edit Drawing Guide", disabled: true }),
    g({ l: "Reference", toggle: false }),
    g("Flip horizontal", "Flip vertical"),
    g("Canvas information"),
  ],
  Share: [
    { title: "Share Image", items: ["Procreate", "PSD", "PDF", "JPEG", "PNG", "TIFF"].map((l) => ({ l })) },
    { title: "Share Layers", items: ["PDF", "PNG Files", "Animated GIF", "Animated PNG", "Animated MP4", "Animated HEVC"].map((l) => ({ l })) },
  ],
  Video: [g("Time-lapse Replay", { l: "Time-lapse Recording", toggle: true }), g("Export time-lapse video")],
  Prefs: [
    g(
      { l: "Light interface", toggle: false },
      { l: "Right-hand interface", toggle: false },
      { l: "Brush scaling", value: "Canvas" },
      { l: "Project canvas", toggle: false },
      { l: "Brush cursor", toggle: false },
      { l: "Advanced cursor settings", disabled: true },
    ),
    g({ l: "Store brushes in iCloud", toggle: true }),
    g("Pressure and Smoothing", "Gesture controls"),
    g({ l: "Rapid undo delay", value: "0.65s", slider: 65 }, { l: "Selection mask visibility", value: "25.0%", slider: 25 }),
    g({ l: "Size & Opacity sidebar", toggle: true }),
  ],
  Help: [
    g("Help Center", "Talk to our team"),
    g("Procreate Community", "Procreate Beginners Series"),
    g("Repeat brush upgrade", "Remove brush upgrade backup", "Send brush upgrade error report"),
    g("Download 3D model pack", "Advanced settings"),
  ],
};

export const ActionsMenu = forwardRef<HTMLDivElement, { anchorX: number }>(function ActionsMenu({ anchorX }, ref) {
  const [activeTab, setActiveTab] = useState("Add");
  const menuLeft = 50;
  return (
    <div
      ref={ref}
      style={{ left: menuLeft }}
      className="liquid-glass-menu fixed top-[50px] z-20 w-[300px] rounded-[10px] px-[8px] pb-[10px] pt-[14px] text-menu-text shadow-2xl"
    >
      <span
        aria-hidden
        style={{ left: anchorX - menuLeft - 9 }}
        className="liquid-glass-menu absolute top-[-9px] h-[9px] w-[18px] [clip-path:polygon(50%_0,100%_100%,0_100%)]"
      />
      <h2 className="px-[10px] text-[19px] font-semibold">Actions</h2>
      <div className="mt-[12px] flex justify-between px-[4px]">
        {tabs.map(({ I, l }) => (
          <button
            key={l}
            type="button"
            onClick={() => setActiveTab(l)}
            className={`flex w-[44px] flex-col items-center gap-[3px] ${activeTab === l ? "text-menu-active" : "text-menu-text"}`}
          >
            <I className="h-[18px] w-[18px]" />
            <span className="text-[9px]">{l}</span>
          </button>
        ))}
      </div>
      <div className="mt-[10px] flex flex-col gap-[14px]">
        {(pages[activeTab] ?? []).map((grp, gi) => (
          <div key={gi} className="flex flex-col">
            {grp.title && <h3 className="px-[10px] pb-[8px] text-[11px] font-semibold">{grp.title}</h3>}
            <div className="flex flex-col rounded-[6px] bg-menu-group">
              {grp.items.map(({ l, disabled, toggle, value, slider }) => (
                <div
                  key={l}
                  className={`flex flex-col border-b border-menu-divider px-[10px] py-[8px] text-[12px] last:border-b-0 ${disabled ? "text-menu-text/40" : "active:text-menu-active"}`}
                >
                  <div className="flex items-center justify-between">
                    <span>{l}</span>
                    {toggle !== undefined && (
                      <span className={`flex h-[16px] w-[28px] items-center rounded-full px-[2px] ${toggle ? "justify-end bg-menu-active" : "justify-start bg-menu-text/40"}`}>
                        <span className="h-[12px] w-[12px] rounded-full bg-menu-text" />
                      </span>
                    )}
                    {value && <span className={slider === undefined ? "text-[10px] text-menu-text/60" : ""}>{value}</span>}
                  </div>
                  {slider !== undefined && (
                    <div className="relative mt-[8px] h-[2px] rounded-full bg-menu-divider">
                      <div className="h-full rounded-full bg-menu-active" style={{ width: `${slider}%` }} />
                      <span className="absolute top-1/2 h-[8px] w-[8px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-menu-text" style={{ left: `${slider}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
