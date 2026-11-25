import { useCallback, useRef, type RefObject } from "react";

// Snapshot-based undo/redo for a <canvas>. begin() before a stroke, then commit() or cancel().
export function useCanvasHistory(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const pending = useRef<ImageData | null>(null);

  const snapshot = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    return c && ctx ? { ctx, data: ctx.getImageData(0, 0, c.width, c.height) } : null;
  };

  const begin = useCallback(() => {
    pending.current = snapshot()?.data ?? null;
  }, []);

  const commit = useCallback(() => {
    if (!pending.current) return;
    undoStack.current.push(pending.current);
    redoStack.current = [];
    pending.current = null;
  }, []);

  const cancel = useCallback(() => {
    const s = snapshot();
    if (pending.current && s) s.ctx.putImageData(pending.current, 0, 0);
    pending.current = null;
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    const s = snapshot();
    if (!prev || !s) return;
    redoStack.current.push(s.data);
    s.ctx.putImageData(prev, 0, 0);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    const s = snapshot();
    if (!next || !s) return;
    undoStack.current.push(s.data);
    s.ctx.putImageData(next, 0, 0);
  }, []);

  return { begin, commit, cancel, undo, redo };
}
