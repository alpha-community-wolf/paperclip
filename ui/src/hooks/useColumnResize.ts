import { useCallback, useEffect, useRef, useState } from "react";

export interface ColumnConfig {
  key: string;
  defaultWidth: number;
  minWidth: number;
  resizable?: boolean;
  /** If true, this column uses 1fr (flex) sizing; defaultWidth is the minimum */
  flex?: boolean;
}

export interface UseColumnResizeResult {
  widths: Record<string, number>;
  gridTemplateColumns: string;
  onResizeStart: (colKey: string, startX: number) => void;
  resizingCol: string | null;
  resetColumn: (colKey: string) => void;
  resetAll: () => void;
}

const STORAGE_KEY = "paperclip:issuesList:columnWidths";

function loadWidths(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

function saveWidths(widths: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // ignore
  }
}

function buildDefaults(columns: ColumnConfig[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const col of columns) {
    result[col.key] = col.defaultWidth;
  }
  return result;
}

export function useColumnResize(columns: ColumnConfig[]): UseColumnResizeResult {
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const defaults = buildDefaults(columns);
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const stored = loadWidths();
    if (!stored) return defaults;
    // Merge stored with defaults (handles new/removed columns)
    const merged: Record<string, number> = { ...defaults };
    for (const col of columns) {
      if (stored[col.key] !== undefined) {
        merged[col.key] = Math.max(stored[col.key], col.minWidth);
      }
    }
    return merged;
  });

  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const dragState = useRef<{
    colKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const onResizeStart = useCallback((colKey: string, startX: number) => {
    const currentWidth = widths[colKey] ?? defaults[colKey] ?? 100;
    dragState.current = { colKey, startX, startWidth: currentWidth };
    setResizingCol(colKey);
  }, [widths, defaults]);

  useEffect(() => {
    if (!resizingCol) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const { colKey, startX, startWidth } = dragState.current;
      const col = columnsRef.current.find((c) => c.key === colKey);
      if (!col) return;
      const delta = e.clientX - startX;
      const newWidth = Math.max(col.minWidth, startWidth + delta);
      setWidths((prev) => ({ ...prev, [colKey]: newWidth }));
    };

    const onMouseUp = () => {
      dragState.current = null;
      setResizingCol(null);
      // Persist
      setWidths((current) => {
        saveWidths(current);
        return current;
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizingCol]);

  const gridTemplateColumns = columns
    .map((col) => {
      const w = widths[col.key] ?? col.defaultWidth;
      if (col.flex) return `minmax(${col.minWidth}px, 1fr)`;
      return `${w}px`;
    })
    .join(" ");

  const resetColumn = useCallback(
    (colKey: string) => {
      setWidths((prev) => {
        const col = columnsRef.current.find((c) => c.key === colKey);
        if (!col) return prev;
        const next = { ...prev, [colKey]: col.defaultWidth };
        saveWidths(next);
        return next;
      });
    },
    [],
  );

  const resetAll = useCallback(() => {
    const d = buildDefaults(columnsRef.current);
    setWidths(d);
    saveWidths(d);
  }, []);

  return { widths, gridTemplateColumns, onResizeStart, resizingCol, resetColumn, resetAll };
}
