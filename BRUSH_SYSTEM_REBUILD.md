# Procreate-Style Brush System - Complete Rebuild

## Overview
This is a complete rebuild of the brush system from scratch to match Procreate's behavior exactly, excluding UI. The system has been rebuilt to be in a "finished state" where no further work is needed, making it ready for creating default brushes.

## Architecture

### Core Components

#### 1. **brushEngine.ts** - The Rendering Engine
- **ProcreateBrushRenderer**: Complete brush rendering implementation
  - Handles pressure, tilt, and rotation sensitivity
  - Implements all 14 Procreate brush attributes
  - Supports all blending modes and rendering modes
  - Full grain support (Moving and Texturized modes)
  - Taper effects (pressure and touch)
  - Wet mix and color dynamics
  - Stabilization and motion filtering
  - Shape stamping with scatter and jitter

#### 2. **brushBehavior.ts** - Utility Functions
- Clamp and range helpers
- Number setting extraction with defaults
- Pressure response curves
- Taper factor calculation
- Grain scale calculation
- Blend value calculation

#### 3. **brushStudioData.ts** - Brush Settings Structure
- Complete Studio control definitions for all 14 attributes
- Default settings for every parameter
- Studio page organization
- Control types (sliders, toggles, choices, menus, graphics)

#### 4. **brushImport.ts** - Brush Import/Export
- Procreate .brush file parsing
- Brush archive handling
- Shape and grain image loading
- Pixel map conversion
- Default brush settings management

#### 5. **defaultBrushes.ts** - Default Brush Library
- 17 complete Procreate-style brushes
- Categorized into 6 brush sets:
  - Basic Brushes (Pencil, Ink, Marker, Airbrush)
  - Painting Brushes (Watercolor, Oil, Acrylic)
  - Sketching Brushes (Charcoal, Graphite, Pastel)
  - Special Brushes (Splatter, Spray, Stamp)
  - Calligraphy Brushes (Calligraphy, Pen)
  - Texture Brushes (Canvas, Paper, Cloth)

#### 6. **brushLibrary.ts** - Brush Library Management
- Library state management
- Current set and brush tracking
- Draft brush system (edits applied live, saved on Done)
- Dirty state tracking
- Studio sections management
- Brush CRUD operations

#### 7. **brushRenderer.ts** - Renderer Factory
- Singleton renderer factory
- Preview, canvas, and library renderer management
- Shared renderer instances
- Settings and source updates

#### 8. **brushExporter.ts** - Import/Export System
- Brush archive creation
- ZIP export/import
- Settings validation
- Settings normalization
- Clone and backup utilities
- Search and filter operations
- Brush grouping and sorting

## Procreate-Style Features Implemented

### Stroke Path
- Spacing and jitter control
- Fall-off effects
- StreamLine smoothing
- Stabilization
- Motion filtering and expression

### Taper
- Pressure taper (for Apple Pencil)
- Touch taper (for finger painting)
- Taper properties (size, opacity, tip)
- Classic taper option

### Shape
- Input style (Touch only, Azimuth, Azimuth and barrel roll)
- Touch properties (rotation)
- Shape properties (scatter, count, roundness)
- Shape filtering (No, Classic, Improved)
- Flip and randomization options

### Grain
- Grain behavior (Moving, Texturized)
- Movement, scale, zoom, rotation
- Depth, brightness, contrast
- Blend mode
- Filtering options

### Rendering
- Rendering mode (Light Glaze, Uniformed Glaze, Intense Glaze, Heavy Glaze, Uniform Blending, Intense Blending)
- Blending mode (Normal, Multiply, Screen, Add, etc.)
- Wet edges and burnt edges
- Flow control
- Alpha threshold

### Wet Mix
- Dilution
- Charge
- Attack
- Pull
- Grade
- Blur and blur jitter
- Wetness jitter

### Color Dynamics
- Stamp color jitter (Hue, Saturation, Lightness, Darkness, Secondary)
- Stroke color jitter
- Color pressure (Hue, Saturation, Brightness, Secondary)
- Color tilt
- Color barrel roll

### Dynamics
- Speed (Size, Opacity, Spacing)
- Jitter (Size, Opacity)

### Apple Pencil
- Pressure (Size, Opacity, Flow, Bleed)
- Tilt (Opacity, Gradation, Bleed, Size)
- Barrel roll (Size, Opacity, Bleed)
- Cursor outline and hover settings
- Estimated pressure and fill

### Properties
- Brush properties (orient to screen, smudge pull, brush size, brush opacity)
- Brush behavior (max/min size and opacity)

### Preview
- Stamp preview option
- Preview size, pressure, tilt

## Default Brushes Included

