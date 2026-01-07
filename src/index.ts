// Import styles
import './lib/styles/layer-control.css';

// Main entry point
export { LayerControl } from './lib/core/LayerControl';
export type {
  LayerControlOptions,
  LayerState,
  LayerStates,
  StyleableLayerType,
  PaintProperty,
  StyleControlConfig,
} from './lib/core/types';

// Re-export utilities for advanced use cases
export { normalizeColor, rgbToHex } from './lib/utils/colorUtils';
export { getLayerType, getLayerOpacity, setLayerOpacity, isStyleableLayerType } from './lib/utils/layerUtils';
export { formatNumericValue, clamp } from './lib/utils/formatters';
export {
  getLayerColor,
  getLayerColorFromSpec,
  createLayerSymbolSVG,
  createBackgroundGroupSymbolSVG,
  darkenColor,
} from './lib/utils/symbolUtils';
export type { SymbolOptions } from './lib/utils/symbolUtils';
