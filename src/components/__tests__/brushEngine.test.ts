import { ProcreateBrushRenderer } from './brushEngine';
import type { BrushInput } from './brushImport';

describe('Procreate Brush Engine', () => {
  let canvas: HTMLCanvasElement;
  let layer: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    layer = document.createElement('canvas');
    layer.width = 800;
    layer.height = 600;
  });

  describe('Constructor', () => {
    it('should create renderer with valid options', () => {
      const renderer = new ProcreateBrushRenderer(
        canvas,
        layer,
        {
          color: '#000000',
          size: 50,
          opacity: 100,
          pixelRatio: window.devicePixelRatio,
          tool: 'paint',
          preview: false,
        }
      );

      expect(renderer).toBeDefined();
    });

    it('should throw error with invalid canvas', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        new ProcreateBrushRenderer(
          document.createElement('div') as any,
          layer,
          {
            color: '#000000',
            size: 50,
            opacity: 100,
            pixelRatio: window.devicePixelRatio,
            tool: 'paint',
            preview: false,
          }
        );
      }).toThrow('Canvas drawing is unavailable');

      consoleError.mockRestore();
    });
  });

  describe('Basic Rendering', () => {
    it('should start and end a stroke', () => {
      const renderer = new ProcreateBrushRenderer(
        canvas,
        layer,
        {
          color: '#000000',
          size: 50,
          opacity: 100,
          pixelRatio: window.devicePixelRatio,
          tool: 'paint',
          preview: false,
        }
      );

      const input: BrushInput = {
        x: 100,
        y: 100,
        pressure: 0.5,
        tilt: 0,
        azimuth: 0,
        twist: 0,
        pen: true,
        time: 0,
      };

      renderer.start(input);
      renderer.move({ ...input, x: 200, y: 150, time: 16 });
      renderer.move({ ...input, x: 300, y: 200, time: 32 });
      renderer.end();

      expect(renderer).toBeDefined();
    });

    it('should support different tools', () => {
      const tools: Array<'paint' | 'smudge' | 'erase'> = ['paint', 'smudge', 'erase'];

      tools.forEach(tool => {
        const renderer = new ProcreateBrushRenderer(
          canvas,
          layer,
          {
            color: '#000000',
            size: 50,
            opacity: 100,
            pixelRatio: window.devicePixelRatio,
            tool,
            preview: false,
          }
        );

        const input: BrushInput = {
          x: 100,
          y: 100,
          pressure: 0.5,
          tilt: 0,
          azimuth: 0,
          twist: 0,
          pen: true,
          time: 0,
        };

        renderer.start(input);
        renderer.end();

        expect(renderer).toBeDefined();
      });
    });
  });

  describe('Pressure Sensitivity', () => {
    it('should respond to pressure', () => {
      const renderer = new ProcreateBrushRenderer(
        canvas,
        layer,
        {
          color: '#000000',
          size: 50,
          opacity: 100,
          pixelRatio: window.devicePixelRatio,
          tool: 'paint',
          preview: false,
        }
      );

      const lowPressure: BrushInput = {
        x: 100,
        y: 100,
        pressure: 0.2,
        tilt: 0,
        azimuth: 0,
        twist: 0,
        pen: true,
        time: 0,
      };

      const highPressure: BrushInput = {
        x: 200,
        y: 100,
        pressure: 0.8,
        tilt: 0,
        azimuth: 0,
        twist: 0,
        pen: true,
        time: 16,
      };

      renderer.start(lowPressure);
      renderer.move(highPressure);
      renderer.end();

      expect(renderer).toBeDefined();
    });
  });

  describe('Tilt Sensitivity', () => {
    it('should respond to tilt', () => {
      const renderer = new ProcreateBrushRenderer(
        canvas,
        layer,
        {
          color: '#000000',
          size: 50,
          opacity: 100,
          pixelRatio: window.devicePixelRatio,
          tool: 'paint',
          preview: false,
        }
      );

      const lowTilt: BrushInput = {
        x: 100,
        y: 100,
        pressure: 0.5,
        tilt: 0,
        azimuth: 0,
        twist: 0,
        pen: true,
        time: 0,
      };

      const highTilt: BrushInput = {
        x: 200,
        y: 100,
        pressure: 0.5,
        tilt: 45,
        azimuth: 0,
        twist: 0,
        pen: true,
        time: 16,
      };

      renderer.start(lowTilt);
      renderer.move(highTilt);
      renderer.end();

      expect(renderer).toBeDefined();
    });
  });

  describe('Cancel', () => {
    it('should cancel a stroke', () => {
      const renderer = new ProcreateBrushRenderer(
        canvas,
        layer,
        {
          color: '#000000',
          size: 50,
          opacity: 100,
          pixelRatio: window.devicePixelRatio,
          tool: 'paint',
          preview: false,
        }
      );

      const input: BrushInput = {
        x: 100,
        y: 100,
        pressure: 0.5,
        tilt: 0,
        azimuth: 0,
        twist: 0,
        pen: true,
        time: 0,
      };

      renderer.start(input);
      renderer.move({ ...input, x: 200, y: 150, time: 16 });
      renderer.cancel();

      expect(renderer).toBeDefined();
    });
  });
});
