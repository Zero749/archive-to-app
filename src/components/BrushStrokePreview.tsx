import { useEffect, useRef } from "react";
import { brushSources, type Brush } from "./brushImport";
import { renderBrushPreview } from "./strokeEngine";

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

    return () => {
      active = false;
    };
  }, [brush, color]);

  return <canvas ref={canvasRef} className={className} aria-label={`${brush.name} stroke preview`} />;
}
