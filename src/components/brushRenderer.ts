import { ProcreateBrushRenderer, type BrushInput, type BrushTool, type RenderOptions } from './brushEngine';
import type { Brush, BrushSettings, PixelMap } from './brushImport';

export class BrushRendererFactory {
  private renderers: Map<string, ProcreateBrushRenderer> = new Map();
  private previewRenderer: ProcreateBrushRenderer | null = null;
  private canvasRenderer: ProcreateBrushRenderer | null = null;

  /**
   * Get or create a renderer for the given brush
   */
  getRenderer(
    brush: Brush,
    canvas: HTMLCanvasElement,
    layer: HTMLCanvasElement,
    options: RenderOptions
  ): ProcreateBrushRenderer {
    const brushId = brush.id;

    if (this.renderers.has(brushId)) {
      return this.renderers.get(brushId)!;
    }

    const renderer = new ProcreateBrushRenderer(canvas, layer, options);
    this.renderers.set(brushId, renderer);

    return renderer;
  }

  /**
   * Get the preview renderer
   */
  getPreviewRenderer(
    canvas: HTMLCanvasElement,
    layer: HTMLCanvasElement,
    brush: Brush,
    options: RenderOptions
  ): ProcreateBrushRenderer {
    if (this.previewRenderer) {
      // Update the preview renderer with new settings
      this.previewRenderer['s'] = options.settings || {};
      return this.previewRenderer;
    }

    const renderer = new ProcreateBrushRenderer(canvas, layer, options);
    this.previewRenderer = renderer;

    return renderer;
  }

  /**
   * Get the canvas renderer (for actual drawing)
   */
  getCanvasRenderer(
    canvas: HTMLCanvasElement,
    layer: HTMLCanvasElement,
    brush: Brush,
    options: RenderOptions
  ): ProcreateBrushRenderer {
    if (this.canvasRenderer) {
      // Update the canvas renderer with new settings
      this.canvasRenderer['s'] = options.settings || {};
      return this.canvasRenderer;
    }

    const renderer = new ProcreateBrushRenderer(canvas, layer, options);
    this.canvasRenderer = renderer;

    return renderer;
  }

  /**
   * Clear all renderers
   */
  clearRenderers(): void {
    this.renderers.clear();
    this.previewRenderer = null;
    this.canvasRenderer = null;
  }

  /**
   * Clear a specific renderer
   */
  clearRenderer(brushId: string): void {
    this.renderers.delete(brushId);
  }

  /**
   * Update brush settings in all renderers
   */
  updateBrushSettings(brushId: string, settings: BrushSettings): void {
    for (const [id, renderer] of this.renderers) {
      if (id === brushId) {
        renderer['s'] = settings;
      }
    }
  }

  /**
   * Update brush sources in all renderers
   */
  updateBrushSources(brushId: string, sources: { shape: PixelMap | null; grain: PixelMap | null }): void {
    for (const [id, renderer] of this.renderers) {
      if (id === brushId) {
        // This would require updating internal state, but the renderer
        // rebuilds sources on every render, so this might not be needed
      }
    }
  }

  /**
   * Get renderer count
   */
  getRendererCount(): number {
    return this.renderers.size;
  }
}

// Singleton instance
let factoryInstance: BrushRendererFactory | null = null;

export function getBrushRendererFactory(): BrushRendererFactory {
  if (!factoryInstance) {
    factoryInstance = new BrushRendererFactory();
  }
  return factoryInstance;
}

/**
 * Create brush sources from a brush
 */
export async function createBrushSources(brush: Brush): Promise<{ shape: PixelMap | null; grain: PixelMap | null }> {
  const { loadImg } = await import('./brushImport');
  const [shape, grain] = await Promise.all([loadImg(brush.shape), loadImg(brush.grain)]);

  const { toPixelMap } = await import('./brushImport');
  return {
    shape: shape ? toPixelMap(shape, 1024, true) : null,
    grain: grain ? toPixelMap(grain, 1024, false) : null,
  };
}

/**
 * Build a brush mask for rendering
 */
export function buildBrushMask(
  resolution: number,
  brush: Brush,
  sources?: { shape: PixelMap | null; grain: PixelMap | null }
): HTMLCanvasElement {
  const { buildMask } = await import('./brushImport');
  return buildMask(
    resolution,
    brush.settings || {},
    0,
    { x: 0, y: 0 },
    false,
    sources
  );
}

/**
 * Build a brush grain canvas
 */
export function buildBrushGrain(
  brush: Brush,
  depth: number,
  grainSource?: PixelMap | null
): HTMLCanvasElement | null {
  const { buildGrainCanvas } = await import('./brushImport');
  return buildGrainCanvas(brush.settings || {}, depth, grainSource);
}

/**
 * Calculate brush size based on settings
 */
export function calculateBrushSize(
  brush: Brush,
  sizePercentage: number = 50,
  pixelRatio: number = 1
): number {
  const min = brush.settings?.minSize ?? 10;
  const max = brush.settings?.maxSize ?? 100;
  return Math.max(0.5, 80 * pixelRatio * (min + (max - min) * sizePercentage / 100) / 100);
}

/**
 * Calculate brush opacity based on settings
 */
export function calculateBrushOpacity(
  brush: Brush,
  opacityPercentage: number = 100
): number {
  const min = brush.settings?.minOpacity ?? 0;
  const max = brush.settings?.maxOpacity ?? 100;
  return (min + (max - min) * opacityPercentage / 100) / 100;
}

/**
 * Get brush blend mode
 */
export function getBrushBlendMode(brush: Brush, tool: BrushTool = 'paint'): string {
  const blendMode = brush.settings?.blendMode ?? 'Normal';
  const luminanceBlending = brush.settings?.luminanceBlending ?? false;

  if (tool === 'erase') {
    return 'normal';
  }

  if (luminanceBlending) {
    return 'luminosity';
  }

  return blendMode.toLowerCase().replaceAll(' ', '-');
}

/**
 * Get brush rendering mode
 */
export function getBrushRenderingMode(brush: Brush): string {
  const mode = brush.settings?.renderingMode ?? 'Light Glaze';
  const recursiveMixing = brush.settings?.renderingRecursiveMixing ?? false;
  const maxTransfer = brush.settings?.renderingMaxTransfer ?? false;
  const modulatedTransfer = brush.settings?.renderingModulatedTransfer ?? false;

  if (recursiveMixing) {
    if (maxTransfer && modulatedTransfer) return 'Uniform Blending';
    if (maxTransfer) return 'Intense Blending';
    if (modulatedTransfer) return 'Heavy Glaze';
    return 'Uniformed Glaze';
  }

  return mode;
}

/**
 * Get brush grain mode
 */
export function getBrushGrainMode(brush: Brush): 'Moving' | 'Texturized' {
  const mode = brush.settings?.grainMode ?? 'Moving';
  return mode === 'Texturized' ? 'Texturized' : 'Moving';
}
