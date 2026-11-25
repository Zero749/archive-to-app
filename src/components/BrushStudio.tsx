import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Activity, Box, Check, ChevronDown, ChevronRight, Clipboard, Droplet, ExternalLink, FileImage, Folder, Gauge, Grid3X3, Info, Library, List, Pencil, Search, Shapes, SlidersHorizontal, Sparkles, Spline, Waves, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { STUDIO_PAGES, type BrushSettings, type SettingValue, type StudioControl } from "./brushStudioData";
import { DrawingCanvas } from "./DrawingCanvas";
import { BrushStrokePreview } from "./BrushStrokePreview";
import { GRAIN_SOURCES, SHAPE_SOURCES, type BrushSourceOption } from "./brushSources";
import { activeBrush, selectBrush, setActiveSettings, withDefaults, type Brush } from "./brushImport";
import swatchAsset from "@/assets/brush-studio-swatches.png.asset.json";
import sourceAsset from "@/assets/brush-studio-sources.png.asset.json";
import materialAsset from "@/assets/brush-studio-material.png.asset.json";

const NAV: { name: string; icon: LucideIcon }[] = [
  { name: "Stroke path", icon: Spline }, { name: "Stabilization", icon: Activity }, { name: "Taper", icon: Waves },
  { name: "Shape", icon: Shapes }, { name: "Grain", icon: Grid3X3 }, { name: "Rendering", icon: Pencil },
  { name: "Wet Mix", icon: Droplet }, { name: "Color dynamics", icon: Sparkles }, { name: "Dynamics", icon: Gauge },
  { name: "Apple Pencil", icon: Pencil }, { name: "Properties", icon: List }, { name: "Materials", icon: Box },
  { name: "Preview", icon: Waves }, { name: "About this brush", icon: Info },
];
function StudioButton({ children, className = "", ...props }: React.ComponentProps<typeof Button>) {
  return <Button variant="studio" className={className} {...props}>{children}</Button>;
}

function sliderText(control: Extract<StudioControl, { kind: "slider" }>, v: number) {
  if (control.unit === "count" || control.id === "count") return String(Math.round(v));
  if (control.centered) return `${Math.round(v)}%`;
  if (v === 0) return "None";
  if (v === 100 && (control.max ?? 100) === 100) return "Max";
  return `${Math.round(v)}%`;
}

function Control({ control, value, onChange }: { control: StudioControl; value?: SettingValue | undefined; onChange?: (v: SettingValue) => void }) {
  const initial: SettingValue = control.kind === "slider" || control.kind === "toggle" || control.kind === "menu" ? control.value : control.kind === "choices" ? control.selected : 0;
  const [local, setLocal] = useState<SettingValue>(initial);
  const [menu, setMenu] = useState(false);
  const v = value ?? local;
  const set = (next: SettingValue) => { setLocal(next); onChange?.(next); };
  if (control.kind === "graphic") return <Graphic kind={control.graphic} />;
  if (control.kind === "toggle") return <div className="studio-toggle-row"><span>{control.label}</span><Switch aria-label={control.label} checked={v === true} onCheckedChange={set} className="studio-switch" /></div>;
  if (control.kind === "choices") return <div className={control.segmented ? "studio-segments" : "studio-choices"}>{control.options.map(option => <StudioButton key={option} className={v === option ? "is-selected" : ""} onClick={() => set(option)} aria-pressed={v === option}>{control.segmented && <Grid3X3 />}{option}{!control.segmented && v === option && <Check />}</StudioButton>)}</div>;
  if (control.kind === "menu") return <div className="studio-mode-row"><span>{control.label}</span><StudioButton onClick={() => setMenu(!menu)}>{String(v)}</StudioButton>{menu && <div className="studio-mode-options">{control.options.map(option => <StudioButton key={option} onClick={() => { set(option); setMenu(false); }}>{option}{option === v && <Check />}</StudioButton>)}</div>}</div>;
  const isCentered = Boolean(control.centered);
  const min = isCentered ? -100 : 0;
  const max = control.max ?? 100;
  const num = typeof v === "number" ? v : control.value;
  const centeredLeft = isCentered ? (num < 0 ? 50 + (num / 100) * 50 : 50) : 0;
  const centeredWidth = isCentered ? (Math.abs(num) / 100) * 50 : 0;
  return (
    <div className="studio-slider-row">
      <div>
        <span>{control.label}</span>
        <span className="studio-value">{sliderText(control, num)}</span>
      </div>
      <div className={`studio-slider-wrapper ${isCentered ? "is-centered" : ""}`}>
        <Slider
          aria-label={control.label}
          min={control.id === "count" ? 1 : min}
          max={max}
          step={1}
          value={[num]}
          onValueChange={(next) => {
            const n = next[0];
            if (n !== undefined) set(n);
          }}
          className={`studio-slider ${isCentered ? "is-centered" : ""}`}
        />
        {isCentered && <span className="studio-slider-centered-fill" style={{ left: `${centeredLeft}%`, width: `${centeredWidth}%` }} />}
      </div>
    </div>
  );
}

