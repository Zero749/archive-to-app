import type { Brush, BrushSet, Library, BrushSettings } from './brushImport';
import { DEFAULT_BRUSH_SETTINGS, type StudioSection } from './brushStudioData';
import { getDefaultBrushes } from './defaultBrushes';

export type BrushLibraryState = {
  library: Library;
  currentSet: BrushSet | null;
  currentBrush: Brush | null;
  previewBrush: Brush | null;
  activeSettings: BrushSettings;
  activeShape: HTMLCanvasElement | null;
  activeGrain: HTMLCanvasElement | null;
  isDirty: boolean;
  draftBrush: Brush | null;
};

export class BrushLibraryManager {
  private state: BrushLibraryState;

  constructor() {
    this.state = {
      library: {
        id: 'default-library',
        name: 'Default Library',
        sets: [
          {
            id: 'default-set',
            name: 'Basic Brushes',
            brushes: getDefaultBrushes(),
          },
          {
            id: 'painting-set',
            name: 'Painting Brushes',
            brushes: getDefaultBrushes().filter(b => b.id.startsWith('paint-')),
          },
          {
            id: 'sketching-set',
            name: 'Sketching Brushes',
            brushes: getDefaultBrushes().filter(b => b.id.startsWith('sketch-')),
          },
          {
            id: 'special-set',
            name: 'Special Brushes',
            brushes: getDefaultBrushes().filter(b => b.id.startsWith('special-')),
          },
          {
            id: 'calligraphy-set',
            name: 'Calligraphy Brushes',
            brushes: getDefaultBrushes().filter(b => b.id.startsWith('calligraphy-')),
          },
          {
            id: 'texture-set',
            name: 'Texture Brushes',
            brushes: getDefaultBrushes().filter(b => b.id.startsWith('texture-')),
          },
        ],
      },
      currentSet: null,
      currentBrush: null,
      previewBrush: null,
      activeSettings: { ...DEFAULT_BRUSH_SETTINGS },
      activeShape: null,
      activeGrain: null,
      isDirty: false,
      draftBrush: null,
    };
  }

  getLibrary(): Library {
    return this.state.library;
  }

  getCurrentSet(): BrushSet | null {
    return this.state.currentSet;
  }

  getCurrentBrush(): Brush | null {
    return this.state.currentBrush;
  }

  getPreviewBrush(): Brush | null {
    return this.state.previewBrush;
  }

  getActiveSettings(): BrushSettings {
    return { ...this.state.activeSettings };
  }

  getActiveShape(): HTMLCanvasElement | null {
    return this.state.activeShape;
  }

  getActiveGrain(): HTMLCanvasElement | null {
    return this.state.activeGrain;
  }

  getIsDirty(): boolean {
    return this.state.isDirty;
  }

  getDraftBrush(): Brush | null {
    return this.state.draftBrush;
  }

  getStudioSections(): StudioSection[] {
    return Object.entries(require('./brushStudioData').STUDIO_PAGES).map(([title, sections]) => ({
      title,
      controls: sections.flatMap(s => s.controls)
    }));
  }

  setCurrentSet(setId: string): boolean {
    const set = this.state.library.sets.find(s => s.id === setId);
    if (!set) return false;

    this.state.currentSet = set;
    this.state.currentBrush = null;
    this.state.previewBrush = null;
    this.state.activeSettings = { ...DEFAULT_BRUSH_SETTINGS };
    this.state.activeShape = null;
    this.state.activeGrain = null;
    this.state.isDirty = false;
    this.state.draftBrush = null;

    return true;
  }

  setCurrentBrush(brushId: string): boolean {
    const set = this.state.currentSet;
    if (!set) return false;

    const brush = set.brushes.find(b => b.id === brushId);
    if (!brush) return false;

    this.state.currentBrush = brush;
    this.state.previewBrush = null;
    this.state.activeSettings = { ...DEFAULT_BRUSH_SETTINGS, ...(brush.settings || {}) };
    this.state.activeShape = null;
    this.state.activeGrain = null;
    this.state.isDirty = false;
    this.state.draftBrush = null;

    return true;
  }