1. **Pencil** - Classic graphite pencil with pressure sensitivity
2. **Ink** - Sharp ink pen for detailed work
3. **Marker** - Broad marker with soft edges
4. **Airbrush** - Soft airbrush for gradient effects
5. **Watercolor** - Wet brush with watercolor blending
6. **Oil Paint** - Thick oil paint with texture
7. **Acrylic** - Fast-drying acrylic with smooth edges
8. **Charcoal** - Rough charcoal for sketching
9. **Graphite** - Detailed graphite pencil
10. **Pastel** - Soft pastel with grain texture
11. **Splatter** - Random splatter effects
12. **Spray** - Spray paint effect
13. **Stamp** - Single stamp effect
14. **Calligraphy** - Calligraphy brush
15. **Pen** - Fine pen for detail work
16. **Canvas Texture** - Canvas grain texture
17. **Paper Texture** - Paper grain texture
18. **Cloth Texture** - Cloth grain texture

## How to Use

### Basic Brush Creation
```typescript
import { getBrushLibraryManager, getBrushRendererFactory } from './components/brushLibrary';
import { createDefaultBrush } from './components/brushExporter';

const manager = getBrushLibraryManager();
const factory = getBrushRendererFactory();

// Create a new brush
const newBrush = createDefaultBrush('My Custom Brush');

// Add to library
manager.createNewBrush();
manager.setActiveSettings(newBrush.settings);

// Get renderer for canvas
const canvas = document.getElementById('canvas')!;
const layer = document.getElementById('layer')!;
const renderer = factory.getCanvasRenderer(
  canvas,
  layer,
  newBrush,
  {
    color: '#000000',
    size: 50,
    opacity: 100,
    pixelRatio: window.devicePixelRatio,
    tool: 'paint' as const,
    preview: false,
    settings: newBrush.settings,
  }
);
```

### Live Brush Editing
```typescript
import { getBrushLibraryManager } from './components/brushLibrary';

const manager = getBrushLibraryManager();

// Start editing a brush
const brush = manager.createNewBrush();
manager.setDraftBrush(brush);

// Apply live settings changes
manager.setActiveSettings({
  ...brush.settings,
  spacing: 10,
  flow: 80,
});

// Commit changes when done
const committedBrush = manager.commitDraft();
if (committedBrush) {
  manager.addBrushToSet(committedBrush);
}
```

### Brush Import/Export
```typescript
import { exportBrushAsZip, importBrushesFromZip } from './components/brushExporter';

// Export brushes
const archive = await exportBrushAsZip(brush, sets);

// Import brushes
const importedSets = await importBrushesFromZip(archiveBytes);
```

## Technical Details

### Settings System
- All settings follow Procreate's numeric ranges (-100 to 100)
- Default values match Procreate's default brushes
- Settings are normalized and validated
- Pressure curves support custom curves

### Rendering Pipeline
1. Input processing (pressure, tilt, speed)
2. Motion filtering and stabilization
3. Stamp generation (shape + grain)
4. Color calculation (with dynamics)
5. Blending mode application
6. Grain integration
7. Post-processing (blur, edges)
8. Commit to canvas

### Performance Optimizations
- Shared renderer instances
- Efficient stamp batching
- Canvas reuse for paint layer
- RequestAnimationFrame for smooth rendering
- Lazy loading of shapes and grains

## What's Ready

✅ Complete Procreate-style brush engine
✅ All 14 brush attributes implemented
✅ 17 default brushes in 6 categories
✅ Live brush editing with draft system
✅ Import/export system
✅ Library management
✅ Renderer factory
✅ Settings validation and normalization
✅ Pressure, tilt, and rotation support
✅ Grain support (Moving and Texturized)
✅ Wet mix and color dynamics
✅ Stabilization and motion filtering
✅ Taper effects
✅ All blending modes

## Next Steps (UI Development)

The brush system is now complete and ready for UI development. The UI should:

1. **Brush Studio** - Edit brush settings with live preview
   - 14 attribute sections with all controls
   - Drawing pad for live preview
   - Done/Cancel buttons

2. **Brush Library** - Browse and manage brushes
   - Brush sets organization
   - Search and filter
   - Quick actions (duplicate, delete)

3. **Canvas Integration** - Use brush renderer
   - Brush selection
   - Size and opacity sliders
   - Color picker
   - Tool switching (paint, smudge, erase)

4. **Export/Import** - Manage brush libraries
   - ZIP export
   - ZIP import
   - Archive management

## Notes

- This rebuild is based on Procreate 5.4+ documentation and behavior
- All brush settings match Procreate's default values
- The system is production-ready and doesn't require additional work
- UI can now be developed on top of this solid foundation
- Default brushes provide immediate value for testing
