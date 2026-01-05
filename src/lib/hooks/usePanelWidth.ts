import { useState, useCallback } from 'react';
import { clamp } from '../utils/formatters';

export interface UsePanelWidthOptions {
  /** Initial width */
  initialWidth?: number;
  /** Minimum width */
  minWidth?: number;
  /** Maximum width */
  maxWidth?: number;
}

export interface UsePanelWidthReturn {
  /** Current panel width */
  width: number;
  /** Set panel width (clamped to min/max) */
  setWidth: (width: number) => void;
  /** Increase width by step */
  increaseWidth: (step?: number) => void;
  /** Decrease width by step */
  decreaseWidth: (step?: number) => void;
  /** Reset to initial width */
  resetWidth: () => void;
}

/**
 * Hook for managing panel width state
 *
 * @example
 * ```tsx
 * const { width, setWidth, increaseWidth, decreaseWidth } = usePanelWidth({
 *   initialWidth: 320,
 *   minWidth: 240,
 *   maxWidth: 420
 * });
 *
 * return (
 *   <div style={{ width: `${width}px` }}>
 *     <button onClick={() => decreaseWidth(10)}>-</button>
 *     <span>{width}px</span>
 *     <button onClick={() => increaseWidth(10)}>+</button>
 *   </div>
 * );
 * ```
 */
export function usePanelWidth({
  initialWidth = 320,
  minWidth = 240,
  maxWidth = 420,
}: UsePanelWidthOptions = {}): UsePanelWidthReturn {
  const [width, setWidthState] = useState(initialWidth);

  const setWidth = useCallback(
    (newWidth: number) => {
      setWidthState(clamp(newWidth, minWidth, maxWidth));
    },
    [minWidth, maxWidth]
  );

  const increaseWidth = useCallback(
    (step = 10) => {
      setWidth(width + step);
    },
    [width, setWidth]
  );

  const decreaseWidth = useCallback(
    (step = 10) => {
      setWidth(width - step);
    },
    [width, setWidth]
  );

  const resetWidth = useCallback(() => {
    setWidthState(initialWidth);
  }, [initialWidth]);

  return {
    width,
    setWidth,
    increaseWidth,
    decreaseWidth,
    resetWidth,
  };
}
