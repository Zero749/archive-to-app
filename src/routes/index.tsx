import { ColorMenu, recordDrawnColor } from "@/components/ColorMenu";
import { BrushLibraryMenu } from "@/components/BrushLibraryMenu";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ActionsMenu } from "@/components/ActionsMenu";
import { AdjustmentsMenu } from "@/components/AdjustmentsMenu";
import { SelectionToolbar, type SelectionMode } from "@/components/SelectionToolbar";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { ArrowLeft, Brush, Copy, Eraser, MousePointer2, Plus, Pointer, Redo2, Undo2, Wand2, Wrench } from "lucide-react";

type CanvasPreset = { id: string; name: string; profile: string; size: string; width: number; height: number; dpi: number };

const pxFromInches = (inches: number, dpi: number) => Math.round(inches * dpi);
const pxFromMillimeters = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);
const formatPixels = (width: number, height: number) => `${width} × ${height}px`;
const getContrastingOutline = (hex: string) => {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = channels
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
};

function getScreenPixelSize() {
  if (typeof window === "undefined") return { width: 2732, height: 2048 };
  const scale = window.devicePixelRatio || 1;
  const a = Math.round(window.screen.width * scale), b = Math.round(window.screen.height * scale);
  const landscape = window.innerWidth > window.innerHeight;
  return landscape ? { width: Math.max(a, b), height: Math.min(a, b) } : { width: Math.min(a, b), height: Math.max(a, b) };
}

function makeInitialPresets(): CanvasPreset[] {
  const screen = getScreenPixelSize();
  return [
    { id: "screen", name: "Screen Size", profile: "P3", size: formatPixels(screen.width, screen.height), ...screen, dpi: 132 },
    { id: "square", name: "Square", profile: "sRGB", size: formatPixels(2048, 2048), width: 2048, height: 2048, dpi: 300 },
    { id: "4k", name: "4K", profile: "sRGB", size: formatPixels(4096, 1714), width: 4096, height: 1714, dpi: 300 },
    { id: "a4", name: "A4", profile: "sRGB", size: "210 × 297mm", width: pxFromMillimeters(210, 300), height: pxFromMillimeters(297, 300), dpi: 300 },
    { id: "photo", name: "4 × 6 Photo", profile: "sRGB", size: '6" × 4"', width: pxFromInches(6, 300), height: pxFromInches(4, 300), dpi: 300 },
    { id: "paper", name: "Paper", profile: "sRGB", size: '11" × 8.5"', width: pxFromInches(11, 300), height: pxFromInches(8.5, 300), dpi: 300 },
    { id: "comic", name: "Comic", profile: "CMYK", size: '6" × 9.5"', width: pxFromInches(6, 300), height: pxFromInches(9.5, 300), dpi: 300 },
    { id: "facepaint", name: "FacePaint", profile: "sRGB", size: formatPixels(2048, 2048), width: 2048, height: 2048, dpi: 300 },
  ];
}

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Canvas — Drawing Studio" },
    { name: "description", content: "A personal Procreate-style drawing studio." },
    { property: "og:title", content: "Canvas — Drawing Studio" },
    { property: "og:description", content: "A personal Procreate-style drawing studio." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Index,
});

