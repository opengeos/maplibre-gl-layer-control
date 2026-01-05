// MapLibre types are used implicitly via 'maplibre-gl' package

/**
 * State for a single layer
 */
export interface LayerState {
  /** Whether the layer is visible */
  visible: boolean;
  /** Layer opacity (0-1) */
  opacity: number;
  /** Display name for the layer */
  name: string;
}

/**
 * Collection of layer states keyed by layer ID
 */
export interface LayerStates {
  [layerId: string]: LayerState;
}

/**
 * Original style cache for a layer (used for reset functionality)
 */
export interface OriginalStyle {
  /** Original paint properties */
  paint: Record<string, any>;
}

/**
 * Options for LayerControl constructor
 */
export interface LayerControlOptions {
  /** Whether the control starts collapsed (default: true) */
  collapsed?: boolean;
  /** Initial layer states (keyed by layer ID) */
  layerStates?: LayerStates;
  /** Array of layer IDs to control (if not specified, controls all layers) */
  layers?: string[];
  /** Initial panel width in pixels (default: 320) */
  panelWidth?: number;
  /** Minimum panel width in pixels (default: 240) */
  panelMinWidth?: number;
  /** Maximum panel width in pixels (default: 420) */
  panelMaxWidth?: number;
}

/**
 * MapLibre layer types that support styling
 */
export type StyleableLayerType = 'fill' | 'line' | 'circle' | 'symbol' | 'raster';

/**
 * Paint properties for different layer types
 */
export interface PaintProperty {
  /** Property name (e.g., 'fill-color') */
  name: string;
  /** Current value */
  value: any;
}

/**
 * Control for a paint property (color picker or slider)
 */
export interface StyleControlConfig {
  /** Label to display */
  label: string;
  /** Paint property name */
  property: string;
  /** Control type */
  type: 'color' | 'slider';
  /** For sliders: minimum value */
  min?: number;
  /** For sliders: maximum value */
  max?: number;
  /** For sliders: step increment */
  step?: number;
  /** Default value if property is not set */
  defaultValue?: any;
}

/**
 * Internal control state (not exported)
 */
export interface InternalControlState {
  collapsed: boolean;
  panelWidth: number;
  activeStyleEditor: string | null;
  layerStates: LayerStates;
  originalStyles: Map<string, OriginalStyle>;
  userInteractingWithSlider: boolean;
  /** Whether the background legend panel is open */
  backgroundLegendOpen: boolean;
  /** Individual background layer visibility states */
  backgroundLayerVisibility: Map<string, boolean>;
  /** Whether to show only rendered layers in background legend */
  onlyRenderedFilter: boolean;
}
