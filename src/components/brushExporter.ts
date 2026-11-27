import { unzipSync } from "fflate";
import type { Brush, BrushSet, Library, BrushSettings } from "./brushImport";
import { DEFAULT_BRUSH_SETTINGS } from "./brushStudioData";

/**
 * Create a brush export archive
 */
export async function createBrushArchive(brush: Brush, sets: BrushSet[]): Promise<Uint8Array> {
  // This would implement the actual brush archive format
  // For now, return a minimal implementation
  const manifest = {
    format: 'canvas-brush',
    version: 1,
    timestamp: Date.now(),
    brushes: sets.flatMap(set => set.brushes),
  };

  const manifestJson = JSON.stringify(manifest);
  const manifestBytes = new TextEncoder().encode(manifestJson);

  return manifestBytes;
}

/**
 * Parse a brush archive
 */
export function parseBrushArchive(bytes: Uint8Array): BrushSet[] {
  // This would implement parsing of the brush archive format
  // For now, return empty array
  return [];
}

/**
 * Export a single brush as a ZIP file
 */
export async function exportBrushAsZip(brush: Brush, sets: BrushSet[]): Promise<Uint8Array> {
  const archive = await createBrushArchive(brush, sets);
  return archive;
}

/**
 * Import brushes from a ZIP file
 */
export async function importBrushesFromZip(bytes: Uint8Array): Promise<BrushSet[]> {
  return parseBrushArchive(bytes);
}

/**
 * Validate brush settings
 */
export function validateBrushSettings(settings: BrushSettings): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required settings
  if (settings.spacing === undefined || typeof settings.spacing !== 'number') {
    errors.push('Spacing is required');
  }

  if (settings.brushSize === undefined || typeof settings.brushSize !== 'number') {
    errors.push('Brush size is required');
  }

  if (settings.brushOpacity === undefined || typeof settings.brushOpacity !== 'number') {
    errors.push('Brush opacity is required');
  }

  // Check range constraints
  const minSize = settings.minSize ?? 10;
  const maxSize = settings.maxSize ?? 100;
  if (minSize < 1 || maxSize > 220) {
    errors.push('Brush size range is invalid');
  }

  const minOpacity = settings.minOpacity ?? 0;
  const maxOpacity = settings.maxOpacity ?? 100;
  if (minOpacity < 0 || maxOpacity > 100) {
    errors.push('Brush opacity range is invalid');
  }

  // Check that settings are of correct types
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      errors.push(`${key} has invalid finite number`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalize brush settings to match default structure
 */
export function normalizeBrushSettings(settings: BrushSettings): BrushSettings {
  const normalized = { ...DEFAULT_BRUSH_SETTINGS };

  for (const [key, value] of Object.entries(settings)) {
    // Check if the key exists in default settings
    if (key in normalized) {
      normalized[key] = value;
    }
  }

  return normalized;
}

/**
 * Merge brush settings with defaults
 */
export function mergeBrushSettings(baseSettings: BrushSettings, overrideSettings: Partial<BrushSettings>): BrushSettings {
  return {
    ...baseSettings,
    ...overrideSettings,
  };
}

/**
 * Create a backup of brush settings
 */
export function backupBrushSettings(brush: Brush): BrushSettings {
  return {
    ...DEFAULT_BRUSH_SETTINGS,
    ...(brush.settings || {}),
  };
}

/**
 * Restore brush settings from backup
 */
export function restoreBrushSettings(backup: BrushSettings, brush: Brush): BrushSettings {
  return {
    ...backup,
    ...(brush.settings || {}),
  };
}

/**
 * Clone a brush
 */
export function cloneBrush(brush: Brush): Brush {
  return {
    ...brush,
    id: `${brush.id}-clone-${Date.now()}`,
    name: `${brush.name} Clone`,
  };
}

/**
 * Create a new brush with default settings
 */
export function createDefaultBrush(name: string, shape?: string, grain?: string): Brush {
  return {
    id: `new-${Date.now()}`,
    name,
    settings: { ...DEFAULT_BRUSH_SETTINGS },
    shape: shape || '/assets/shapes/shape-1.png.asset.json',
    grain: grain || '/assets/brush-sources/graphite-micrograin.svg?url',
  };
}

/**
 * Validate brush structure
 */
export function validateBrush(brush: Brush): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!brush.id) {
    errors.push('Brush ID is required');
  }

  if (!brush.name || typeof brush.name !== 'string') {
    errors.push('Brush name is required');
  }

  if (!brush.settings) {
    errors.push('Brush settings are required');
  } else {
    const validation = validateBrushSettings(brush.settings);
    errors.push(...validation.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get brush statistics
 */
export function getBrushStatistics(sets: BrushSet[]): {
  totalBrushes: number;
  totalSets: number;
  brushNames: string[];
  settingsCount: number;
} {
  const totalBrushes = sets.reduce((sum, set) => sum + set.brushes.length, 0);
  const brushNames = sets.flatMap(set => set.brushes.map(b => b.name));
  const settingsCount = Object.keys(sets.flatMap(set => set.brushes.flatMap(b => Object.keys(b.settings || {})))).length;

  return {
    totalBrushes,
    totalSets: sets.length,
    brushNames,
    settingsCount,
  };
}

/**
 * Search brushes by name
 */
export function searchBrushes(sets: BrushSet[], query: string): Brush[] {
  const lowerQuery = query.toLowerCase();
  return sets.flatMap(set =>
    set.brushes.filter(brush =>
      brush.name.toLowerCase().includes(lowerQuery) ||
      brush.id.toLowerCase().includes(lowerQuery)
    )
  );
}

/**
   * Filter brushes by category
   */
export function filterBrushesByCategory(
  sets: BrushSet[],
  category: string
): Brush[] {
  const categoryMap: Record<string, (brush: Brush) => boolean> = {
    basic: b => b.id.startsWith('basic-'),
    painting: b => b.id.startsWith('paint-'),
    sketching: b => b.id.startsWith('sketch-'),
    special: b => b.id.startsWith('special-'),
    calligraphy: b => b.id.startsWith('calligraphy-'),
    texture: b => b.id.startsWith('texture-'),
    all: () => true,
  };

  const filterFn = categoryMap[category] || categoryMap.all;
  return sets.flatMap(set => set.brushes.filter(filterFn));
}

/**
 * Sort brushes by name
 */
export function sortBrushes(brushes: Brush[], order: 'asc' | 'desc' = 'asc'): Brush[] {
  return [...brushes].sort((a, b) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    return order === 'asc'
      ? nameA.localeCompare(nameB)
      : nameB.localeCompare(nameA);
  });
}

/**
 * Group brushes into sets
 */
export function groupBrushesByCategory(brushes: Brush[]): Record<string, Brush[]> {
  const groups: Record<string, Brush[]> = {
    basic: [],
    painting: [],
    sketching: [],
    special: [],
    calligraphy: [],
    texture: [],
  };

  for (const brush of brushes) {
    if (brush.id.startsWith('basic-')) {
      groups.basic.push(brush);
    } else if (brush.id.startsWith('paint-')) {
      groups.painting.push(brush);
    } else if (brush.id.startsWith('sketch-')) {
      groups.sketching.push(brush);
    } else if (brush.id.startsWith('special-')) {
      groups.special.push(brush);
    } else if (brush.id.startsWith('calligraphy-')) {
      groups.calligraphy.push(brush);
    } else if (brush.id.startsWith('texture-')) {
      groups.texture.push(brush);
    }
  }

  return groups;
}
