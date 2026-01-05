/**
 * React integration for maplibre-gl-layer-control
 *
 * @example
 * ```tsx
 * import { LayerControlReact, useLayerState } from 'maplibre-gl-layer-control/react';
 * import 'maplibre-gl-layer-control/style.css';
 * ```
 */

// React component
export { LayerControlReact } from './lib/core/LayerControlReact';
export type { LayerControlReactProps } from './lib/core/LayerControlReact';

// React hooks
export {
  useLayerState,
  useStyleEditor,
  usePanelWidth,
  useMapLayerSync,
} from './lib/hooks';

export type {
  UseLayerStateOptions,
  UseLayerStateReturn,
  UseStyleEditorOptions,
  UseStyleEditorReturn,
  UsePanelWidthOptions,
  UsePanelWidthReturn,
  UseMapLayerSyncOptions,
} from './lib/hooks';

// Re-export types from main library
export type {
  LayerControlOptions,
  LayerState,
  InternalControlState,
  OriginalStyle,
} from './lib/core/types';