function Graphic({ kind }: { kind: "taper" | "pressure" | "roundness" | "tilt" }) {
  if (kind === "taper") return <div className="studio-taper"><i /><span /><i /></div>;
  return <div className={`studio-graphic studio-graphic-${kind}`}>
    {kind === "pressure" && <svg viewBox="0 0 300 300" aria-label="Pressure curve"><path d="M 5 295 L 295 5" /><circle cx="5" cy="295" r="3.5" /><circle cx="295" cy="5" r="3.5" /></svg>}
    {kind === "roundness" && <><span className="studio-roundness-ring" /><i className="studio-point-top" /><i className="studio-point-bottom" /><i className="studio-point-right" /><span className="studio-angle">0°</span></>}
    {kind === "tilt" && <><span className="studio-tilt-arc" /><span className="studio-angle">9°</span></>}
  </div>;
}

function SourceTile({ index, label, image, onClick }: { index: number; label?: string; image?: string; onClick?: () => void }) {
  const tile = <span className={`studio-source-tile ${image ? "studio-source-custom" : `studio-source-${index}`}`}><img className={image ? "studio-source-image" : undefined} src={image ?? sourceAsset.url} alt="" /></span>;
  return onClick ? <StudioButton className="studio-source-item" onClick={onClick}>{tile}<span>{label}</span></StudioButton> : tile;
}

function SourceBlock({ title, index, onEdit, image, empty = false }: { title: string; index: number; onEdit: () => void; image?: string | undefined; empty?: boolean }) {
  return <section className="studio-source-block"><div className="studio-section-heading"><h3>{title}</h3><StudioButton className="studio-edit" onClick={onEdit}>Edit</StudioButton></div>{image ? <SourceTile index={index} label={title} image={image} /> : empty ? <span className="studio-source-tile studio-source-empty">No source selected</span> : <SourceTile index={index} />}</section>;
}

function SourceEditor({ type, onClose, onPick, onImport, sourceIndex, sourceImages }: { type: string; onClose: () => void; onPick: (source: BrushSourceOption) => void; onImport: (dataUrl: string) => void; sourceIndex: number; sourceImages: { shape: string | undefined; grain: string | undefined } }) {
  const [importOpen, setImportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [tab, setTab] = useState(type === "Shape" ? "Shape Source" : "Grain Source");
  const [search, setSearch] = useState("");
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const items = tab === "Shape Source" ? SHAPE_SOURCES : GRAIN_SOURCES;
  const currentImage = tab === "Shape Source" ? sourceImages.shape : sourceImages.grain;
  return <>
    <div className="studio-editor-backdrop" />
    <section className="studio-editor" role="dialog" aria-label={`${type} Editor`}>
      <header className="studio-editor-header"><h2>{type} Editor</h2><div><StudioButton onClick={() => setImportOpen(!importOpen)} aria-expanded={importOpen}>Import</StudioButton>{type !== "Shape" && <StudioButton className={autoRepeat ? "is-selected" : ""} onClick={() => setAutoRepeat(!autoRepeat)}>Auto repeat</StudioButton>}<StudioButton onClick={onClose}>Cancel</StudioButton><StudioButton className="studio-done" onClick={() => { if (uploaded) onImport(uploaded); onClose(); }}>Done</StudioButton></div></header>
      <div className={`studio-editor-source ${type === "Shape" ? "is-shape" : ""} ${autoRepeat ? "is-repeating" : ""}`}>{uploaded ? <img src={uploaded} alt="Imported source" /> : type === "Shape" || type === "Grain" ? currentImage ? <SourceTile index={sourceIndex} label={tab} image={currentImage} /> : <span className="studio-source-tile studio-source-empty">No source selected</span> : <SourceTile index={sourceIndex} />}</div>
      {autoRepeat && <div className="studio-repeat-controls"><Control control={{ kind: "slider", id: "local1", label: "Grain scale", value: 1 }} /><Control control={{ kind: "slider", id: "local2", label: "Rotate", value: 0 }} /><Control control={{ kind: "slider", id: "local3", label: "Border overlap", value: 100 }} /><Control control={{ kind: "slider", id: "local4", label: "Mask hardness", value: 0 }} /><Control control={{ kind: "toggle", id: "local5", label: "Mirror overlap", value: false }} /><Control control={{ kind: "toggle", id: "local6", label: "Pyramid blending", value: true }} /></div>}
      <input type="file" ref={fileRef} hidden accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) { const r = new FileReader(); r.onload = () => { if (typeof r.result === "string") setUploaded(r.result); }; r.readAsDataURL(file); setImportOpen(false); } e.target.value = ""; }} />
      {importOpen && <div className={`studio-import-popover ${type === "Shape" ? "is-shape" : ""}`}><h3>Image source options</h3>{[{ label: "Import a photo", icon: FileImage }, { label: "Import a file", icon: Folder }, { label: "Source Library", icon: Library }, { label: "Paste", icon: Clipboard }].map(({ label, icon: Icon }) => <StudioButton key={label} onClick={() => { if (label === "Source Library") setLibraryOpen(true); else if (label !== "Paste") fileRef.current?.click(); else setImportOpen(false); }}><Icon />{label}</StudioButton>)}</div>}
    </section>
    {libraryOpen && <><div className="studio-library-backdrop" /><section className="studio-source-library" role="dialog" aria-label="Source Library"><header><h2>Source Library</h2><StudioButton onClick={() => setLibraryOpen(false)}>Cancel</StudioButton></header><div className="studio-library-toolbar"><StudioButton className={tab === "Shape Source" ? "is-active" : ""} onClick={() => setTab("Shape Source")}>Shape Source</StudioButton><StudioButton className={tab === "Grain Source" ? "is-active" : ""} onClick={() => setTab("Grain Source")}>Grain Source</StudioButton><label><Search /><input aria-label="Search Library" placeholder="Search Library" value={search} onChange={e => setSearch(e.target.value)} /></label></div><div className="studio-source-grid">{items.filter(source => source.name.toLowerCase().includes(search.toLowerCase())).map(source => <SourceTile key={source.name} label={source.name} image={source.image} index={source.index} onClick={() => { onPick(source); setLibraryOpen(false); setImportOpen(false); }} />)}</div></section></>}
  </>;
}

