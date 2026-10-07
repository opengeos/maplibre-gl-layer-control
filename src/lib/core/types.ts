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
 * Partial layer state for user-provided initial configuration.
 * Users can specify only the properties they want to override (e.g., just `name`).
 */
export type PartialLayerState = Partial<LayerState>;

/**
 * Collection of partial layer states keyed by layer ID (for options input)
 */
export interface PartialLayerStates {
  [layerId: string]: PartialLayerState;
}

/**
 * A collapsible folder of layers in the panel. Supplied by a
 * {@link CustomLayerAdapter} through `getGroups`; layers join a group through
 * the adapter's `getLayerGroupId`.
 *
 * A group's `visible` and `opacity` are its own settings, separate from those
 * of its layers. The control shows and edits them but never folds them into
 * the layer rows: applying a hidden or translucent group to its layers on the
 * map is the adapter's job.
 */
export interface LayerGroupState {
  /** Unique group ID */
  id: string;
  /** Display name for the group */
  name: string;
  /** ID of the enclosing group, or undefined for a top-level group */
  parentId?: string;
  /** Whether the group is visible */
  visible: boolean;
  /** Group opacity (0-1) */
  opacity: number;
  /** Whether the group's rows are folded away in the panel */
  collapsed: boolean;
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

  /**
   * Get the current state of a layer. For a native map layer the adapter lists
   * in `getLayerIds`, report the layer's own visibility and opacity, without
   * folding in any group's: the control shows these values in the layer's row
   * and style editor and never reads them back from the map.
   */
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

  /**
   * Get the layer groups this adapter defines (optional). When any adapter
   * returns groups, the panel nests each layer under its group (see
   * {@link getLayerGroupId}) as collapsible folders, and drag-and-drop and the
   * context-menu moves keep a layer among the other layers of its own group.
   * Groups that contain no layer, directly or through a nested group, are not
   * shown.
   */
  getGroups?(): LayerGroupState[];

  /**
   * Get the ID of the group a layer belongs to, or undefined when the layer
   * sits at the top level (optional; required for groups to have members).
   */
  getLayerGroupId?(layerId: string): string | undefined;

  /** Set group visibility (optional; called from the group's checkbox). */
  setGroupVisibility?(groupId: string, visible: boolean): void;

  /** Set group opacity (0-1) (optional; called from the group's slider). */
  setGroupOpacity?(groupId: string, opacity: number): void;

  /**
   * Record that a group was collapsed or expanded in the panel (optional).
   * Without it the control still folds the group, but only until the panel is
   * rebuilt from the adapter's `getGroups`.
   */
  setGroupCollapsed?(groupId: string, collapsed: boolean): void;
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
  /** Initial layer states (keyed by layer ID). Partial values are accepted; unspecified fields will be auto-detected from the map. */
  layerStates?: PartialLayerStates;
  /** Array of layer IDs to control (if not specified, controls all layers) */
  layers?: string[];
  /** Initial panel width in pixels (default: 350) */
  panelWidth?: number;
  /** Minimum panel width in pixels (default: 240) */
  panelMinWidth?: number;
  /** Maximum panel width in pixels (default: 960) */
  panelMaxWidth?: number;
  /** Whether to show the style editor button (gear icon) for layers (default: true) */
  showStyleEditor?: boolean;
  /**
   * Whether the style editor shows every property control it supports for a
   * layer's type, even when the property is absent from the layer style
   * (default: false). When false, controls for optional properties (e.g.
   * `fill-opacity`, `fill-outline-color`) only appear once the layer sets them.
   *
   * Unset properties start at their effective value: the style-spec default,
   * or the inherited value (`fill-outline-color` follows `fill-color`).
   * Opening or closing the editor never writes to the map style; a property is
   * set only when the user edits its control, and Reset Style unsets it again.
   * A control that cannot take effect (e.g. outline color with
   * `fill-antialias: false` or a fill pattern, text properties without a
   * `text-field`, icon opacity without an `icon-image`) or whose value is a
   * data-driven expression stays visible but disabled with an explanation;
   * expressions are never replaced. Applies to ordinary layers and to native
   * sublayers exposed by custom-layer adapters.
   */
  showAllStyleProperties?: boolean;
  /** Whether to show the opacity slider for layers (default: true) */
  showOpacitySlider?: boolean;
  /** Whether to show layer type symbols/icons next to layer names (default: true) */
  showLayerSymbol?: boolean;
  /**
   * Maximum panel height in pixels. When omitted, the panel grows to fill the
   * available vertical space in the map container and only becomes scrollable
   * once the layer list is taller than that space. Set an explicit value to
   * cap the height instead.
   */
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
  /**
   * Callback fired whenever a paint property changes through the per-layer
   * style editor (a slider/color input/pattern picker, or Reset Style).
   * Reports the layer the open style editor belongs to (`layerId`), the
   * MapLibre paint property name (e.g. `"raster-brightness-max"`,
   * `"fill-color"`, or `"fill-pattern"`), and the new value. Pattern selection
   * reports its image ID; selecting None reports `undefined`. Reset reports
   * the restored raw value, including a string, expression, or `undefined`
   * for `fill-pattern`, and `undefined` for a property that
   * `showAllStyleProperties` exposed and the user set on a layer that did not
   * have it. Lets consumers mirror changes into their own store so
   * external style UI stays in sync. The control still applies changes to the
   * map itself; this callback is purely a notification.
   */
  onLayerStyleChange?: (
    layerId: string,
    property: string,
    value: unknown,
  ) => void;
  /**
   * Callback fired when the Background (basemap) group visibility is toggled
   * via the control's checkbox. Lets consumers mirror the new state into their
   * own store so external basemap UI (e.g. a separate layer panel) stays in sync.
   */
  onBackgroundVisibilityChange?: (visible: boolean) => void;
  /**
   * Callback fired when the Background (basemap) group opacity is changed via
   * the control's slider. Lets consumers mirror the new opacity into their own
   * store so external basemap UI stays in sync.
   */
  onBackgroundOpacityChange?: (opacity: number) => void;
  /**
   * Whether to show the "Saved configurations" controls in the Background Layers
   * panel, letting users save the current basemap element visibility as a named
   * preset and re-apply it later with one click (default: true).
   */
  enableBackgroundPresets?: boolean;
  /**
   * localStorage key under which background-layer visibility presets are stored.
   * Presets persist across sessions and projects (default:
   * 'maplibre-layer-control:background-presets').
   */
  backgroundPresetStorageKey?: string;
  /**
   * Callback fired whenever the set of saved background presets changes
   * (created or deleted). Receives the full preset map. Applying a preset does
   * not change the stored set, so it does not trigger this callback.
   */
  onBackgroundPresetsChange?: (presets: BackgroundPresets) => void;
}

/**
 * A single background-layer visibility preset: a map of style-layer ID to
 * whether that layer should be visible.
 */
export type BackgroundLayerVisibility = Record<string, boolean>;

/**
 * Collection of named background-layer visibility presets, keyed by preset name.
 */
export type BackgroundPresets = Record<string, BackgroundLayerVisibility>;

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
  /** Layer IDs whose category sub-legend is expanded */
  expandedCategoryLayers: Set<string>;
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
