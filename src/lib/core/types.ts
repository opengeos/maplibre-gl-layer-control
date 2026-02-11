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
  /** Whether this is a custom (non-MapLibre) layer */
  isCustomLayer?: boolean;
  /** Custom layer type identifier (e.g., 'cog', 'zarr') */
  customLayerType?: string;
}

/**
 * Collection of layer states keyed by layer ID
 */
export interface LayerStates {
  [layerId: string]: LayerState;
}

/**
 * Adapter interface for custom (non-MapLibre) layers.
 * Implement this interface to integrate custom layer types (e.g., deck.gl layers)
 * with the layer control.
 */
export interface CustomLayerAdapter {
  /** Unique type identifier for this adapter (e.g., 'cog', 'zarr', 'deck') */
  type: string;

  /** Get all layer IDs managed by this adapter */
  getLayerIds(): string[];

  /** Get the current state of a layer */
  getLayerState(layerId: string): LayerState | null;

  /** Set layer visibility */
  setVisibility(layerId: string, visible: boolean): void;

  /** Set layer opacity (0-1) */
  setOpacity(layerId: string, opacity: number): void;

  /** Get display name for a layer */
  getName(layerId: string): string;

  /** Get layer symbol type for UI display (optional) */
  getSymbolType?(layerId: string): string;

  /**
   * Subscribe to layer changes (add/remove).
   * Returns an unsubscribe function.
   */
  onLayerChange?(callback: (event: 'add' | 'remove', layerId: string) => void): () => void;

  /**
   * Get the bounds of a layer (optional).
   * Returns [west, south, east, north] or null if not available.
   */
  getBounds?(layerId: string): [number, number, number, number] | null;

  /**
   * Remove a layer (optional).
   * Called when user removes a layer via context menu.
   */
  removeLayer?(layerId: string): void;

  /**
   * Get native MapLibre layer IDs for a custom layer (optional).
   * When provided, the style editor will show paint property controls
   * for these native layers instead of the generic "custom layer" message.
   */
  getNativeLayerIds?(layerId: string): string[];
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
  /** Whether to show the style editor button (gear icon) for layers (default: true) */
  showStyleEditor?: boolean;
  /** Whether to show the opacity slider for layers (default: true) */
  showOpacitySlider?: boolean;
  /** Whether to show layer type symbols/icons next to layer names (default: true) */
  showLayerSymbol?: boolean;
  /** Maximum panel height in pixels (default: 600). When content exceeds this height, the panel becomes scrollable. */
  panelMaxHeight?: number;
  /** Whether to exclude drawn layers from drawing libraries like Geoman, Mapbox GL Draw, etc. (default: true) */
  excludeDrawnLayers?: boolean;
  /** Array of wildcard patterns to exclude layers by name (e.g., ['*-temp-*', 'debug-*']) */
  excludeLayers?: string[];
  /** Custom layer adapters for non-MapLibre layers (e.g., deck.gl COG layers, Zarr layers) */
  customLayerAdapters?: CustomLayerAdapter[];
  /**
   * URL of the basemap style JSON. If provided, all layers defined in this style
   * will be grouped under "Background", and all other layers will be shown individually
   * in the layer control. This provides reliable distinction between basemap layers
   * and user-added layers.
   */
  basemapStyleUrl?: string;
  /** Whether to enable context menu (right-click) on layers (default: true) */
  enableContextMenu?: boolean;
  /** Whether to enable drag-and-drop reordering of layers (default: true) */
  enableDragAndDrop?: boolean;
  /** Callback when a layer is renamed via context menu */
  onLayerRename?: (layerId: string, oldName: string, newName: string) => void;
  /** Callback when layers are reordered via drag-and-drop */
  onLayerReorder?: (layerOrder: string[]) => void;
  /** Callback when a layer is removed via context menu */
  onLayerRemove?: (layerId: string) => void;
}

/**
 * MapLibre layer types that support styling
 * Includes all standard MapLibre layer types
 */
export type StyleableLayerType =
  | 'fill'
  | 'line'
  | 'circle'
  | 'symbol'
  | 'raster'
  | 'heatmap'
  | 'fill-extrusion'
  | 'hillshade'
  | 'background';

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
 * Context menu state
 */
export interface ContextMenuState {
  /** Whether the context menu is visible */
  visible: boolean;
  /** The layer ID that the context menu is targeting */
  targetLayerId: string | null;
  /** X position of the context menu */
  x: number;
  /** Y position of the context menu */
  y: number;
}

/**
 * Drag state for layer reordering
 */
export interface DragState {
  /** Whether drag is active */
  active: boolean;
  /** The layer ID being dragged */
  layerId: string | null;
  /** Starting Y position of the drag */
  startY: number;
  /** Current Y position of the drag */
  currentY: number;
  /** Placeholder element showing drop location */
  placeholder: HTMLElement | null;
  /** The element being dragged (clone) */
  draggedElement: HTMLElement | null;
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
  /** Context menu state */
  contextMenu: ContextMenuState;
  /** Layer ID currently being renamed */
  renamingLayerId: string | null;
  /** Custom layer names set by user (layerId -> customName) */
  customLayerNames: Map<string, string>;
  /** Drag state for layer reordering */
  drag: DragState;
  /** Whether a style operation is in progress (prevents checkForNewLayers from running) */
  isStyleOperationInProgress: boolean;
}