function Index() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuAnchorX, setMenuAnchorX] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(true);
  const [newCanvasOpen, setNewCanvasOpen] = useState(false);
  const [presetActionsOpen, setPresetActionsOpen] = useState(false);
  const [presets, setPresets] = useState(makeInitialPresets);
  const [deletedPresets, setDeletedPresets] = useState<string[]>([]);
  const [revealedPreset, setRevealedPreset] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<CanvasPreset | null>(null);
  const [creatingPreset, setCreatingPreset] = useState(false);
  const [canvasSize, setCanvasSize] = useState(() => { const screen = getScreenPixelSize(); return { width: screen.width, height: screen.height }; });
  const [initialImage, setInitialImage] = useState<HTMLImageElement | null>(null);
  const presetSwipeStart = useRef<{ id: string; x: number; y: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const modifyHandleRef = useRef<HTMLSpanElement>(null);
  const sidebarGestureRef = useRef<{ pointerId: number; startX: number; startY: number; pointerOffsetY: number; mode: "pull" | "move" } | null>(null);
  const { begin, commit, cancel, undo, redo } = useCanvasHistory(canvasRef);
  const [brushActive, setBrushActive] = useState(false);
  const [currentColor, setCurrentColor] = useState("#000000");
  const colorOutline = getContrastingOutline(currentColor);
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [brushSize, setBrushSize] = useState(50);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null);
  const pickedRef = useRef(false);
  useEffect(() => {
    if (!eyedropperActive) {
      setLoupe(null);
      return;
    }
    pickedRef.current = false;
    setLoupe({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const down = (e: PointerEvent) => setLoupe({ x: e.clientX, y: e.clientY });
    const move = (e: PointerEvent) => {
      if (e.buttons > 0 || e.pointerType === "pen") setLoupe({ x: e.clientX, y: e.clientY });
    };
    const up = () => {
      if (pickedRef.current) setEyedropperActive(false);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
    };
  }, [eyedropperActive]);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("Freehand");
  const [colorFillActive, setColorFillActive] = useState(false);
  const [invertActive, setInvertActive] = useState(false);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [sidebarPulledOut, setSidebarPulledOut] = useState(false);
  const [sidebarTop, setSidebarTop] = useState<number | null>(null);
  const [thresholdState, setThresholdState] = useState({ active: false, value: 47.4 });
  const isSelectionActive = openMenu === "Selection";

  useEffect(() => {
    const updateScreenPreset = () => {
      const screen = getScreenPixelSize();
      setPresets((current) => current.map((preset) => preset.id === "screen" ? { ...preset, ...screen, size: formatPixels(screen.width, screen.height) } : preset));
    };
    window.addEventListener("resize", updateScreenPreset);
    window.addEventListener("orientationchange", updateScreenPreset);
    return () => { window.removeEventListener("resize", updateScreenPreset); window.removeEventListener("orientationchange", updateScreenPreset); };
  }, []);

  useEffect(() => {
    if (!openMenu || openMenu === "Selection") return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [openMenu]);

  const handleToolClick = (label: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    menuButtonRef.current = e.currentTarget;
    setMenuAnchorX(rect.left + rect.width / 2);
    setOpenMenu((current) => { const next = current === label ? null : label; if (next === "Selection") setBrushActive(false); return next; });
  };
  const handleBrushClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (openMenu === "Selection") setOpenMenu(null);
    const rect = e.currentTarget.getBoundingClientRect();
    menuButtonRef.current = e.currentTarget;
    setMenuAnchorX(rect.left + rect.width / 2);
    setBrushActive(true);
    setOpenMenu((current) => current === "BrushLibrary" ? null : "BrushLibrary");
  };
  const handleSidebarPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const handle = modifyHandleRef.current?.getBoundingClientRect();
    if (!handle) return;
    if (sidebarPulledOut) { if (!modifyHandleRef.current?.contains(e.target as Node)) return; }
    else if (e.clientX > 12 || e.clientY < handle.top - 6 || e.clientY > handle.bottom + 6) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const bounds = e.currentTarget.getBoundingClientRect();
    sidebarGestureRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, pointerOffsetY: e.clientY - (bounds.top + bounds.height / 2), mode: sidebarPulledOut ? "move" : "pull" };
  };
  const handleSidebarPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const gesture = sidebarGestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const dx = e.clientX - gesture.startX; const dy = e.clientY - gesture.startY;
    if (gesture.mode === "pull") { if (dx < 16) return; gesture.mode = "move"; setSidebarPulledOut(true); }
    else if (dx <= -24 && Math.abs(dy) < 20) { setSidebarPulledOut(false); return; }
    const height = e.currentTarget.getBoundingClientRect().height;
    const minTop = (headerRef.current?.getBoundingClientRect().bottom ?? 40) + height / 2 + 8;
    setSidebarTop(Math.max(minTop, Math.min(Math.max(minTop, window.innerHeight - height / 2), e.clientY - gesture.pointerOffsetY)));
  };
  const endSidebarGesture = (e: React.PointerEvent<HTMLElement>) => { if (sidebarGestureRef.current?.pointerId === e.pointerId) sidebarGestureRef.current = null; };

  const openPresetEditor = (preset: CanvasPreset) => { setEditingPreset({ ...preset }); setCreatingPreset(false); setRevealedPreset(null); setPresetActionsOpen(false); };
  const createNewPreset = () => {
    setEditingPreset({ id: `preset-${Date.now()}`, name: "New Preset", profile: "sRGB", size: formatPixels(2048, 2048), width: 2048, height: 2048, dpi: 300 });
    setCreatingPreset(true); setPresetActionsOpen(false); setNewCanvasOpen(false);
  };
  const savePresetEdit = () => {
    if (!editingPreset) return;
    const saved = { ...editingPreset, size: formatPixels(editingPreset.width, editingPreset.height) };
    if (creatingPreset) setPresets((current) => [...current, saved]);
    else setPresets((current) => current.map((preset) => preset.id === saved.id ? saved : preset));
    setEditingPreset(null); setCreatingPreset(false);
  };
  const selectPreset = (preset: CanvasPreset) => {
    setCanvasSize({ width: preset.width, height: preset.height });
    setInitialImage(null);
    setNewCanvasOpen(false);
    setGalleryOpen(false);
  };
  const importPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (!image.naturalWidth || !image.naturalHeight) {
        alert(`Couldn't read "${file.name}" as an image.`);
        return;
      }
      setInitialImage(image);
      setCanvasSize({ width: image.naturalWidth, height: image.naturalHeight });
      setNewCanvasOpen(false);
      setGalleryOpen(false);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      alert(`Couldn't open "${file.name}" as an image.`);
    };
    image.src = objectUrl;
  };
  const updateEditingPreset = (updates: Partial<CanvasPreset>) => setEditingPreset((preset) => preset ? { ...preset, ...updates } : preset);

  if (editingPreset) {
    const maxLayers = Math.max(1, Math.floor(256_000_000 / (editingPreset.width * editingPreset.height)));
    return <main className="fixed inset-0 overflow-y-auto bg-[#202020] text-menu-text">
      <header className="liquid-glass fixed inset-x-0 top-0 z-10 flex h-[52px] items-center justify-between border-b border-white/10 px-4">
        <button type="button" onClick={() => { setEditingPreset(null); setCreatingPreset(false); }} className="flex items-center gap-2 text-canvas-accent hover:text-white"><ArrowLeft className="h-4 w-4" /> Back</button>
        <h1 className="text-[15px] font-semibold text-white">Custom Canvas</h1>
        <button type="button" onClick={savePresetEdit} className="text-[14px] font-medium text-menu-text hover:text-white">Done</button>
      </header>
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5 px-5 pb-8 pt-[72px]">
        <label className="flex flex-col gap-2 text-[13px]">Name<input value={editingPreset.name} onChange={(e) => updateEditingPreset({ name: e.target.value })} className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2.5 text-white outline-none focus:border-white/30" /></label>
        <section className="liquid-glass-menu rounded-xl border border-white/10 p-4"><h2 className="mb-4 text-[14px] font-semibold text-white">Canvas dimensions</h2><div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2 text-[12px] text-canvas-accent">Width (px)<input type="number" min="1" value={editingPreset.width} onChange={(e) => updateEditingPreset({ width: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-white" /></label>
          <label className="flex flex-col gap-2 text-[12px] text-canvas-accent">Height (px)<input type="number" min="1" value={editingPreset.height} onChange={(e) => updateEditingPreset({ height: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-white" /></label>
          <label className="flex flex-col gap-2 text-[12px] text-canvas-accent">DPI<input type="number" min="1" value={editingPreset.dpi} onChange={(e) => updateEditingPreset({ dpi: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-white" /></label>
          <label className="flex flex-col gap-2 text-[12px] text-canvas-accent">Color profile<select value={editingPreset.profile} onChange={(e) => updateEditingPreset({ profile: e.target.value })} className="w-full rounded-lg border border-white/10 bg-[#252525] px-3 py-2 text-white"><option>sRGB</option><option>P3</option><option>CMYK</option></select></label>
        </div><p className="mt-3 text-[11px] text-canvas-accent">Preset size: {formatPixels(editingPreset.width, editingPreset.height)}</p></section>
        <section className="liquid-glass-menu rounded-xl border border-white/10 p-4"><div className="flex items-center justify-between"><div><h2 className="text-[14px] font-semibold text-white">Maximum layers</h2><p className="mt-1 text-[11px] text-canvas-accent">Estimated for this canvas size</p></div><span className="rounded-lg bg-white/[0.08] px-3 py-2 text-[15px] font-semibold text-white">{maxLayers}</span></div><p className="mt-3 text-[10px] leading-relaxed text-canvas-accent/80">The available layer count may vary with device memory and canvas settings.</p></section>
      </div>
    </main>;
  }

  if (galleryOpen) return <main className="fixed inset-0 overflow-hidden text-menu-text" style={{ backgroundColor: "#202020" }} onPointerDown={(e) => { const target = e.target as HTMLElement; if (!target.closest("[data-preset-menu-region]")) setPresetActionsOpen(false); if (!target.closest("[data-new-canvas], [data-new-canvas-button]")) setNewCanvasOpen(false); }}>
    <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={importPhoto} />
    <header className="liquid-glass fixed inset-x-0 top-0 z-30 flex h-[68px] items-center justify-between border-b border-white/[0.03] pl-[32px] pr-[14px]" style={{ backgroundColor: "#1b1b1b" }}>
      <button type="button" onClick={() => { setNewCanvasOpen(false); setGalleryOpen(false); }} className="text-[29px] font-semibold leading-none tracking-[-0.8px] text-[#f2f2f2]">Procreate</button>
      <div className="flex items-center gap-[20px] text-[14px] text-[#c5c5c5]"><button type="button" className="hover:text-white">Select</button><button type="button" className="hover:text-white">Import</button><button type="button" onClick={() => photoInputRef.current?.click()} className="hover:text-white">Photo</button><button data-new-canvas-button type="button" aria-label="New canvas" aria-expanded={newCanvasOpen} onClick={() => { setNewCanvasOpen((open) => !open); setPresetActionsOpen(false); }} className="ml-[3px] flex h-[30px] w-[30px] items-center justify-center text-[#c5c5c5] hover:text-white"><Plus className="h-[22px] w-[22px]" strokeWidth={1.35} /></button></div>
    </header>
    {newCanvasOpen && <section data-new-canvas className="liquid-glass-menu fixed right-0 top-[80px] z-40 w-[min(316px,calc(100vw-16px))] overflow-visible rounded-l-[10px] rounded-r-[0px] border border-white/10 p-[8px] text-menu-text shadow-2xl">
      <span aria-hidden="true" className="absolute -top-[9px] right-[15px] h-[9px] w-[18px] [clip-path:polygon(50%_0,100%_100%,0_100%)] bg-[oklch(0.08_0_0_/_82%)]" />
      <div data-preset-menu-region className="relative flex h-[40px] items-center justify-between px-[11px]"><h2 className="text-[19px] font-semibold leading-none text-[#e2e2e2]">New canvas</h2><button type="button" aria-label="New preset" onClick={createNewPreset} className="text-[#c5c5c5] transition-colors hover:text-white"><svg viewBox="0 0 28 28" className="h-[21px] w-[21px]" aria-hidden="true"><rect x="3" y="8" width="15" height="16" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><rect x="10" y="3" width="15" height="16" rx="1.5" fill="oklch(0.12 0 0)" stroke="currentColor" strokeWidth="1.7" /><path d="M17.5 7v8M13.5 11h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button></div>
      <div className="mt-[2px] flex flex-col gap-[3px]">{presets.filter((preset) => !deletedPresets.includes(preset.id)).map((preset) => {
        const isRevealed = revealedPreset === preset.id;
        return <div key={preset.id} className="relative h-[32px] overflow-hidden rounded-[5px] touch-pan-y" onPointerDown={(e) => { presetSwipeStart.current = { id: preset.id, x: e.clientX, y: e.clientY }; }} onPointerUp={(e) => { const start = presetSwipeStart.current; presetSwipeStart.current = null; if (!start || start.id !== preset.id) return; const dx = e.clientX - start.x; const dy = e.clientY - start.y; if (dx < -35 && Math.abs(dx) > Math.abs(dy)) setRevealedPreset(preset.id); else if (dx > 35 && Math.abs(dx) > Math.abs(dy)) setRevealedPreset(null); }} onPointerCancel={() => { presetSwipeStart.current = null; }}>
          {isRevealed && <div className="absolute inset-y-0 right-0 flex items-center gap-[5px] pr-[5px]"><button type="button" onClick={() => openPresetEditor(preset)} className="h-[25px] rounded-[4px] border border-white/10 bg-white/[0.08] px-[10px] text-[11px] font-medium text-menu-text hover:bg-white/[0.14] hover:text-white">Edit</button><button type="button" onClick={() => { setDeletedPresets((ids) => [...ids, preset.id]); setRevealedPreset(null); }} className="h-[25px] rounded-[4px] bg-red-600 px-[9px] text-[11px] font-medium text-white hover:bg-red-500">Delete</button></div>}
          <button type="button" onClick={() => { if (isRevealed) return; selectPreset(preset); }} style={{ transform: isRevealed ? "translateX(-118px)" : "translateX(0)" }} className="relative z-[1] flex h-full w-full items-center justify-between rounded-[5px] bg-white/[0.07] px-[11px] text-left transition-transform duration-200 hover:bg-white/[0.12]"><span className="text-[13px] font-medium text-[#d7d7d7]">{preset.name}</span><span className="flex items-center gap-[6px] text-[10px] text-[#a3a3a3]"><span className="rounded-full bg-white/[0.08] px-[6px] py-[2px]">{preset.profile}</span><span className="rounded-full bg-white/[0.08] px-[6px] py-[2px]">{preset.size}</span></span></button>
        </div>;
      })}</div>
    </section>}
  </main>;

  return <div className="canvas-grid relative min-h-screen w-full overflow-hidden">
    <DrawingCanvas
      ref={canvasRef}
      canvasWidth={canvasSize.width}
      canvasHeight={canvasSize.height}
      initialImage={initialImage}
      brushActive={brushActive && !isSelectionActive}
      selectionActive={isSelectionActive}
      selectionMode={selectionMode}
      selectionColorFill={colorFillActive}
      currentColor={currentColor}
      invertSelection={invertActive}
      clearSelectionTrigger={clearTrigger}
      onThresholdUpdate={(active, value) => setThresholdState({ active, value: active ? value : thresholdState.value })}
      onUndo={undo}
      onRedo={redo}
      onStrokeStart={begin}
      onStrokeEnd={() => {
        commit();
        recordDrawnColor(currentColor);
      }}
      onStrokeCancel={cancel}
      brushSize={brushSize}
      brushOpacity={brushOpacity}
      eyedropperActive={eyedropperActive}
      onPickColor={(c) => {
        setCurrentColor(c);
        pickedRef.current = true;
      }}

    />
    {loupe && (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-30 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
        style={{
          left: loupe.x,
          top: loupe.y,
          borderColor: `${colorOutline}B3`,
          boxShadow: `inset 0 0 0 14px ${currentColor}, 0 6px 20px rgba(0,0,0,0.5)`,
        }}
      >
        <span
          className="absolute left-1/2 top-[-10px] h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[8px] border-x-transparent"
          style={{ borderBottomColor: `${colorOutline}B3` }}
        />
        <span
          className="absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{ borderColor: `${colorOutline}B3` }}
        />
      </div>
    )}
    <header ref={headerRef} className="liquid-glass fixed inset-x-0 top-0 z-10 flex h-[40px] items-center justify-between border-b border-canvas-grid px-[12px] text-canvas-accent" style={{ backgroundColor: "oklch(0.23 0 0 / 82%)" }}>
      <div className="flex items-center gap-[10px]"><button type="button" onClick={() => { setOpenMenu(null); setBrushActive(false); setGalleryOpen(true); setNewCanvasOpen(false); }} className="mr-[4px] text-[14px] transition-colors hover:text-white">Gallery</button>{[{ I: Wrench, l: "Actions" }, { I: Wand2, l: "Adjustments" }, { I: null, l: "Selection" }, { I: MousePointer2, l: "Transform" }].map(({ I, l }, index) => <button key={l} aria-label={l} type="button" onClick={(e) => handleToolClick(l, e)} className={`flex h-[26px] w-[26px] items-center justify-center rounded-full transition-colors ${index > 0 ? "ml-[8px]" : ""} ${openMenu === l ? "bg-menu-active text-paper" : "bg-canvas-icon-circle text-canvas-accent"}`}>{I ? <I className="h-[14px] w-[14px]" /> : <span className="text-[14px] font-semibold italic leading-none">S</span>}</button>)}</div>
      <div className="flex items-center gap-[30px]"><button aria-label="Brush" type="button" onClick={handleBrushClick} className={(brushActive || openMenu === "BrushLibrary") && !isSelectionActive ? "text-menu-active" : undefined}><Brush className="h-[17px] w-[17px]" /></button><button aria-label="Smudge" type="button"><Pointer className="h-[17px] w-[17px]" /></button><button aria-label="Eraser" type="button"><Eraser className="h-[17px] w-[17px]" /></button><button aria-label="Layers" type="button"><Copy className="h-[17px] w-[17px]" /></button><button aria-label="Color" type="button" onClick={(e) => handleToolClick("Color", e)} style={{ backgroundColor: currentColor }} className="h-[24px] w-[24px] rounded-full border border-canvas-accent transition-colors" /></div>
    </header>
    {openMenu === "Actions" && <ActionsMenu ref={menuRef} anchorX={menuAnchorX} />}{openMenu === "Adjustments" && <AdjustmentsMenu ref={menuRef} anchorX={menuAnchorX} />}{openMenu === "BrushLibrary" && <BrushLibraryMenu ref={menuRef} anchorX={menuAnchorX} />}{openMenu === "Color" && <ColorMenu ref={menuRef} anchorX={menuAnchorX} color={currentColor} onChange={setCurrentColor} />}
    {isSelectionActive && <SelectionToolbar mode={selectionMode} onModeChange={setSelectionMode} colorFillActive={colorFillActive} onColorFillChange={setColorFillActive} invertActive={invertActive} onInvertChange={setInvertActive} thresholdState={thresholdState} onClear={() => setClearTrigger((c) => c + 1)} />}
    {!isSelectionActive && <aside className="liquid-glass-strong fixed right-0 z-10 flex w-[38px] flex-col items-center rounded-l-md pb-[15px] pt-[6px]" onPointerDown={handleSidebarPointerDown} onPointerMove={handleSidebarPointerMove} onPointerUp={endSidebarGesture} onPointerCancel={endSidebarGesture} style={{ top: sidebarTop === null ? "50%" : `${sidebarTop}px`, transform: `translateX(${sidebarPulledOut ? -24 : 0}px) translateY(-50%)` }}>
      {sidebarPulledOut && <div aria-hidden="true" className="sidebar-pull-extension absolute -right-[24px] top-0 bottom-0 w-[24px]" />}
      <div className="relative h-[148px] w-[29px] shrink-0"><input aria-label="Brush size" className="glass-slider absolute left-1/2 top-1/2 h-[29px] w-[148px] -translate-x-1/2 -translate-y-1/2 rotate-90" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} max={100} min={1} type="range" /></div>
            <div className="relative flex h-[74px] w-full shrink-0 items-center justify-center">
        <button
          type="button"
          aria-label="Color picker"
          onClick={(e) => {
            if (!sidebarPulledOut) {
              e.stopPropagation();
              setEyedropperActive((prev) => !prev);
            }
          }}
          className="flex h-[28px] w-[28px] items-center justify-center"
        >
          <span
            ref={modifyHandleRef}
            className={`block h-[18px] w-[18px] rounded-[5px] border transition-colors border-canvas-accent ${sidebarPulledOut ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
            title={
              sidebarPulledOut
                ? "Drag to move; swipe left to dock"
                : eyedropperActive
                ? "Color picker active (click to exit)"
                : "Click for color picker; swipe in to pull"
            }
          />
        </button>
      </div>
      <div className="relative h-[148px] w-[29px] shrink-0"><input aria-label="Brush opacity" className="glass-slider absolute left-1/2 top-1/2 h-[29px] w-[148px] -translate-x-1/2 -translate-y-1/2 -rotate-90" value={brushOpacity} onChange={(e) => setBrushOpacity(Number(e.target.value))} max={100} min={1} type="range" /></div>
      <button aria-label="Undo" onClick={undo} className="mt-[8px] flex h-[25px] items-center justify-center text-canvas-accent/22" type="button"><Undo2 className="h-[16px] w-[16px]" /></button><button aria-label="Redo" onClick={redo} className="flex h-[25px] items-center justify-center text-canvas-accent/22" type="button"><Redo2 className="h-[16px] w-[16px]" /></button>
    </aside>}
  </div>;
}