export function BrushStudio({ brush, onClose, onSave }: { brush: Brush; onClose: () => void; onSave: (brush: Brush) => void }) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<Brush>(() => ({ ...brush, settings: withDefaults(brush.settings) }));
  const settings = withDefaults(draft.settings);
  const change = (id: string, v: SettingValue) => setDraft(d => {
    const current = withDefaults(d.settings);
    const next = { ...current, [id]: v };
    if (current['pTaperLink']) {
      if (id === "pTaperLength") next['pTaperEndLength'] = v;
      else if (id === "pTaperEndLength") next['pTaperLength'] = v;
    }
    if (current['tTaperLink']) {
      if (id === "tTaperLength") next['tTaperEndLength'] = v;
      else if (id === "tTaperEndLength") next['tTaperLength'] = v;
    }
    setActiveSettings(next);
    return { ...d, settings: next };
  });
  const replaceSettings = (next: BrushSettings) => { setActiveSettings(next); setDraft(d => ({ ...d, settings: { ...next } })); };
  const setPicture = (type: string, url: string) => setDraft(d => { const next = type === "Shape" ? { ...d, shape: url } : { ...d, grain: url }; void selectBrush(next); return next; });
  const cancel = () => { void selectBrush(brush); onClose(); };
  const done = () => { onSave(draft); onClose(); };
  const [page, setPage] = useState("Stroke path");
  const [editor, setEditor] = useState<string | null>(null);
  const [materialOpen, setMaterialOpen] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [padClear, setPadClear] = useState(0);
  const [resetPoint, setResetPoint] = useState(false);
  const [sources, setSources] = useState<Record<string, number>>({ Shape: 6, Grain: 5, Metallic: 0, Roughness: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (editor) setEditor(null); else cancel(); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); });
  if (!mounted) return null;
  const sourceIndex = (type: string) => sources[type] ?? 0;
  const section = (title: string, children: ReactNode) => <section className="studio-section"><h3>{title}</h3>{children}</section>;
  return createPortal(<div className="brush-studio" role="dialog" aria-modal="true" aria-label="Brush Studio" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <nav className="studio-nav"><h1>Brush Studio</h1><div className="studio-swatches"><img src={swatchAsset.url} alt="Brush stroke previews" /><span /></div><div className="studio-nav-list">{NAV.map(({ name, icon: Icon }) => <StudioButton key={name} aria-pressed={page === name} className={page === name ? "is-selected" : ""} onClick={() => { setPage(name); setPadOpen(false); scrollRef.current?.scrollTo(0, 0); }}><Icon /><span>{name}</span></StudioButton>)}</div></nav>
    <div className="studio-settings" ref={scrollRef} key={page}>
      {(page === "Shape" || page === "Grain") && <SourceBlock title={`${page} Source`} index={sourceIndex(page)} image={page === "Shape" ? draft.shape : draft.grain} empty onEdit={() => setEditor(page)} />}
      {page === "Preview" && section("Preview render", <div className="studio-render-preview"><span>{draft.name}</span><BrushStrokePreview brush={draft} /></div>)}
      {(STUDIO_PAGES[page] ?? []).map(({ title, controls }) => <section key={title} className="studio-section"><h3>{title}</h3>{controls.map((control, index) => <Control key={`${page}-${title}-${index}`} control={control} {...(control.kind !== "graphic" ? { value: settings[control.id], onChange: (v: SettingValue) => change(control.id, v) } : {})} />)}</section>)}
      {page === "Materials" && <><h3 className="studio-page-heading">3D Materials</h3>{["Metallic", "Roughness"].map(type => <section className="studio-material-section" key={type}><StudioButton className="studio-material-heading" onClick={() => setMaterialOpen(materialOpen === type ? null : type)} aria-expanded={materialOpen === type}>{type}{materialOpen === type ? <ChevronDown /> : <ChevronRight />}</StudioButton>{materialOpen === type && <div className="studio-material-content"><Control control={{ kind: "slider", id: "local7", label: "Amount", value: type === "Metallic" ? 31 : 17 }} /><SourceBlock title={`${type} Source`} index={sourceIndex(type)} onEdit={() => setEditor(type)} /><Control control={{ kind: "slider", id: "local8", label: "Scale", value: 10 }} /></div>}</section>)}</>}
      {page === "About this brush" && <><input className="studio-brush-name" aria-label="Brush name" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /><section className="studio-about"><p>Made by You</p><small>Created on 26/8/2025, 12:16 PM</small><div className="studio-signature" contentEditable suppressContentEditableWarning aria-label="Your signature">Your Signature Here</div></section><StudioButton className="studio-reset-row" onClick={() => { setResetPoint(true); setDraft(d => ({ ...d, resetSettings: { ...settings } })); }}>Create new reset point</StudioButton><StudioButton className="studio-reset-row" onClick={() => { setResetPoint(false); replaceSettings(withDefaults(draft.resetSettings)); }}><span>Reset brush<small><Check />Last reset point: {resetPoint ? "Just now" : "26/8/2025, 12:16 PM"}</small></span></StudioButton></>}
    </div>
    <main className="studio-drawing-pad"><header><StudioButton className="studio-pad-button" aria-expanded={padOpen} onClick={() => setPadOpen(!padOpen)}><ExternalLink />Drawing Pad</StudioButton><div><StudioButton onClick={cancel}>Cancel</StudioButton><StudioButton className="studio-done" onClick={done}>Done</StudioButton></div></header>{page === "Materials" ? <img className="studio-material-preview" src={materialAsset.url} alt="Painted material preview" /> : <DrawingCanvas key={padClear} embedded transparent canvasWidth={1024} canvasHeight={768} brushActive selectionActive={false} selectionMode="Freehand" selectionColorFill={false} currentColor="#FFFFFF" invertSelection={false} clearSelectionTrigger={0} brushSize={typeof activeBrush.settings["brushSize"] === "number" ? activeBrush.settings["brushSize"] : 50} brushOpacity={typeof activeBrush.settings["brushOpacity"] === "number" ? activeBrush.settings["brushOpacity"] : 100} onThresholdUpdate={() => {}} onUndo={() => {}} onRedo={() => {}} onStrokeStart={() => {}} onStrokeEnd={() => {}} onStrokeCancel={() => {}} />}{padOpen && <div className="studio-pad-options"><h3>Drawing Pad</h3><StudioButton onClick={() => { setPadClear((k) => k + 1); setPadOpen(false); }}>Clear drawing pad</StudioButton><Control control={{ kind: "slider", id: "local9", label: "Preview size", value: 30 }} /></div>}</main>
    {editor && <SourceEditor type={editor} sourceIndex={sourceIndex(editor)} sourceImages={{ shape: draft.shape, grain: draft.grain }} onClose={() => setEditor(null)} onPick={source => { if (source.kind === "Shape" || source.kind === "Grain") setPicture(source.kind, source.image); if (editor !== "Shape" && editor !== "Grain") setSources(current => ({ ...current, [editor]: source.index })); }} onImport={url => { if (editor === "Shape" || editor === "Grain") setPicture(editor, url); }} />}
  </div>, document.body);
}