  setPreviewBrush(brush: Brush | null): void {
    this.state.previewBrush = brush;
    this.state.activeSettings = brush ? { ...DEFAULT_BRUSH_SETTINGS, ...(brush.settings || {}) } : { ...DEFAULT_BRUSH_SETTINGS };
  }

  setActiveSettings(settings: BrushSettings): void {
    this.state.activeSettings = { ...DEFAULT_BRUSH_SETTINGS, ...settings };
    this.state.isDirty = true;
  }

  setActiveShape(shape: HTMLCanvasElement | null): void {
    this.state.activeShape = shape;
  }

  setActiveGrain(grain: HTMLCanvasElement | null): void {
    this.state.activeGrain = grain;
  }

  setIsDirty(dirty: boolean): void {
    this.state.isDirty = dirty;
  }

  setDraftBrush(brush: Brush | null): void {
    this.state.draftBrush = brush;
  }

  resetToBrush(brush: Brush): void {
    this.state.activeSettings = { ...DEFAULT_BRUSH_SETTINGS, ...(brush.settings || {}) };
    this.state.isDirty = false;
  }

  commitDraft(): Brush | null {
    if (!this.state.draftBrush) return null;

    const brush = {
      ...this.state.draftBrush,
      id: `custom-${Date.now()}`,
      settings: { ...this.state.activeSettings },
    };

    this.state.draftBrush = null;
    this.state.isDirty = false;

    return brush;
  }

  cancelDraft(): void {
    this.state.draftBrush = null;
    this.state.isDirty = false;
  }

  addBrushToSet(brush: Brush): boolean {
    if (!this.state.currentSet) return false;

    const newBrush = {
      ...brush,
      id: `custom-${Date.now()}`,
    };

    this.state.currentSet.brushes.push(newBrush);
    this.state.currentBrush = newBrush;
    this.state.isDirty = true;

    return true;
  }

  updateBrushInSet(brush: Brush): boolean {
    if (!this.state.currentSet || !this.state.currentBrush) return false;

    const index = this.state.currentSet.brushes.findIndex(b => b.id === brush.id);
    if (index === -1) return false;

    this.state.currentSet.brushes[index] = brush;
    this.state.currentBrush = brush;
    this.state.isDirty = true;

    return true;
  }

  deleteBrushFromSet(brushId: string): boolean {
    if (!this.state.currentSet) return false;

    const index = this.state.currentSet.brushes.findIndex(b => b.id === brushId);
    if (index === -1) return false;

    this.state.currentSet.brushes.splice(index, 1);

    if (this.state.currentBrush?.id === brushId) {
      this.state.currentBrush = this.state.currentSet.brushes[index - 1] || null;
      this.state.previewBrush = null;
      this.state.activeSettings = { ...DEFAULT_BRUSH_SETTINGS };
      this.state.activeShape = null;
      this.state.activeGrain = null;
    }

    this.state.isDirty = true;

    return true;
  }

  createNewBrush(): Brush {
    const newBrush: Brush = {
      id: `new-${Date.now()}`,
      name: 'New Brush',
      settings: { ...DEFAULT_BRUSH_SETTINGS },
    };

    this.state.draftBrush = newBrush;
    this.state.activeSettings = { ...DEFAULT_BRUSH_SETTINGS };
    this.state.isDirty = true;

    return newBrush;
  }

  duplicateBrush(brush: Brush): Brush {
    const duplicate = {
      ...brush,
      id: `${brush.id}-copy-${Date.now()}`,
      name: `${brush.name} Copy`,
    };

    return duplicate;
  }

  renameBrush(brush: Brush, newName: string): boolean {
    if (!this.state.currentSet || !this.state.currentBrush) return false;

    const index = this.state.currentSet.brushes.findIndex(b => b.id === brush.id);
    if (index === -1) return false;

    this.state.currentSet.brushes[index].name = newName;
    this.state.currentBrush.name = newName;
    this.state.isDirty = true;

    return true;
  }
}

// Singleton instance
let managerInstance: BrushLibraryManager | null = null;

export function getBrushLibraryManager(): BrushLibraryManager {
  if (!managerInstance) {
    managerInstance = new BrushLibraryManager();
  }
  return managerInstance;
}
