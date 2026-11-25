import { useState } from "react";
import {
  Heart,
  Minus,
  PaintBucket,
  Plus,
  Trash2,
} from "lucide-react";

export type SelectionMode = "Automatic" | "Freehand" | "Rectangle" | "Ellipse";

interface SelectionToolbarProps {
  mode: SelectionMode;
  onModeChange: (mode: SelectionMode) => void;
  colorFillActive: boolean;
  onColorFillChange: (active: boolean) => void;
  invertActive: boolean;
  onInvertChange: (active: boolean) => void;
  onClear: () => void;
  onAdd?: () => void;
  thresholdState: { active: boolean; value: number };
}

export function SelectionToolbar({
  mode,
  onModeChange,
  colorFillActive,
  onColorFillChange,
  invertActive,
  onInvertChange,
  onClear,
  onAdd,
  thresholdState,
}: SelectionToolbarProps) {
  const [featherOpen, setFeatherOpen] = useState(false);
  const [featherValue, setFeatherValue] = useState(0);
  const [saveLoadOpen, setSaveLoadOpen] = useState(false);
  const [savedSelections, setSavedSelections] = useState<string[]>([]);

  const isAutomatic = mode === "Automatic";

  const handleSaveSelection = () => {
    setSavedSelections((prev) => [
      ...prev,
      `Selection ${prev.length + 1}`,
    ]);
  };

  return (
    <>
      {/* Top threshold indicator: only appears while actively dragging/holding in Automatic mode */}
      {isAutomatic && thresholdState.active && (
        <div className="fixed inset-x-0 top-[40px] z-20 flex h-[28px] items-center justify-center bg-black/60 shadow-lg backdrop-blur-md">
          <span className="text-[12px] font-medium tracking-wide text-white">
            Selection Threshold {thresholdState.value.toFixed(1)}%
          </span>
          <div
            className="absolute bottom-0 left-0 h-[2.5px] bg-menu-active transition-all"
            style={{ width: `${thresholdState.value}%` }}
          />
        </div>
      )}

      {/* Feather slider popup */}
      {featherOpen && (
        <div className="liquid-glass-menu fixed bottom-[95px] left-1/2 z-20 flex w-[280px] -translate-x-1/2 flex-col gap-2 rounded-xl border border-white/10 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-white">
            <span className="font-medium">Feather</span>
            <span className="font-mono text-menu-active">{featherValue}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={featherValue}
            onChange={(e) => setFeatherValue(Number(e.target.value))}
            className="glass-slider h-[22px] w-full"
          />
        </div>
      )}

      {/* Save & Load popup */}
      {saveLoadOpen && (
        <div className="liquid-glass-menu fixed bottom-[95px] left-1/2 z-20 flex w-[240px] -translate-x-1/2 flex-col rounded-xl border border-white/10 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-semibold text-white">Selections</span>
            <button
              type="button"
              onClick={handleSaveSelection}
              aria-label="Save Selection"
              className="flex h-5 w-5 items-center justify-center rounded bg-menu-active text-white hover:brightness-110"
            >
              <Plus className="h-3 w-3 stroke-[3]" />
            </button>
          </div>
          <div className="mt-2 max-h-[140px] overflow-y-auto">
            {savedSelections.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-canvas-accent">
                No saved selections
              </p>
            ) : (
              savedSelections.map((name, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-white hover:bg-white/10"
                >
                  {name}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Bottom Toolbar */}
      <aside
        aria-label="Selection toolbar"
        className="liquid-glass-menu fixed bottom-[16px] left-1/2 z-20 flex -translate-x-1/2 flex-col items-center rounded-2xl border border-white/10 px-4 py-2.5 shadow-2xl backdrop-blur-2xl"
      >
        {/* Top Row: Mode Pills */}
        <div className="flex items-center rounded-full bg-black/45 p-[3px] text-xs">
          <button
            type="button"
            onClick={() => onModeChange("Automatic")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 font-medium transition-colors ${
              mode === "Automatic"
                ? "bg-menu-active text-white shadow-sm"
                : "text-canvas-accent hover:text-white"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
              <path d="M8 0l1.5 2.5 2.8-.8-.4 2.9 2.8 1.1-1.7 2.3 1.7 2.3-2.8 1.1.4 2.9-2.8-.8L8 16l-1.5-2.5-2.8.8.4-2.9-2.8-1.1 1.7-2.3L1.3 5.7l2.8-1.1-.4-2.9 2.8.8L8 0z" />
            </svg>
            <span>Automatic</span>
          </button>

          <button
            type="button"
            onClick={() => onModeChange("Freehand")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 font-medium transition-colors ${
              mode === "Freehand"
                ? "bg-menu-active text-white shadow-sm"
                : "text-canvas-accent hover:text-white"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
              <path d="M3 12c2-6 5-8 7-4s-3 6 0 4 3-6 3-6" strokeLinecap="round" />
            </svg>
            <span>Freehand</span>
          </button>

          <button
            type="button"
            onClick={() => onModeChange("Rectangle")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 font-medium transition-colors ${
              mode === "Rectangle"
                ? "bg-menu-active text-white shadow-sm"
                : "text-canvas-accent hover:text-white"
            }`}
          >
            <span className="h-2.5 w-3.5 rounded-[2px] border border-current" />
            <span>Rectangle</span>
          </button>

          <button
            type="button"
            onClick={() => onModeChange("Ellipse")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 font-medium transition-colors ${
              mode === "Ellipse"
                ? "bg-menu-active text-white shadow-sm"
                : "text-canvas-accent hover:text-white"
            }`}
          >
            <span className="h-2.5 w-3.5 rounded-full border border-current" />
            <span>Ellipse</span>
          </button>
        </div>

        {/* Bottom Row: Actions */}
        <div className="mt-2.5 flex items-center gap-4 px-1 text-canvas-accent">
          {/* Add */}
          <button
            type="button"
            onClick={onAdd}
            disabled={isAutomatic}
            className={`flex flex-col items-center gap-1 text-[10px] ${
              isAutomatic
                ? "cursor-not-allowed opacity-35"
                : "hover:text-white"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-[5px] ${
                isAutomatic
                  ? "bg-white/10 text-white/50"
                  : "bg-menu-active text-white shadow-sm"
              }`}
            >
              <Plus className="h-3 w-3 stroke-[3]" />
            </span>
            <span>Add</span>
          </button>

          {/* Remove */}
          <button
            type="button"
            className="flex flex-col items-center gap-1 text-[10px] hover:text-white"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-white/10 text-white hover:bg-white/20">
              <Minus className="h-3 w-3 stroke-[3]" />
            </span>
            <span>Remove</span>
          </button>

          {/* Invert */}
          <button
            type="button"
            onClick={() => onInvertChange(!invertActive)}
            className={`flex flex-col items-center gap-1 text-[10px] ${
              invertActive ? "text-menu-active" : "hover:text-white"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current">
                <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2 14L14 2H2V14z" />
              </svg>
            </span>
            <span>Invert</span>
          </button>

          {/* Copy & Paste */}
          <button
            type="button"
            className="flex flex-col items-center gap-1 text-[10px] hover:text-white"
          >
            <span className="flex h-5 w-5 items-center justify-center">
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current">
                <circle cx="6" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="10" cy="8" r="4.5" fill="currentColor" />
              </svg>
            </span>
            <span>Copy &amp; Paste</span>
          </button>

          {/* Feather */}
          <button
            type="button"
            onClick={() => {
              setFeatherOpen((v) => !v);
              setSaveLoadOpen(false);
            }}
            className={`flex flex-col items-center gap-1 text-[10px] ${
              featherOpen ? "text-menu-active" : "hover:text-white"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              <svg viewBox="0 0 16 16" className="h-4 w-4 stroke-current fill-none stroke-[1.5]">
                <circle cx="8" cy="8" r="5" strokeDasharray="2 2" />
              </svg>
            </span>
            <span>Feather</span>
          </button>

          {/* Save & Load */}
          <button
            type="button"
            onClick={() => {
              setSaveLoadOpen((v) => !v);
              setFeatherOpen(false);
            }}
            className={`flex flex-col items-center gap-1 text-[10px] ${
              saveLoadOpen ? "text-menu-active" : "hover:text-white"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              <Heart className="h-4 w-4 fill-current" />
            </span>
            <span>Save &amp; Load</span>
          </button>

          {/* Color Fill */}
          <button
            type="button"
            onClick={() => onColorFillChange(!colorFillActive)}
            className={`flex flex-col items-center gap-1 text-[10px] ${
              colorFillActive ? "text-menu-active" : "hover:text-white"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              <PaintBucket className="h-4 w-4" />
            </span>
            <span>Color Fill</span>
          </button>

          {/* Clear */}
          <button
            type="button"
            onClick={onClear}
            className="flex flex-col items-center gap-1 text-[10px] hover:text-white"
          >
            <span className="flex h-5 w-5 items-center justify-center">
              <Trash2 className="h-4 w-4" />
            </span>
            <span>Clear</span>
          </button>
        </div>
      </aside>
    </>
  );
}
