import { useEffect, useRef } from "react";
import { brushSources, type Brush } from "./brushImport";
import { ProcreateBrushRenderer, type RenderOptions } from "./brushEngine";

type Props = {
  brush: Brush;
  color?: string;
  className?: string;
};

export function BrushStrokePreview({
  brush,
  color = "#25211D",
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round((canvas.clientWidth || 240) * dpr));
    canvas.height = Math.max(1, Math.round((canvas.clientHeight || 36) * dpr));

    void brushSources(brush)
      .then((sources) => {
        if (active) renderBrushPreview(canvas, brush.settings, sources, color);
      })
      .catch((error: unknown) => {
        if (active) console.error("Could not render brush preview", error);
      });

    function renderBrushPreview(
      canvas: HTMLCanvasElement,
      settings: Brush,
      sources: { shape: any; grain: any },
      color: string
    ) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const size = 80 * dpr;

      const renderer = new ProcreateBrushRenderer(
        canvas,
        canvas,
        {
          color,
          size: 50,
          opacity: 100,
          pixelRatio: dpr,
          tool: 'paint',
          preview: true,
          settings,
          sources,
        }
      );

      const input: any = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        pressure: 0.5,
        tilt: 0,
        azimuth: 0,
        twist: 0,
        pen: true,
        time: 0,
      };

      renderer.start(input);
      renderer.end();
    }

    return () => {
      active = false;
    };
  }, [brush, color]);

  return <canvas ref={canvasRef} className={className} aria-label={`${brush.name} stroke preview`} />;
}
