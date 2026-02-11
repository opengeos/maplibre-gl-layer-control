import type { IControl, Map as MapLibreMap, LayerSpecification } from 'maplibre-gl';
import type {
  LayerControlOptions,
  LayerState,
  OriginalStyle,
  InternalControlState,
  CustomLayerAdapter,
} from './types';
import { CustomLayerRegistry } from './CustomLayerRegistry';
import { getLayerType, getLayerOpacity, setLayerOpacity } from '../utils/layerUtils';
import { cacheOriginalLayerStyle, restoreOriginalStyle } from '../utils/styleCache';
import { normalizeColor } from '../utils/colorUtils';
import { formatNumericValue } from '../utils/formatters';
import {
  getLayerColor,
  getLayerColorFromSpec,
  createLayerSymbolSVG,
  createBackgroundGroupSymbolSVG,
} from '../utils/symbolUtils';

/**
 * LayerControl - A comprehensive layer control for MapLibre GL
 * Provides visibility toggle, opacity control, and advanced style editing
 */
export class LayerControl implements IControl {
  private map!: MapLibreMap;
  private mapContainer!: HTMLElement;
  private container!: HTMLDivElement;
  private button!: HTMLButtonElement;
  private panel!: HTMLDivElement;

  // Panel positioning
  private resizeHandler: (() => void) | null = null;
  private mapResizeHandler: (() => void) | null = null;

  // State management
  private state: InternalControlState;
  private targetLayers: string[];
  private styleEditors: Map<string, HTMLElement>;
  private initialSourceIds: Set<string> | null = null;
  private initialLayerIds: Set<string> | null = null;

  // Panel width management
  private minPanelWidth: number;
  private maxPanelWidth: number;
  private maxPanelHeight: number;
  private showStyleEditor: boolean;
  private showOpacitySlider: boolean;
  private showLayerSymbol: boolean;
  private excludeDrawnLayers: boolean;
  private excludeLayerPatterns: RegExp[];
  private customLayerRegistry: CustomLayerRegistry | null = null;
  private customLayerUnsubscribe: (() => void) | null = null;
  private removedCustomLayerIds: Set<string> = new Set();
  private nativeLayerGroups: Map<string, string[]> = new Map();
  private basemapStyleUrl: string | null = null;
  private basemapLayerIds: Set<string> | null = null;
  private widthSliderEl: HTMLElement | null = null;
  private widthThumbEl: HTMLElement | null = null;
  private widthValueEl: HTMLElement | null = null;
  private isWidthSliderActive = false;
  private widthDragRectWidth: number | null = null;
  private widthDragStartX: number | null = null;
  private widthDragStartWidth: number | null = null;
  private widthFrame: number | null = null;

  // Context menu and drag-drop
  private contextMenuEl: HTMLDivElement | null = null;
  private enableContextMenu: boolean;
  private enableDragAndDrop: boolean;
  private onLayerRename?: (layerId: string, oldName: string, newName: string) => void;
  private onLayerReorder?: (layerOrder: string[]) => void;
  private onLayerRemove?: (layerId: string) => void;

  constructor(options: LayerControlOptions = {}) {
    this.minPanelWidth = options.panelMinWidth || 240;
    this.maxPanelWidth = options.panelMaxWidth || 420;
    this.maxPanelHeight = options.panelMaxHeight || 600;
    this.showStyleEditor = options.showStyleEditor !== false;
    this.showOpacitySlider = options.showOpacitySlider !== false;
    this.showLayerSymbol = options.showLayerSymbol !== false;
    this.excludeDrawnLayers = options.excludeDrawnLayers !== false;
    this.excludeLayerPatterns = this.wildcardPatternsToRegex(options.excludeLayers || []);

    // Context menu and drag-drop options
    this.enableContextMenu = options.enableContextMenu !== false;
    this.enableDragAndDrop = options.enableDragAndDrop !== false;
    this.onLayerRename = options.onLayerRename;
    this.onLayerReorder = options.onLayerReorder;
    this.onLayerRemove = options.onLayerRemove;

    this.state = {
      collapsed: options.collapsed !== false,
      panelWidth: options.panelWidth || 350,
      activeStyleEditor: null,
      layerStates: options.layerStates || {},
      originalStyles: new Map<string, OriginalStyle>(),
      userInteractingWithSlider: false,
      backgroundLegendOpen: false,
      backgroundLayerVisibility: new Map<string, boolean>(),
      onlyRenderedFilter: false,
      contextMenu: {
        visible: false,
        targetLayerId: null,
        x: 0,
        y: 0,
      },
      renamingLayerId: null,
      customLayerNames: new Map<string, string>(),
      drag: {
        active: false,
        layerId: null,
        startY: 0,
        currentY: 0,
        placeholder: null,
        draggedElement: null,
      },
      isStyleOperationInProgress: false,
    };

    this.targetLayers = options.layers || Object.keys(this.state.layerStates);
    this.styleEditors = new Map<string, HTMLElement>();

    // Initialize custom layer registry if adapters are provided
    if (options.customLayerAdapters && options.customLayerAdapters.length > 0) {
      this.customLayerRegistry = new CustomLayerRegistry();
      options.customLayerAdapters.forEach(adapter => {
        this.customLayerRegistry!.register(adapter);
      });
    }

    // Store basemap style URL for reliable layer detection
    this.basemapStyleUrl = options.basemapStyleUrl || null;
  }

  /**
   * Called when the control is added to the map
   */
  onAdd(map: MapLibreMap): HTMLElement {
    this.map = map;
    this.mapContainer = map.getContainer();

    // Capture initial source IDs and layer IDs (basemap) before auto-detecting layers
    // Sources and layers added after this point are considered user-added
    const style = this.map.getStyle();
    if (style && style.sources) {
      this.initialSourceIds = new Set(Object.keys(style.sources));
    } else {
      this.initialSourceIds = new Set();
    }

    // Capture initial layer IDs - any layer added after this is user-added
    if (style && style.layers) {
      this.initialLayerIds = new Set(style.layers.map(layer => layer.id));
    } else {
      this.initialLayerIds = new Set();
    }

    this.container = this.createContainer();
    this.button = this.createToggleButton();
    this.panel = this.createPanel();

    this.container.appendChild(this.button);
    // Append panel to map container for independent positioning (avoids overlap with other controls)
    this.mapContainer.appendChild(this.panel);

    // Create context menu element (appended to map container)
    if (this.enableContextMenu) {
      this.contextMenuEl = this.createContextMenu();
      this.mapContainer.appendChild(this.contextMenuEl);
    }

    // Now that panel is attached, update width display
    this.updateWidthDisplay();

    // Setup event listeners
    this.setupEventListeners();

    // If basemapStyleUrl is provided, fetch it first for reliable layer detection
    if (this.basemapStyleUrl && !this.basemapLayerIds) {
      this.fetchBasemapStyle().then(() => {
        // Auto-detect layers after basemap style is fetched
        if (Object.keys(this.state.layerStates).length === 0) {
          this.autoDetectLayers();
        }
        // Build layer items
        this.buildLayerItems();
      }).catch(error => {
        console.warn('Failed to fetch basemap style, falling back to heuristic detection:', error);
        // Fall back to heuristic detection
        if (Object.keys(this.state.layerStates).length === 0) {
          this.autoDetectLayers();
        }
        this.buildLayerItems();
      });
    } else {
      // Auto-detect layers using source-based heuristics
      if (Object.keys(this.state.layerStates).length === 0) {
        this.autoDetectLayers();
      }
      // Build layer items
      this.buildLayerItems();
    }

    // If panel starts expanded, update position after control is added to DOM
    if (!this.state.collapsed) {
      // Use requestAnimationFrame to wait until container is in DOM and positioned
      requestAnimationFrame(() => {
        this.updatePanelPosition();
      });
    }

    return this.container;
  }

  /**
   * Fetch the basemap style JSON and extract layer IDs.
   * This provides reliable distinction between basemap and user-added layers.
   */
  private async fetchBasemapStyle(): Promise<void> {
    if (!this.basemapStyleUrl) return;

    try {
      const response = await fetch(this.basemapStyleUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const styleJson = await response.json();

      // Extract layer IDs from the basemap style
      if (styleJson && Array.isArray(styleJson.layers)) {
        this.basemapLayerIds = new Set(
          styleJson.layers.map((layer: { id: string }) => layer.id)
        );
      } else {
        this.basemapLayerIds = new Set();
      }
    } catch (error) {
      console.warn('Failed to fetch basemap style from URL:', this.basemapStyleUrl, error);
      throw error;
    }
  }

  /**
   * Called when the control is removed from the map
   */
  onRemove(): void {
    // Clean up custom layer registry subscription
    if (this.customLayerUnsubscribe) {
      this.customLayerUnsubscribe();
      this.customLayerUnsubscribe = null;
    }
    if (this.customLayerRegistry) {
      this.customLayerRegistry.destroy();
      this.customLayerRegistry = null;
    }

    // Remove resize event listeners
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.mapResizeHandler) {
      this.map.off('resize', this.mapResizeHandler);
      this.mapResizeHandler = null;
    }

    // Clean up context menu
    if (this.contextMenuEl) {
      this.contextMenuEl.parentNode?.removeChild(this.contextMenuEl);
      this.contextMenuEl = null;
    }

    // Clean up any active drag state
    this.cleanupDragState();

    // Remove panel from map container
    this.panel.parentNode?.removeChild(this.panel);

    // Remove button container from control stack
    this.container.parentNode?.removeChild(this.container);
  }

  /**
   * Auto-detect layers from the map and populate layerStates
   */
  private autoDetectLayers(): void {
    const style = this.map.getStyle();
    if (!style || !style.layers) {
      return;
    }

    // Get all layer IDs from the map
    const allLayerIds = style.layers.map(layer => layer.id);

    if (this.targetLayers.length === 0) {
      // No layers specified - auto-detect user-added layers vs background layers
      const userAddedLayers: string[] = [];
      const backgroundLayerIds: string[] = [];

      // Detection priority for INITIAL detection:
      // 1. basemapLayerIds (from basemapStyleUrl) - most reliable
      // 2. Source-based heuristics - works for layers added before OR after control
      // Note: initialLayerIds is NOT used here because it would incorrectly classify
      // user layers added BEFORE the control as basemap layers
      const useBasemapStyleDetection = this.basemapLayerIds !== null && this.basemapLayerIds.size > 0;

      // Identify which sources are user-added (for source-based heuristic detection)
      const userAddedSourceIds = useBasemapStyleDetection
        ? new Set<string>()
        : this.detectUserAddedSources();

      allLayerIds.forEach(layerId => {
        const layer = this.map.getLayer(layerId);
        if (!layer) return;

        // Skip drawn layers if excludeDrawnLayers is enabled
        if (this.excludeDrawnLayers && this.isDrawnLayer(layerId)) {
          backgroundLayerIds.push(layerId);
          return;
        }

        // Skip layers matching user-defined exclusion patterns
        if (this.isExcludedByPattern(layerId)) {
          backgroundLayerIds.push(layerId);
          return;
        }

        if (useBasemapStyleDetection) {
          // Use basemap style layer IDs for reliable detection
          if (this.basemapLayerIds!.has(layerId)) {
            // This layer is from the basemap style
            backgroundLayerIds.push(layerId);
          } else {
            // This layer is not in the basemap style - it's user-added
            userAddedLayers.push(layerId);
          }
        } else {
          // Use source-based heuristics
          // Check if this layer uses a user-added source
          const sourceId = (layer as any).source;
          if (sourceId && userAddedSourceIds.has(sourceId)) {
            userAddedLayers.push(layerId);
          } else {
            // Layer uses a basemap source or has no source (like background color layer)
            backgroundLayerIds.push(layerId);
          }
        }
      });

      // Add Background entry if there are background layers
      if (backgroundLayerIds.length > 0) {
        this.state.layerStates['Background'] = {
          visible: true,
          opacity: 1.0,
          name: 'Background'
        };
      }

      // Add entries for auto-detected user layers
      userAddedLayers.forEach(layerId => {
        const layer = this.map.getLayer(layerId);
        if (!layer) return;

        const visibility = this.map.getLayoutProperty(layerId, 'visibility');
        const isVisible = visibility !== 'none';
        const layerType = layer.type;
        const opacity = getLayerOpacity(this.map, layerId, layerType);
        const friendlyName = this.generateFriendlyName(layerId);

        this.state.layerStates[layerId] = {
          visible: isVisible,
          opacity: opacity,
          name: friendlyName
        };
      });
    } else {
      // Specific layers requested - separate into user layers + Background
      const userLayers: string[] = [];
      const basemapLayers: string[] = [];

      allLayerIds.forEach(layerId => {
        // Skip layers matching user-defined exclusion patterns
        if (this.isExcludedByPattern(layerId)) {
          basemapLayers.push(layerId);
          return;
        }

        if (this.targetLayers.includes(layerId)) {
          userLayers.push(layerId);
        } else {
          basemapLayers.push(layerId);
        }
      });

      // Add Background entry if there are basemap layers
      if (basemapLayers.length > 0) {
        this.state.layerStates['Background'] = {
          visible: true,
          opacity: 1.0,
          name: 'Background'
        };
      }

      // Add entries for user-specified layers
      userLayers.forEach(layerId => {
        const layer = this.map.getLayer(layerId);
        if (!layer) return;

        // Get visibility
        const visibility = this.map.getLayoutProperty(layerId, 'visibility');
        const isVisible = visibility !== 'none';

        // Get opacity
        const layerType = layer.type;
        const opacity = getLayerOpacity(this.map, layerId, layerType);

        // Generate friendly name from layer ID
        const friendlyName = this.generateFriendlyName(layerId);

        this.state.layerStates[layerId] = {
          visible: isVisible,
          opacity: opacity,
          name: friendlyName
        };
      });
    }

    // Detect custom layers from registry
    if (this.customLayerRegistry) {
      const customLayerIds = this.customLayerRegistry.getAllLayerIds();
      customLayerIds.forEach(layerId => {
        // Skip if already in state
        if (this.state.layerStates[layerId]) return;

        const customState = this.customLayerRegistry!.getLayerState(layerId);
        if (customState) {
          this.state.layerStates[layerId] = {
            visible: customState.visible,
            opacity: customState.opacity,
            name: customState.name,
            isCustomLayer: true,
            customLayerType: this.customLayerRegistry!.getSymbolType(layerId) || undefined,
          };
        }
      });
    }

    // Update targetLayers to include detected layers
    this.targetLayers = Object.keys(this.state.layerStates);
  }

  /**
   * Detect which sources are user-added (not from the basemap style)
   * User-added sources are identified by:
   * - Sources that were NOT present when the control was first added
   * - Additionally for sources added later:
   *   - GeoJSON sources with inline data objects (not URL strings)
   *   - Image, video, canvas sources
   *   - Raster, raster-dem, vector sources from non-basemap tile providers
   */
  private detectUserAddedSources(): Set<string> {
    const userAddedSources = new Set<string>();
    const style = this.map.getStyle();
    if (!style || !style.sources) return userAddedSources;

    // First, detect the basemap's domain from sprite/glyphs URLs
    const basemapDomains = new Set<string>();

    // Known basemap providers
    const knownBasemapProviders = [
      'demotiles.maplibre.org',
      'api.maptiler.com',
      'tiles.stadiamaps.com',
      'api.mapbox.com',
      'basemaps.cartocdn.com',
      'tiles.mapbox.com',
      'a.basemaps.cartocdn.com',
      'b.basemaps.cartocdn.com',
      'c.basemaps.cartocdn.com',
      'd.basemaps.cartocdn.com',
      'tiles.arcgis.com',
      'server.arcgisonline.com',
      'services.arcgisonline.com',
    ];

    // Detect domains from sprite/glyphs URLs (these are likely basemap domains)
    const spriteUrl = style.sprite as string | undefined;
    if (spriteUrl && typeof spriteUrl === 'string') {
      try {
        const url = new URL(spriteUrl);
        basemapDomains.add(url.hostname);
      } catch { /* ignore */ }
    }
    if (style.glyphs) {
      try {
        const url = new URL(style.glyphs.replace('{fontstack}', 'x').replace('{range}', 'x'));
        basemapDomains.add(url.hostname);
      } catch { /* ignore */ }
    }

    // Check each source
    for (const [sourceId, source] of Object.entries(style.sources)) {
      // If we have a snapshot of initial sources, use that as the primary check
      // Sources that existed when the control was added are basemap sources
      if (this.initialSourceIds && this.initialSourceIds.has(sourceId)) {
        // This source was present in the initial style, it's a basemap source
        continue;
      }

      const src = source as any;
      const sourceType = src.type;

      // Image, video, and canvas sources are always user-added
      if (sourceType === 'image' || sourceType === 'video' || sourceType === 'canvas') {
        userAddedSources.add(sourceId);
        continue;
      }

      // GeoJSON sources with inline data objects are user-added (if added after initial load)
      if (sourceType === 'geojson') {
        if (src.data && typeof src.data === 'object') {
          userAddedSources.add(sourceId);
        } else if (src.data && typeof src.data === 'string') {
          // GeoJSON with URL - check if it's from a basemap domain
          try {
            const url = new URL(src.data);
            const isBasemap = knownBasemapProviders.some(p => url.hostname.includes(p)) ||
              basemapDomains.has(url.hostname);
            if (!isBasemap) {
              userAddedSources.add(sourceId);
            }
          } catch {
            // Relative URL or invalid - assume user-added
            userAddedSources.add(sourceId);
          }
        }
        continue;
      }

      // Check tile URLs for raster, raster-dem, and vector sources
      if (sourceType === 'raster' || sourceType === 'raster-dem' || sourceType === 'vector') {
        const tileUrl = src.url || (src.tiles && src.tiles[0]) || '';
        if (tileUrl) {
          try {
            const url = new URL(tileUrl.replace(/{[^}]+}/g, '0'));
            const hostname = url.hostname;

            // Check if this is a known basemap provider
            const isKnownBasemap = knownBasemapProviders.some(provider =>
              hostname === provider || hostname.endsWith('.' + provider)
            );

            // Check if this matches detected basemap domains
            const matchesBasemapDomain = basemapDomains.has(hostname);

            // If not a basemap source, it's user-added
            if (!isKnownBasemap && !matchesBasemapDomain) {
              userAddedSources.add(sourceId);
            }
          } catch {
            // If URL parsing fails, assume it could be user-added
            userAddedSources.add(sourceId);
          }
        }
      }
    }

    return userAddedSources;
  }

  /**
   * Generate a friendly display name from a layer ID
   */
  private generateFriendlyName(layerId: string): string {
    // Remove common prefixes
    let name = layerId.replace(/^(layer[-_]?|gl[-_]?)/, '');

    // Replace dashes and underscores with spaces
    name = name.replace(/[-_]/g, ' ');

    // Capitalize first letter of each word
    name = name.replace(/\b\w/g, char => char.toUpperCase());

    return name || layerId; // Fallback to original if empty
  }

  /**
   * Check if a layer ID belongs to a drawing library (Geoman, Mapbox GL Draw, etc.)
   * @param layerId The layer ID to check
   * @returns true if the layer is from a drawing library
   */
  private isDrawnLayer(layerId: string): boolean {
    const drawnLayerPatterns = [
      // Drawing libraries
      /^gm[-_\s]/i,                  // Geoman (gm-main-*, gm_*, Gm Temporary...)
      /^gl-draw[-_]/i,               // Mapbox GL Draw
      /^mapbox-gl-draw[-_]/i,        // Mapbox GL Draw alternative
      /^terra-draw[-_]/i,            // Terra Draw
      /^maplibre-gl-draw[-_]/i,      // MapLibre GL Draw
      /^draw[-_]layer/i,             // Generic draw layers
      // maplibre-gl-components internal layers
      /^measure-/i,                  // MeasureControl (measure-{id}-fill, measure-{id}-line)
      /^pmtiles-source-/i,           // PMTilesLayerControl (managed via adapter)
      /^stac-search-footprints/i,    // StacSearchControl footprint layers
    ];

    return drawnLayerPatterns.some(pattern => pattern.test(layerId));
  }

  /**
   * Convert wildcard patterns (e.g., '*-temp-*', 'debug-*') to RegExp objects
   */
  private wildcardPatternsToRegex(patterns: string[]): RegExp[] {
    return patterns.map(pattern => {
      // Escape special regex characters except *
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      // Convert * to .* for wildcard matching
      const regexStr = escaped.replace(/\*/g, '.*');
      return new RegExp(`^${regexStr}$`, 'i');
    });
  }

  /**
   * Check if a layer matches any of the user-defined exclusion patterns
   */
  private isExcludedByPattern(layerId: string): boolean {
    return this.excludeLayerPatterns.some(pattern => pattern.test(layerId));
  }

  /**
   * Create the main container element
   */
  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group maplibregl-ctrl-layer-control';
    return container;
  }

  /**
   * Create the toggle button
   */
  private createToggleButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Layer Control';
    button.setAttribute('aria-label', 'Layer Control');

    // Create layers icon (SVG)
    const icon = document.createElement('span');
    icon.className = 'layer-control-icon';
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" ' +
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polygon points="12 3 3 8.25 12 13.5 21 8.25 12 3"></polygon>' +
      '<polyline points="3 12.75 12 18 21 12.75"></polyline>' +
      '<polyline points="3 17.25 12 22 21 17.25"></polyline>' +
      '</svg>';

    button.appendChild(icon);
    return button;
  }

  /**
   * Create the panel element
   */
  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'layer-control-panel';

    // Set initial width and max height directly on the element
    panel.style.width = `${this.state.panelWidth}px`;
    panel.style.maxHeight = `${this.maxPanelHeight}px`;

    if (!this.state.collapsed) {
      panel.classList.add('expanded');
    }

    // Add header
    const header = this.createPanelHeader();
    panel.appendChild(header);

    // Add action buttons (Show All / Hide All)
    const actionButtons = this.createActionButtons();
    panel.appendChild(actionButtons);

    return panel;
  }

  /**
   * Detect which corner the control is positioned in
   * @returns The position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
   */
  private getControlPosition(): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
    const parent = this.container.parentElement;
    if (!parent) return 'top-right'; // Default

    if (parent.classList.contains('maplibregl-ctrl-top-left')) return 'top-left';
    if (parent.classList.contains('maplibregl-ctrl-top-right')) return 'top-right';
    if (parent.classList.contains('maplibregl-ctrl-bottom-left')) return 'bottom-left';
    if (parent.classList.contains('maplibregl-ctrl-bottom-right')) return 'bottom-right';

    return 'top-right'; // Default
  }

  /**
   * Update the panel position based on button location and control corner
   * Positions the panel next to the button, expanding in the appropriate direction
   */
  private updatePanelPosition(): void {
    if (!this.button || !this.panel || !this.mapContainer) return;

    const buttonRect = this.button.getBoundingClientRect();
    const mapRect = this.mapContainer.getBoundingClientRect();
    const position = this.getControlPosition();

    // Calculate button position relative to map container
    const buttonTop = buttonRect.top - mapRect.top;
    const buttonBottom = mapRect.bottom - buttonRect.bottom;
    const buttonLeft = buttonRect.left - mapRect.left;
    const buttonRight = mapRect.right - buttonRect.right;

    const panelGap = 5; // Gap between button and panel

    // Reset all positioning
    this.panel.style.top = '';
    this.panel.style.bottom = '';
    this.panel.style.left = '';
    this.panel.style.right = '';

    switch (position) {
      case 'top-left':
        // Panel expands down and to the right
        this.panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this.panel.style.left = `${buttonLeft}px`;
        break;

      case 'top-right':
        // Panel expands down and to the left
        this.panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this.panel.style.right = `${buttonRight}px`;
        break;

      case 'bottom-left':
        // Panel expands up and to the right
        this.panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this.panel.style.left = `${buttonLeft}px`;
        break;

      case 'bottom-right':
        // Panel expands up and to the left
        this.panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this.panel.style.right = `${buttonRight}px`;
        break;
    }
  }

  /**
   * Create action buttons for Show All / Hide All
   */
  private createActionButtons(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'layer-control-actions';

    const showAllBtn = document.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.className = 'layer-control-action-btn';
    showAllBtn.textContent = 'Show All';
    showAllBtn.title = 'Show all layers';
    showAllBtn.addEventListener('click', () => this.setAllLayersVisibility(true));

    const hideAllBtn = document.createElement('button');
    hideAllBtn.type = 'button';
    hideAllBtn.className = 'layer-control-action-btn';
    hideAllBtn.textContent = 'Hide All';
    hideAllBtn.title = 'Hide all layers';
    hideAllBtn.addEventListener('click', () => this.setAllLayersVisibility(false));

    container.appendChild(showAllBtn);
    container.appendChild(hideAllBtn);

    return container;
  }

  /**
   * Set visibility of all layers
   */
  private setAllLayersVisibility(visible: boolean): void {
    Object.keys(this.state.layerStates).forEach(layerId => {
      // Use toggleLayerVisibility which handles both native and custom layers
      this.toggleLayerVisibility(layerId, visible);

      // Update checkbox in UI
      const itemEl = this.panel.querySelector(`[data-layer-id="${layerId}"]`);
      if (itemEl) {
        const checkbox = itemEl.querySelector('.layer-control-checkbox') as HTMLInputElement;
        if (checkbox) {
          checkbox.checked = visible;
          checkbox.indeterminate = false;
        }
      }
    });
  }

  /**
   * Create the panel header with title and width control
   */
  private createPanelHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'layer-control-panel-header';

    const title = document.createElement('span');
    title.className = 'layer-control-panel-title';
    title.textContent = 'Layers';
    header.appendChild(title);

    // Add width control
    const widthControl = this.createWidthControl();
    header.appendChild(widthControl);

    return header;
  }

  /**
   * Create the width control slider
   */
  private createWidthControl(): HTMLElement {
    const widthControl = document.createElement('label');
    widthControl.className = 'layer-control-width-control';
    widthControl.title = 'Adjust layer panel width';

    const widthLabel = document.createElement('span');
    widthLabel.textContent = 'Width';
    widthControl.appendChild(widthLabel);

    const widthSlider = document.createElement('div');
    widthSlider.className = 'layer-control-width-slider';
    widthSlider.setAttribute('role', 'slider');
    widthSlider.setAttribute('aria-valuemin', String(this.minPanelWidth));
    widthSlider.setAttribute('aria-valuemax', String(this.maxPanelWidth));
    widthSlider.setAttribute('aria-valuenow', String(this.state.panelWidth));
    widthSlider.setAttribute('aria-valuestep', '10');
    widthSlider.setAttribute('aria-label', 'Layer panel width');
    widthSlider.tabIndex = 0;

    const widthTrack = document.createElement('div');
    widthTrack.className = 'layer-control-width-track';
    const widthThumb = document.createElement('div');
    widthThumb.className = 'layer-control-width-thumb';

    widthSlider.appendChild(widthTrack);
    widthSlider.appendChild(widthThumb);

    this.widthSliderEl = widthSlider;
    this.widthThumbEl = widthThumb;

    // Add width value display
    const widthValue = document.createElement('span');
    widthValue.className = 'layer-control-width-value';
    this.widthValueEl = widthValue;

    widthControl.appendChild(widthSlider);
    widthControl.appendChild(widthValue);

    this.updateWidthDisplay();
    this.setupWidthSliderEvents(widthSlider);

    return widthControl;
  }

  /**
   * Setup event listeners for width slider
   */
  private setupWidthSliderEvents(widthSlider: HTMLElement): void {
    // Pointer events for dragging
    widthSlider.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const rect = widthSlider.getBoundingClientRect();
      this.widthDragRectWidth = rect.width || 1;
      this.widthDragStartX = event.clientX;
      this.widthDragStartWidth = this.state.panelWidth;
      this.isWidthSliderActive = true;
      widthSlider.setPointerCapture(event.pointerId);
      this.updateWidthFromPointer(event, true);
    });

    widthSlider.addEventListener('pointermove', (event) => {
      if (!this.isWidthSliderActive) return;
      this.updateWidthFromPointer(event);
    });

    const endPointerDrag = (event: PointerEvent) => {
      if (!this.isWidthSliderActive) return;
      if (event.pointerId !== undefined) {
        try {
          widthSlider.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Ignore release errors
        }
      }
      this.isWidthSliderActive = false;
      this.widthDragRectWidth = null;
      this.widthDragStartX = null;
      this.widthDragStartWidth = null;
      this.updateWidthDisplay();
    };

    widthSlider.addEventListener('pointerup', endPointerDrag);
    widthSlider.addEventListener('pointercancel', endPointerDrag);
    widthSlider.addEventListener('lostpointercapture', endPointerDrag);

    // Keyboard navigation
    widthSlider.addEventListener('keydown', (event) => {
      let handled = true;
      const step = event.shiftKey ? 20 : 10;

      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          this.applyPanelWidth(this.state.panelWidth - step, true);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          this.applyPanelWidth(this.state.panelWidth + step, true);
          break;
        case 'Home':
          this.applyPanelWidth(this.minPanelWidth, true);
          break;
        case 'End':
          this.applyPanelWidth(this.maxPanelWidth, true);
          break;
        case 'PageUp':
          this.applyPanelWidth(this.state.panelWidth + 50, true);
          break;
        case 'PageDown':
          this.applyPanelWidth(this.state.panelWidth - 50, true);
          break;
        default:
          handled = false;
      }

      if (handled) {
        event.preventDefault();
        this.updateWidthDisplay();
      }
    });
  }

  /**
   * Update panel width from pointer event
   */
  private updateWidthFromPointer(event: PointerEvent, resetBaseline = false): void {
    if (!this.widthSliderEl) return;

    const sliderWidth = this.widthDragRectWidth || this.widthSliderEl.getBoundingClientRect().width || 1;
    const widthRange = this.maxPanelWidth - this.minPanelWidth;

    let width: number;
    if (resetBaseline) {
      const rect = this.widthSliderEl.getBoundingClientRect();
      const relative = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      const clampedRatio = Math.min(1, Math.max(0, relative));
      width = this.minPanelWidth + clampedRatio * widthRange;
      this.widthDragStartWidth = width;
      this.widthDragStartX = event.clientX;
    } else {
      const delta = event.clientX - (this.widthDragStartX || event.clientX);
      width = (this.widthDragStartWidth || this.state.panelWidth) + (delta / sliderWidth) * widthRange;
    }

    this.applyPanelWidth(width, this.isWidthSliderActive);
  }

  /**
   * Apply panel width (clamped to min/max)
   */
  private applyPanelWidth(width: number, immediate = false): void {
    const clamped = Math.round(Math.min(this.maxPanelWidth, Math.max(this.minPanelWidth, width)));

    const applyWidth = () => {
      this.state.panelWidth = clamped;
      const px = `${clamped}px`;
      this.panel.style.width = px;
      this.updateWidthDisplay();
    };

    if (immediate) {
      applyWidth();
      return;
    }

    if (this.widthFrame) {
      cancelAnimationFrame(this.widthFrame);
    }
    this.widthFrame = requestAnimationFrame(() => {
      applyWidth();
      this.widthFrame = null;
    });
  }

  /**
   * Update width display (value label and thumb position)
   */
  private updateWidthDisplay(): void {
    if (this.widthValueEl) {
      this.widthValueEl.textContent = `${this.state.panelWidth}px`;
    }
    if (this.widthSliderEl) {
      this.widthSliderEl.setAttribute('aria-valuenow', String(this.state.panelWidth));
      const ratio = (this.state.panelWidth - this.minPanelWidth) / (this.maxPanelWidth - this.minPanelWidth || 1);
      if (this.widthThumbEl) {
        const sliderWidth = this.widthSliderEl.clientWidth;
        // If element not yet rendered, defer the update
        if (sliderWidth === 0) {
          requestAnimationFrame(() => this.updateWidthDisplay());
          return;
        }
        const thumbWidth = this.widthThumbEl.offsetWidth || 14;
        const padding = 16;
        const available = Math.max(0, sliderWidth - padding - thumbWidth);
        const clampedRatio = Math.min(1, Math.max(0, ratio));
        const leftPx = 8 + available * clampedRatio;
        this.widthThumbEl.style.left = `${leftPx}px`;
      }
    }
  }

  /**
   * Setup main event listeners
   */
  private setupEventListeners(): void {
    // Toggle button click
    this.button.addEventListener('click', () => this.toggle());

    // Click outside to close panel and context menu
    document.addEventListener('click', (e) => {
      const target = e.target as Node;

      // Close context menu if clicking outside of it
      if (this.contextMenuEl && this.state.contextMenu.visible) {
        if (!this.contextMenuEl.contains(target)) {
          this.hideContextMenu();
        }
      }

      // Close panel if clicking outside
      if (!this.container.contains(target) && !this.panel.contains(target)) {
        this.collapse();
      }
    });

    // Update panel position on window resize
    this.resizeHandler = () => {
      if (!this.state.collapsed) {
        this.updatePanelPosition();
      }
    };
    window.addEventListener('resize', this.resizeHandler);

    // Update panel position on map resize (e.g., sidebar toggle)
    this.mapResizeHandler = () => {
      if (!this.state.collapsed) {
        this.updatePanelPosition();
      }
    };
    this.map.on('resize', this.mapResizeHandler);

    // Listen for map layer changes
    this.setupLayerChangeListeners();
  }

  /**
   * Setup listeners for map layer changes
   */
  private setupLayerChangeListeners(): void {
    this.map.on('styledata', () => {
      setTimeout(() => {
        this.updateLayerStatesFromMap();
        this.checkForNewLayers();
      }, 100);
    });

    this.map.on('data', (e) => {
      if (e.sourceDataType === 'content') {
        setTimeout(() => {
          this.updateLayerStatesFromMap();
          this.checkForNewLayers();
        }, 100);
      }
    });

    this.map.on('sourcedata', (e) => {
      if (e.sourceDataType === 'metadata') {
        setTimeout(() => {
          this.checkForNewLayers();
        }, 150);
      }
    });

    // Subscribe to custom layer registry changes
    if (this.customLayerRegistry) {
      this.customLayerUnsubscribe = this.customLayerRegistry.onChange((event, layerId) => {
        // If a previously removed layer is re-added, allow it to appear again
        if (event === 'add' && layerId) {
          this.removedCustomLayerIds.delete(layerId);
        }
        setTimeout(() => this.checkForNewLayers(), 100);
      });
    }
  }

  /**
   * Toggle panel expanded/collapsed state
   */
  private toggle(): void {
    if (this.state.collapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /**
   * Expand the panel
   */
  private expand(): void {
    this.state.collapsed = false;
    this.panel.classList.add('expanded');
    this.updatePanelPosition();
  }

  /**
   * Collapse the panel
   */
  private collapse(): void {
    this.state.collapsed = true;
    this.panel.classList.remove('expanded');
  }

  /**
   * Build layer items (called initially and when layers change)
   */
  private buildLayerItems(): void {
    // Clear existing items
    const existingItems = this.panel.querySelectorAll('.layer-control-item');
    existingItems.forEach(item => item.remove());
    this.styleEditors.clear();

    // Add items for all layers in our state
    Object.entries(this.state.layerStates).forEach(([layerId, state]) => {
      if (this.targetLayers.length === 0 || this.targetLayers.includes(layerId)) {
        this.addLayerItem(layerId, state);
      }
    });
  }

  /**
   * Add a single layer item to the panel
   */
  private addLayerItem(layerId: string, state: LayerState): void {
    const item = document.createElement('div');
    item.className = 'layer-control-item';
    item.setAttribute('data-layer-id', layerId);

    const row = document.createElement('div');
    row.className = 'layer-control-row';

    // Add drag handle (disabled for Background layer for alignment)
    if (this.enableDragAndDrop) {
      if (layerId === 'Background') {
        const disabledHandle = this.createDisabledDragHandle();
        row.appendChild(disabledHandle);
      } else {
        const dragHandle = this.createDragHandle(layerId);
        row.appendChild(dragHandle);
      }
    }

    // Visibility checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'layer-control-checkbox';
    checkbox.checked = state.visible;
    checkbox.addEventListener('change', () => {
      this.toggleLayerVisibility(layerId, checkbox.checked);
    });

    // Layer name - use custom name if set
    const displayName = this.state.customLayerNames.get(layerId) || state.name || layerId;
    const name = document.createElement('span');
    name.className = 'layer-control-name';
    name.textContent = displayName;
    name.title = displayName;

    row.appendChild(checkbox);

    // Add layer symbol (if enabled)
    if (this.showLayerSymbol) {
      if (layerId === 'Background') {
        // Special stacked layers symbol for background group
        const symbol = this.createBackgroundGroupSymbol();
        row.appendChild(symbol);
      } else {
        const symbol = this.createLayerSymbol(layerId);
        if (symbol) {
          row.appendChild(symbol);
        }
      }
    }

    row.appendChild(name);

    // Opacity slider (conditionally shown)
    if (this.showOpacitySlider) {
      const opacity = document.createElement('input');
      opacity.type = 'range';
      opacity.className = 'layer-control-opacity';
      opacity.min = '0';
      opacity.max = '1';
      opacity.step = '0.01';
      opacity.value = String(state.opacity);
      opacity.title = `Opacity: ${Math.round(state.opacity * 100)}%`;

      // Handle slider interaction tracking
      opacity.addEventListener('mousedown', () => {
        this.state.userInteractingWithSlider = true;
      });
      opacity.addEventListener('mouseup', () => {
        this.state.userInteractingWithSlider = false;
      });

      opacity.addEventListener('input', () => {
        this.changeLayerOpacity(layerId, parseFloat(opacity.value));
        opacity.title = `Opacity: ${Math.round(parseFloat(opacity.value) * 100)}%`;
      });

      row.appendChild(opacity);
    }

    // Style button for regular layers, legend button for Background
    if (this.showStyleEditor) {
      if (layerId === 'Background') {
        const legendButton = this.createBackgroundLegendButton();
        row.appendChild(legendButton);
      } else {
        const styleButton = this.createStyleButton(layerId);
        if (styleButton) {
          row.appendChild(styleButton);
        }
      }
    }

    item.appendChild(row);

    // Add context menu event listener (skip for Background layer)
    if (this.enableContextMenu && layerId !== 'Background') {
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(layerId, e.clientX, e.clientY);
      });
    }

    this.panel.appendChild(item);
  }

  /**
   * Create a symbol element for a layer
   * @param layerId The layer ID
   * @returns The symbol HTML element, or null if layer not found
   */
  private createLayerSymbol(layerId: string): HTMLElement | null {
    // Check if it's a custom layer first
    const layerState = this.state.layerStates[layerId];
    if (layerState?.isCustomLayer) {
      const symbolType = layerState.customLayerType || 'custom-raster';
      // Use a default color for custom layers
      const color = '#4a90d9';
      const svgMarkup = createLayerSymbolSVG(symbolType, color);

      const symbolContainer = document.createElement('span');
      symbolContainer.className = 'layer-control-symbol';
      symbolContainer.innerHTML = svgMarkup;
      symbolContainer.title = `Layer type: ${symbolType}`;

      return symbolContainer;
    }

    // Fall back to MapLibre layer
    const layer = this.map.getLayer(layerId);
    if (!layer) return null;

    const layerType = layer.type;
    const color = getLayerColor(this.map, layerId, layerType);
    const svgMarkup = createLayerSymbolSVG(layerType, color);

    const symbolContainer = document.createElement('span');
    symbolContainer.className = 'layer-control-symbol';
    symbolContainer.innerHTML = svgMarkup;
    symbolContainer.title = `Layer type: ${layerType}`;

    return symbolContainer;
  }

  /**
   * Create a symbol element for a background layer
   * @param layer The layer specification
   * @returns The symbol HTML element
   */
  private createBackgroundLayerSymbol(layer: LayerSpecification): HTMLElement {
    const color = getLayerColorFromSpec(layer);
    const svgMarkup = createLayerSymbolSVG(layer.type, color, { size: 14 });

    const symbolContainer = document.createElement('span');
    symbolContainer.className = 'background-legend-layer-symbol';
    symbolContainer.innerHTML = svgMarkup;
    symbolContainer.title = `Layer type: ${layer.type}`;

    return symbolContainer;
  }

  /**
   * Create a symbol element for the Background layer group
   * Shows a stacked layers icon to represent multiple background layers
   * @returns The symbol HTML element
   */
  private createBackgroundGroupSymbol(): HTMLElement {
    const svgMarkup = createBackgroundGroupSymbolSVG(16);

    const symbolContainer = document.createElement('span');
    symbolContainer.className = 'layer-control-symbol';
    symbolContainer.innerHTML = svgMarkup;
    symbolContainer.title = 'Background layers';

    return symbolContainer;
  }

  /**
   * Toggle layer visibility
   */
  private toggleLayerVisibility(layerId: string, visible: boolean): void {
    // Handle Background layer group
    if (layerId === 'Background') {
      this.toggleBackgroundVisibility(visible);
      return;
    }

    // Set flag to prevent checkForNewLayers from running during visibility change
    this.state.isStyleOperationInProgress = true;

    // Update local state
    if (this.state.layerStates[layerId]) {
      this.state.layerStates[layerId].visible = visible;
    }

    // Try custom layer registry first
    if (this.customLayerRegistry?.setVisibility(layerId, visible)) {
      // Clear flag after a delay for custom layers
      setTimeout(() => {
        this.state.isStyleOperationInProgress = false;
      }, 200);
      return;
    }

    // Fallback to native MapLibre layer
    this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');

    // Clear flag after styledata events have settled
    setTimeout(() => {
      this.state.isStyleOperationInProgress = false;
    }, 200);
  }

  /**
   * Change layer opacity
   */
  private changeLayerOpacity(layerId: string, opacity: number): void {
    // Handle Background layer group
    if (layerId === 'Background') {
      this.changeBackgroundOpacity(opacity);
      return;
    }

    // Set flag to prevent checkForNewLayers from running during opacity change
    this.state.isStyleOperationInProgress = true;

    // Update local state
    if (this.state.layerStates[layerId]) {
      this.state.layerStates[layerId].opacity = opacity;
    }

    // Try custom layer registry first
    if (this.customLayerRegistry?.setOpacity(layerId, opacity)) {
      // Clear flag after a delay for custom layers
      setTimeout(() => {
        this.state.isStyleOperationInProgress = false;
      }, 200);
      return;
    }

    // Fallback to native MapLibre layer
    const layerType = getLayerType(this.map, layerId);
    if (layerType) {
      setLayerOpacity(this.map, layerId, layerType, opacity);
    }

    // Clear flag after styledata events have settled
    setTimeout(() => {
      this.state.isStyleOperationInProgress = false;
    }, 200);
  }

  /**
   * Check if a layer is a user-added layer (vs basemap layer)
   * Used primarily for the background legend to determine which layers are background
   */
  private isUserAddedLayer(layerId: string): boolean {
    // If this layer is in our state (and not Background), it's user-added
    if (this.state.layerStates[layerId] !== undefined && layerId !== 'Background') {
      return true;
    }

    // If we have basemapLayerIds (from basemapStyleUrl), check if the layer is NOT in the basemap
    if (this.basemapLayerIds !== null && this.basemapLayerIds.size > 0) {
      return !this.basemapLayerIds.has(layerId);
    }

    // For layers not in our state, check if the layer was added after control initialization
    // or uses a user-added source
    if (this.initialLayerIds !== null && !this.initialLayerIds.has(layerId)) {
      // Layer was added after control - it's user-added
      return true;
    }

    // Check source-based heuristics
    const layer = this.map.getLayer(layerId);
    if (layer) {
      const sourceId = (layer as any).source;
      if (sourceId) {
        const userAddedSourceIds = this.detectUserAddedSources();
        return userAddedSourceIds.has(sourceId);
      }
    }

    return false;
  }

  /**
   * Toggle visibility for all background layers (basemap layers)
   */
  private toggleBackgroundVisibility(visible: boolean): void {
    // Update local state
    if (this.state.layerStates['Background']) {
      this.state.layerStates['Background'].visible = visible;
    }

    // Apply to all basemap layers (layers not in layerStates)
    const styleLayers = this.map.getStyle().layers || [];
    styleLayers.forEach(layer => {
      if (!this.isUserAddedLayer(layer.id)) {
        // Update visibility cache
        this.state.backgroundLayerVisibility.set(layer.id, visible);
        this.map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
      }
    });

    // Update legend panel checkboxes if open
    if (this.state.backgroundLegendOpen) {
      const legendPanel = this.panel.querySelector('.layer-control-background-legend');
      if (legendPanel) {
        const checkboxes = legendPanel.querySelectorAll('.background-legend-checkbox') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach(checkbox => {
          checkbox.checked = visible;
        });
      }
    }
  }

  /**
   * Change opacity for all background layers (basemap layers)
   */
  private changeBackgroundOpacity(opacity: number): void {
    // Update local state
    if (this.state.layerStates['Background']) {
      this.state.layerStates['Background'].opacity = opacity;
    }

    // Apply to all basemap layers (layers not in layerStates)
    const styleLayers = this.map.getStyle().layers || [];
    styleLayers.forEach(styleLayer => {
      if (!this.isUserAddedLayer(styleLayer.id)) {
        const layerType = getLayerType(this.map, styleLayer.id);
        if (layerType) {
          setLayerOpacity(this.map, styleLayer.id, layerType, opacity);
        }
      }
    });
  }

  // ===== Background Legend Methods =====

  /**
   * Create legend button for Background layer
   */
  private createBackgroundLegendButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'layer-control-style-button layer-control-background-legend-button';
    button.innerHTML = '&#9881;'; // Gear icon (same as style button)
    button.title = 'Show background layer details';
    button.setAttribute('aria-label', 'Show background layer visibility controls');
    button.setAttribute('aria-expanded', String(this.state.backgroundLegendOpen));

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleBackgroundLegend();
    });

    return button;
  }

  /**
   * Toggle background legend panel visibility
   */
  private toggleBackgroundLegend(): void {
    if (this.state.backgroundLegendOpen) {
      this.closeBackgroundLegend();
    } else {
      this.openBackgroundLegend();
    }
  }

  /**
   * Open background legend panel
   */
  private openBackgroundLegend(): void {
    // Close any open style editor first
    if (this.state.activeStyleEditor) {
      this.closeStyleEditor(this.state.activeStyleEditor);
    }

    const itemEl = this.panel.querySelector('[data-layer-id="Background"]');
    if (!itemEl) return;

    // Check if panel already exists
    let legendPanel = itemEl.querySelector('.layer-control-background-legend');
    if (legendPanel) {
      // Refresh the list
      const layerList = legendPanel.querySelector('.background-legend-layer-list');
      if (layerList) {
        this.populateBackgroundLayerList(layerList as HTMLElement);
      }
    } else {
      // Create new panel
      legendPanel = this.createBackgroundLegendPanel();
      itemEl.appendChild(legendPanel);
    }

    this.state.backgroundLegendOpen = true;

    // Update button aria state
    const button = itemEl.querySelector('.layer-control-background-legend-button');
    if (button) {
      button.setAttribute('aria-expanded', 'true');
      button.classList.add('active');
    }

    // Scroll into view
    setTimeout(() => {
      legendPanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  /**
   * Close background legend panel
   */
  private closeBackgroundLegend(): void {
    const itemEl = this.panel.querySelector('[data-layer-id="Background"]');
    if (!itemEl) return;

    const legendPanel = itemEl.querySelector('.layer-control-background-legend');
    if (legendPanel) {
      legendPanel.remove();
    }

    this.state.backgroundLegendOpen = false;

    // Update button aria state
    const button = itemEl.querySelector('.layer-control-background-legend-button');
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      button.classList.remove('active');
    }
  }

  /**
   * Create the background legend panel with individual layer controls
   */
  private createBackgroundLegendPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'layer-control-background-legend';

    // Header
    const header = document.createElement('div');
    header.className = 'background-legend-header';

    const title = document.createElement('span');
    title.className = 'background-legend-title';
    title.textContent = 'Background Layers';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'background-legend-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeBackgroundLegend();
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Quick actions row
    const actionsRow = document.createElement('div');
    actionsRow.className = 'background-legend-actions';

    const showAllBtn = document.createElement('button');
    showAllBtn.className = 'background-legend-action-btn';
    showAllBtn.textContent = 'Show All';
    showAllBtn.addEventListener('click', () => this.setAllBackgroundLayersVisibility(true));

    const hideAllBtn = document.createElement('button');
    hideAllBtn.className = 'background-legend-action-btn';
    hideAllBtn.textContent = 'Hide All';
    hideAllBtn.addEventListener('click', () => this.setAllBackgroundLayersVisibility(false));

    actionsRow.appendChild(showAllBtn);
    actionsRow.appendChild(hideAllBtn);

    // Filter row - "Only rendered" checkbox
    const filterRow = document.createElement('div');
    filterRow.className = 'background-legend-filter';

    const filterCheckbox = document.createElement('input');
    filterCheckbox.type = 'checkbox';
    filterCheckbox.className = 'background-legend-filter-checkbox';
    filterCheckbox.id = 'background-legend-only-rendered';
    filterCheckbox.checked = this.state.onlyRenderedFilter;
    filterCheckbox.addEventListener('change', () => {
      this.state.onlyRenderedFilter = filterCheckbox.checked;
      const layerList = panel.querySelector('.background-legend-layer-list');
      if (layerList) {
        this.populateBackgroundLayerList(layerList as HTMLElement);
      }
    });

    const filterLabel = document.createElement('label');
    filterLabel.className = 'background-legend-filter-label';
    filterLabel.htmlFor = 'background-legend-only-rendered';
    filterLabel.textContent = 'Only rendered';

    filterRow.appendChild(filterCheckbox);
    filterRow.appendChild(filterLabel);

    // Layer list container (scrollable)
    const layerList = document.createElement('div');
    layerList.className = 'background-legend-layer-list';

    // Populate with background layers
    this.populateBackgroundLayerList(layerList);

    panel.appendChild(header);
    panel.appendChild(actionsRow);
    panel.appendChild(filterRow);
    panel.appendChild(layerList);

    return panel;
  }

  /**
   * Check if a layer is currently rendered in the map viewport
   */
  private isLayerRendered(layerId: string): boolean {
    try {
      const layer = this.map.getLayer(layerId);
      if (!layer) return false;

      // Check if layer is visible first
      const visibility = this.map.getLayoutProperty(layerId, 'visibility');
      if (visibility === 'none') return false;

      // For raster layers, check if tiles are loaded
      if (layer.type === 'raster' || layer.type === 'hillshade') {
        // Raster layers are considered rendered if visible
        return true;
      }

      // For background layers (solid color), they're always rendered if visible
      if (layer.type === 'background') {
        return true;
      }

      // For vector layers, use queryRenderedFeatures to check if any features are visible
      const features = this.map.queryRenderedFeatures({ layers: [layerId] });
      return features.length > 0;
    } catch (error) {
      // If query fails, assume layer is rendered if we can see it
      return true;
    }
  }

  /**
   * Populate the background layer list with individual layers
   */
  private populateBackgroundLayerList(container: HTMLElement): void {
    container.innerHTML = ''; // Clear existing

    const styleLayers = this.map.getStyle().layers || [];

    styleLayers.forEach(layer => {
      if (!this.isUserAddedLayer(layer.id)) {
        // Skip drawn layers if excludeDrawnLayers is enabled
        if (this.excludeDrawnLayers && this.isDrawnLayer(layer.id)) {
          return;
        }

        // Skip layers matching user-defined exclusion patterns
        if (this.isExcludedByPattern(layer.id)) {
          return;
        }

        // If "Only rendered" filter is enabled, skip layers that aren't rendered
        if (this.state.onlyRenderedFilter && !this.isLayerRendered(layer.id)) {
          return;
        }

        // This is a background layer
        const layerRow = document.createElement('div');
        layerRow.className = 'background-legend-layer-row';
        layerRow.setAttribute('data-background-layer-id', layer.id);

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'background-legend-checkbox';

        // Get visibility from map or cache
        const visibility = this.map.getLayoutProperty(layer.id, 'visibility');
        const isVisible = visibility !== 'none';
        checkbox.checked = isVisible;

        // Update cache
        this.state.backgroundLayerVisibility.set(layer.id, isVisible);

        checkbox.addEventListener('change', () => {
          this.toggleIndividualBackgroundLayer(layer.id, checkbox.checked);
        });

        // Layer name
        const name = document.createElement('span');
        name.className = 'background-legend-layer-name';
        name.textContent = this.generateFriendlyName(layer.id);
        name.title = layer.id; // Show full ID on hover

        // Layer type indicator
        const typeIndicator = document.createElement('span');
        typeIndicator.className = 'background-legend-layer-type';
        typeIndicator.textContent = layer.type;

        layerRow.appendChild(checkbox);

        // Add layer symbol (if enabled)
        if (this.showLayerSymbol) {
          const symbol = this.createBackgroundLayerSymbol(layer);
          if (symbol) {
            layerRow.appendChild(symbol);
          }
        }

        layerRow.appendChild(name);
        layerRow.appendChild(typeIndicator);
        container.appendChild(layerRow);
      }
    });

    // Show message if no background layers
    if (container.children.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'background-legend-empty';
      emptyMsg.textContent = this.state.onlyRenderedFilter
        ? 'No rendered layers in current view.'
        : 'No background layers found.';
      container.appendChild(emptyMsg);
    }
  }

  /**
   * Toggle visibility of an individual background layer
   */
  private toggleIndividualBackgroundLayer(layerId: string, visible: boolean): void {
    // Update visibility cache
    this.state.backgroundLayerVisibility.set(layerId, visible);

    // Apply to map
    this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');

    // Update the main Background checkbox state
    this.updateBackgroundCheckboxState();
  }

  /**
   * Set visibility for all background layers
   */
  private setAllBackgroundLayersVisibility(visible: boolean): void {
    const styleLayers = this.map.getStyle().layers || [];

    styleLayers.forEach(layer => {
      if (!this.isUserAddedLayer(layer.id)) {
        this.state.backgroundLayerVisibility.set(layer.id, visible);
        this.map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
      }
    });

    // Update checkboxes in the legend panel
    const legendPanel = this.panel.querySelector('.layer-control-background-legend');
    if (legendPanel) {
      const checkboxes = legendPanel.querySelectorAll('.background-legend-checkbox') as NodeListOf<HTMLInputElement>;
      checkboxes.forEach(checkbox => {
        checkbox.checked = visible;
      });
    }

    // Update main Background checkbox
    this.updateBackgroundCheckboxState();
  }

  /**
   * Update the main Background checkbox based on individual layer states
   */
  private updateBackgroundCheckboxState(): void {
    const styleLayers = this.map.getStyle().layers || [];
    let anyVisible = false;
    let allVisible = true;

    styleLayers.forEach(layer => {
      if (!this.isUserAddedLayer(layer.id)) {
        const visible = this.state.backgroundLayerVisibility.get(layer.id);
        if (visible === true) anyVisible = true;
        if (visible === false) allVisible = false;
      }
    });

    // Update main checkbox
    const backgroundItem = this.panel.querySelector('[data-layer-id="Background"]');
    if (backgroundItem) {
      const checkbox = backgroundItem.querySelector('.layer-control-checkbox') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = anyVisible;
        checkbox.indeterminate = anyVisible && !allVisible;
      }
    }

    // Update layerState
    if (this.state.layerStates['Background']) {
      this.state.layerStates['Background'].visible = anyVisible;
    }
  }

  /**
   * Create style button for a layer
   */
  private createStyleButton(layerId: string): HTMLButtonElement | null {
    // Don't create button for Background layer
    if (layerId === 'Background') {
      return null;
    }

    const layerState = this.state.layerStates[layerId];
    const isCustomLayer = layerState?.isCustomLayer === true;

    const button = document.createElement('button');
    button.className = 'layer-control-style-button';
    button.innerHTML = '&#9881;'; // Gear icon

    if (isCustomLayer) {
      // Custom layers don't support style editing - show info panel instead
      button.title = 'Layer info (style editing not available)';
      button.setAttribute('aria-label', `Layer info for ${layerId}`);
    } else {
      button.title = 'Edit layer style';
      button.setAttribute('aria-label', `Edit style for ${layerId}`);
    }

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleStyleEditor(layerId);
    });

    return button;
  }

  /**
   * Toggle style editor for a layer
   */
  private toggleStyleEditor(layerId: string): void {
    // If this editor is already open, close it
    if (this.state.activeStyleEditor === layerId) {
      this.closeStyleEditor(layerId);
      return;
    }

    // Close any other open editor
    if (this.state.activeStyleEditor) {
      this.closeStyleEditor(this.state.activeStyleEditor);
    }

    // Open this editor
    this.openStyleEditor(layerId);
  }

  /**
   * Open style editor for a layer
   */
  private openStyleEditor(layerId: string): void {
    const itemEl = this.panel.querySelector(`[data-layer-id="${layerId}"]`);
    if (!itemEl) return;

    // Check if this is a custom layer
    const layerState = this.state.layerStates[layerId];
    if (layerState?.isCustomLayer) {
      // Check if the adapter provides native MapLibre layer IDs for style editing
      const nativeLayerIds = this.customLayerRegistry?.getNativeLayerIds(layerId);
      if (nativeLayerIds && nativeLayerIds.length > 0) {
        // Cache original styles for all native sublayers
        for (const nativeId of nativeLayerIds) {
          if (!this.state.originalStyles.has(nativeId)) {
            const nativeLayer = this.map.getLayer(nativeId);
            if (nativeLayer) {
              cacheOriginalLayerStyle(this.map, nativeId, this.state.originalStyles);
            }
          }
        }

        // Create combined style editor for native sublayers
        const editor = this.createNativeSubLayerStyleEditor(layerId, nativeLayerIds);
        if (editor) {
          itemEl.appendChild(editor);
          this.styleEditors.set(layerId, editor);
          this.state.activeStyleEditor = layerId;

          setTimeout(() => {
            editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 50);
          return;
        }
      }

      // Fallback: show info message for custom layers without native sublayers
      const editor = this.createCustomLayerInfoPanel(layerId);
      itemEl.appendChild(editor);
      this.styleEditors.set(layerId, editor);
      this.state.activeStyleEditor = layerId;

      // Scroll into view
      setTimeout(() => {
        editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
      return;
    }

    // Cache original style if not already cached
    if (!this.state.originalStyles.has(layerId)) {
      const layer = this.map.getLayer(layerId);
      if (layer) {
        cacheOriginalLayerStyle(this.map, layerId, this.state.originalStyles);
      }
    }

    // Create style editor UI
    const editor = this.createStyleEditor(layerId);
    if (!editor) return;

    itemEl.appendChild(editor);
    this.styleEditors.set(layerId, editor);
    this.state.activeStyleEditor = layerId;

    // Scroll editor into view
    setTimeout(() => {
      editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  /**
   * Create info panel for custom layers (style editing not supported)
   */
  private createCustomLayerInfoPanel(layerId: string): HTMLDivElement {
    const editor = document.createElement('div');
    editor.className = 'layer-control-style-editor layer-control-custom-info';

    // Header
    const header = document.createElement('div');
    header.className = 'style-editor-header';

    const title = document.createElement('span');
    title.className = 'style-editor-title';
    title.textContent = 'Layer Info';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'style-editor-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeStyleEditor(layerId);
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Info content
    const content = document.createElement('div');
    content.className = 'style-editor-controls';

    const infoText = document.createElement('p');
    infoText.className = 'layer-control-custom-info-text';
    infoText.textContent = `This is a custom layer. Style editing is not available for this layer type. Use the visibility toggle and opacity slider to control the layer.`;

    content.appendChild(infoText);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'style-editor-actions';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'style-editor-button style-editor-button-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.title = 'Remove layer from map';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Are you sure you want to remove this layer?')) {
        this.closeStyleEditor(layerId);
        this.removeLayer(layerId);
      }
    });

    const closeActionBtn = document.createElement('button');
    closeActionBtn.className = 'style-editor-button style-editor-button-close';
    closeActionBtn.textContent = 'Close';
    closeActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeStyleEditor(layerId);
    });

    actions.appendChild(removeBtn);
    actions.appendChild(closeActionBtn);

    editor.appendChild(header);
    editor.appendChild(content);
    editor.appendChild(actions);

    return editor;
  }

  /**
   * Create a combined style editor for custom layers with native MapLibre sublayers.
   * Groups controls by sublayer type (fill, line, circle, etc.).
   */
  private createNativeSubLayerStyleEditor(
    layerId: string,
    nativeLayerIds: string[]
  ): HTMLDivElement | null {
    // Group native layers by type
    const layersByType = new Map<string, string[]>();
    for (const nativeId of nativeLayerIds) {
      const layer = this.map.getLayer(nativeId);
      if (layer) {
        const type = layer.type;
        if (!layersByType.has(type)) {
          layersByType.set(type, []);
        }
        layersByType.get(type)!.push(nativeId);
      }
    }

    if (layersByType.size === 0) return null;

    const editor = document.createElement('div');
    editor.className = 'layer-control-style-editor';

    // Header
    const header = document.createElement('div');
    header.className = 'style-editor-header';

    const title = document.createElement('span');
    title.className = 'style-editor-title';
    title.textContent = 'Edit Style';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'style-editor-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeStyleEditor(layerId);
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    editor.appendChild(header);

    // Controls container
    const controls = document.createElement('div');
    controls.className = 'style-editor-controls';

    // Type display names
    const typeLabels: Record<string, string> = {
      fill: 'Fill',
      line: 'Line',
      circle: 'Circle',
      symbol: 'Symbol',
      raster: 'Raster',
    };

    // Add controls for each layer type, using the first native layer of that type
    for (const [type, ids] of layersByType) {
      // Add section header if there are multiple types
      if (layersByType.size > 1) {
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'style-editor-section-header';
        sectionHeader.textContent = typeLabels[type] || type;
        controls.appendChild(sectionHeader);
      }

      // Use the first layer of this type for controls
      // Changes will be applied to all layers of the same type
      const primaryId = ids[0];
      this.addStyleControlsForNativeGroup(controls, ids, primaryId, type);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'style-editor-actions';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'style-editor-button style-editor-button-reset';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Reset all native sublayers
      for (const nativeId of nativeLayerIds) {
        restoreOriginalStyle(this.map, nativeId, this.state.originalStyles);
      }
      // Refresh the editor
      this.closeStyleEditor(layerId);
      this.openStyleEditor(layerId);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'style-editor-button style-editor-button-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.title = 'Remove layer from map';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Are you sure you want to remove this layer?')) {
        this.closeStyleEditor(layerId);
        this.removeLayer(layerId);
      }
    });

    const closeActionBtn = document.createElement('button');
    closeActionBtn.className = 'style-editor-button style-editor-button-close';
    closeActionBtn.textContent = 'Close';
    closeActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeStyleEditor(layerId);
    });

    actions.appendChild(resetBtn);
    actions.appendChild(removeBtn);
    actions.appendChild(closeActionBtn);

    editor.appendChild(controls);
    editor.appendChild(actions);

    return editor;
  }

  /**
   * Add style controls for a group of native layers of the same type.
   * Changes to any control are applied to all layers in the group.
   */
  private addStyleControlsForNativeGroup(
    container: HTMLElement,
    layerIds: string[],
    primaryLayerId: string,
    layerType: string
  ): void {
    // Register the group mapping so createColorControl/createSliderControl
    // will apply changes to all layers in the group
    this.nativeLayerGroups.set(primaryLayerId, layerIds);

    this.addStyleControlsForLayerType(container, primaryLayerId, layerType);
  }

  /**
   * Close style editor for a layer
   */
  private closeStyleEditor(layerId: string): void {
    const editor = this.styleEditors.get(layerId);
    if (editor) {
      editor.remove();
      this.styleEditors.delete(layerId);
    }

    // Clean up any native layer group mappings
    this.nativeLayerGroups.clear();

    if (this.state.activeStyleEditor === layerId) {
      this.state.activeStyleEditor = null;
    }
  }

  /**
   * Create style editor UI
   */
  private createStyleEditor(layerId: string): HTMLDivElement | null {
    const layer = this.map.getLayer(layerId);
    if (!layer) return null;

    const editor = document.createElement('div');
    editor.className = 'layer-control-style-editor';

    // Header
    const header = document.createElement('div');
    header.className = 'style-editor-header';

    const title = document.createElement('span');
    title.className = 'style-editor-title';
    title.textContent = 'Edit Style';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'style-editor-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeStyleEditor(layerId);
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Controls container - populate based on layer type
    const controls = document.createElement('div');
    controls.className = 'style-editor-controls';

    const layerType = layer.type;
    this.addStyleControlsForLayerType(controls, layerId, layerType);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'style-editor-actions';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'style-editor-button style-editor-button-reset';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetLayerStyle(layerId);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'style-editor-button style-editor-button-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.title = 'Remove layer from map';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Are you sure you want to remove this layer?')) {
        this.closeStyleEditor(layerId);
        this.removeLayer(layerId);
      }
    });

    const closeActionBtn = document.createElement('button');
    closeActionBtn.className = 'style-editor-button style-editor-button-close';
    closeActionBtn.textContent = 'Close';
    closeActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeStyleEditor(layerId);
    });

    actions.appendChild(resetBtn);
    actions.appendChild(removeBtn);
    actions.appendChild(closeActionBtn);

    editor.appendChild(header);
    editor.appendChild(controls);
    editor.appendChild(actions);

    return editor;
  }

  /**
   * Add style controls based on layer type
   */
  private addStyleControlsForLayerType(container: HTMLElement, layerId: string, layerType: string): void {
    switch (layerType) {
      case 'fill':
        this.addFillControls(container, layerId);
        break;
      case 'line':
        this.addLineControls(container, layerId);
        break;
      case 'circle':
        this.addCircleControls(container, layerId);
        break;
      case 'raster':
        this.addRasterControls(container, layerId);
        break;
      case 'symbol':
        this.addSymbolControls(container, layerId);
        break;
      default:
        container.textContent = `Style controls for ${layerType} layers not yet implemented.`;
    }
  }

  /**
   * Add controls for fill layers
   */
  private addFillControls(container: HTMLElement, layerId: string): void {
    // Fill Color - try layer definition first, then runtime property
    const style = this.map.getStyle();
    const layer = style.layers?.find(l => l.id === layerId);
    let fillColor: any = undefined;

    // First try to get from layer definition
    if (layer && 'paint' in layer && layer.paint && 'fill-color' in layer.paint) {
      fillColor = layer.paint['fill-color'];
    }

    // Fallback to runtime property if not in definition
    if (!fillColor) {
      fillColor = this.map.getPaintProperty(layerId, 'fill-color');
    }

    this.createColorControl(container, layerId, 'fill-color', 'Fill Color', normalizeColor(fillColor || '#088'));

    // Fill Opacity
    const fillOpacity = this.map.getPaintProperty(layerId, 'fill-opacity');
    if (fillOpacity !== undefined && typeof fillOpacity === 'number') {
      this.createSliderControl(container, layerId, 'fill-opacity', 'Fill Opacity', fillOpacity, 0, 1, 0.05);
    }

    // Fill Outline Color
    const outlineColor = this.map.getPaintProperty(layerId, 'fill-outline-color');
    if (outlineColor !== undefined) {
      this.createColorControl(container, layerId, 'fill-outline-color', 'Outline Color', normalizeColor(outlineColor));
    }
  }

  /**
   * Add controls for line layers
   */
  private addLineControls(container: HTMLElement, layerId: string): void {
    // Line Color - try layer definition first, then runtime property
    const style = this.map.getStyle();
    const layer = style.layers?.find(l => l.id === layerId);
    let lineColor: any = undefined;

    // First try to get from layer definition
    if (layer && 'paint' in layer && layer.paint && 'line-color' in layer.paint) {
      lineColor = layer.paint['line-color'];
    }

    // Fallback to runtime property if not in definition
    if (!lineColor) {
      lineColor = this.map.getPaintProperty(layerId, 'line-color');
    }

    this.createColorControl(container, layerId, 'line-color', 'Line Color', normalizeColor(lineColor || '#000'));

    // Line Width
    const lineWidth = this.map.getPaintProperty(layerId, 'line-width');
    this.createSliderControl(container, layerId, 'line-width', 'Line Width', typeof lineWidth === 'number' ? lineWidth : 1, 0, 20, 0.5);

    // Line Opacity
    const lineOpacity = this.map.getPaintProperty(layerId, 'line-opacity');
    if (lineOpacity !== undefined && typeof lineOpacity === 'number') {
      this.createSliderControl(container, layerId, 'line-opacity', 'Line Opacity', lineOpacity, 0, 1, 0.05);
    }

    // Line Blur
    const lineBlur = this.map.getPaintProperty(layerId, 'line-blur');
    if (lineBlur !== undefined && typeof lineBlur === 'number') {
      this.createSliderControl(container, layerId, 'line-blur', 'Line Blur', lineBlur, 0, 5, 0.1);
    }
  }

  /**
   * Add controls for circle layers
   */
  private addCircleControls(container: HTMLElement, layerId: string): void {
    // Circle Color - try layer definition first, then runtime property
    const style = this.map.getStyle();
    const layer = style.layers?.find(l => l.id === layerId);
    let circleColor: any = undefined;

    // First try to get from layer definition
    if (layer && 'paint' in layer && layer.paint && 'circle-color' in layer.paint) {
      circleColor = layer.paint['circle-color'];
    }

    // Fallback to runtime property if not in definition
    if (!circleColor) {
      circleColor = this.map.getPaintProperty(layerId, 'circle-color');
    }

    this.createColorControl(container, layerId, 'circle-color', 'Circle Color', normalizeColor(circleColor || '#000'));

    // Circle Radius
    const circleRadius = this.map.getPaintProperty(layerId, 'circle-radius');
    this.createSliderControl(container, layerId, 'circle-radius', 'Radius', typeof circleRadius === 'number' ? circleRadius : 5, 0, 40, 0.5);

    // Circle Opacity
    const circleOpacity = this.map.getPaintProperty(layerId, 'circle-opacity');
    if (circleOpacity !== undefined && typeof circleOpacity === 'number') {
      this.createSliderControl(container, layerId, 'circle-opacity', 'Opacity', circleOpacity, 0, 1, 0.05);
    }

    // Circle Stroke Color
    const strokeColor = this.map.getPaintProperty(layerId, 'circle-stroke-color');
    if (strokeColor !== undefined) {
      this.createColorControl(container, layerId, 'circle-stroke-color', 'Stroke Color', normalizeColor(strokeColor));
    }

    // Circle Stroke Width
    const strokeWidth = this.map.getPaintProperty(layerId, 'circle-stroke-width');
    if (strokeWidth !== undefined && typeof strokeWidth === 'number') {
      this.createSliderControl(container, layerId, 'circle-stroke-width', 'Stroke Width', strokeWidth, 0, 10, 0.1);
    }
  }

  /**
   * Add controls for raster layers
   */
  private addRasterControls(container: HTMLElement, layerId: string): void {
    // Raster Opacity
    const rasterOpacity = this.map.getPaintProperty(layerId, 'raster-opacity');
    this.createSliderControl(container, layerId, 'raster-opacity', 'Opacity', typeof rasterOpacity === 'number' ? rasterOpacity : 1, 0, 1, 0.05);

    // Raster Brightness Min
    const brightnessMin = this.map.getPaintProperty(layerId, 'raster-brightness-min');
    this.createSliderControl(container, layerId, 'raster-brightness-min', 'Brightness Min', typeof brightnessMin === 'number' ? brightnessMin : 0, -1, 1, 0.05);

    // Raster Brightness Max
    const brightnessMax = this.map.getPaintProperty(layerId, 'raster-brightness-max');
    this.createSliderControl(container, layerId, 'raster-brightness-max', 'Brightness Max', typeof brightnessMax === 'number' ? brightnessMax : 1, -1, 1, 0.05);

    // Raster Saturation
    const saturation = this.map.getPaintProperty(layerId, 'raster-saturation');
    this.createSliderControl(container, layerId, 'raster-saturation', 'Saturation', typeof saturation === 'number' ? saturation : 0, -1, 1, 0.05);

    // Raster Contrast
    const contrast = this.map.getPaintProperty(layerId, 'raster-contrast');
    this.createSliderControl(container, layerId, 'raster-contrast', 'Contrast', typeof contrast === 'number' ? contrast : 0, -1, 1, 0.05);

    // Raster Hue Rotate
    const hueRotate = this.map.getPaintProperty(layerId, 'raster-hue-rotate');
    this.createSliderControl(container, layerId, 'raster-hue-rotate', 'Hue Rotate', typeof hueRotate === 'number' ? hueRotate : 0, 0, 350, 5);
  }

  /**
   * Add controls for symbol layers
   */
  private addSymbolControls(container: HTMLElement, layerId: string): void {
    // Text Color
    const textColor = this.map.getPaintProperty(layerId, 'text-color');
    if (textColor !== undefined) {
      this.createColorControl(container, layerId, 'text-color', 'Text Color', normalizeColor(textColor));
    }

    // Text Opacity
    const textOpacity = this.map.getPaintProperty(layerId, 'text-opacity');
    if (textOpacity !== undefined && typeof textOpacity === 'number') {
      this.createSliderControl(container, layerId, 'text-opacity', 'Text Opacity', textOpacity, 0, 1, 0.05);
    }

    // Icon Opacity
    const iconOpacity = this.map.getPaintProperty(layerId, 'icon-opacity');
    if (iconOpacity !== undefined && typeof iconOpacity === 'number') {
      this.createSliderControl(container, layerId, 'icon-opacity', 'Icon Opacity', iconOpacity, 0, 1, 0.05);
    }
  }

  /**
   * Create a color control
   */
  private createColorControl(
    container: HTMLElement,
    layerId: string,
    property: string,
    label: string,
    initialValue: string
  ): void {
    const controlGroup = document.createElement('div');
    controlGroup.className = 'style-control-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'style-control-label';
    labelEl.textContent = label;

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'style-control-color-group';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'style-control-color-picker';
    colorInput.value = initialValue;
    colorInput.dataset.property = property;

    const hexDisplay = document.createElement('input');
    hexDisplay.type = 'text';
    hexDisplay.className = 'style-control-color-value';
    hexDisplay.value = initialValue;
    hexDisplay.readOnly = true;

    colorInput.addEventListener('input', () => {
      const color = colorInput.value;
      hexDisplay.value = color;
      const targetIds = this.nativeLayerGroups.get(layerId) || [layerId];
      for (const id of targetIds) {
        this.map.setPaintProperty(id, property, color);
      }
    });

    inputWrapper.appendChild(colorInput);
    inputWrapper.appendChild(hexDisplay);

    controlGroup.appendChild(labelEl);
    controlGroup.appendChild(inputWrapper);

    container.appendChild(controlGroup);
  }

  /**
   * Create a slider control
   */
  private createSliderControl(
    container: HTMLElement,
    layerId: string,
    property: string,
    label: string,
    initialValue: number,
    min: number,
    max: number,
    step: number
  ): void {
    const controlGroup = document.createElement('div');
    controlGroup.className = 'style-control-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'style-control-label';
    labelEl.textContent = label;

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'style-control-input-wrapper';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'style-control-slider';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initialValue);
    slider.dataset.property = property;

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'style-control-value';
    valueDisplay.textContent = formatNumericValue(initialValue, step);

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      valueDisplay.textContent = formatNumericValue(value, step);
      const targetIds = this.nativeLayerGroups.get(layerId) || [layerId];
      for (const id of targetIds) {
        this.map.setPaintProperty(id, property, value);
      }
    });

    inputWrapper.appendChild(slider);
    inputWrapper.appendChild(valueDisplay);

    controlGroup.appendChild(labelEl);
    controlGroup.appendChild(inputWrapper);

    container.appendChild(controlGroup);
  }

  /**
   * Reset layer style to original
   */
  private resetLayerStyle(layerId: string): void {
    const originalStyle = this.state.originalStyles.get(layerId);
    if (!originalStyle) return;

    // Restore original paint properties
    restoreOriginalStyle(this.map, layerId, this.state.originalStyles);

    // Update UI controls to reflect the reset values
    const editor = this.styleEditors.get(layerId);
    if (editor) {
      // Update all slider controls
      const sliders = editor.querySelectorAll('.style-control-slider') as NodeListOf<HTMLInputElement>;
      sliders.forEach(slider => {
        const property = slider.dataset.property;
        if (property) {
          const value = this.map.getPaintProperty(layerId, property);
          if (value !== undefined && typeof value === 'number') {
            slider.value = String(value);
            // Update value display
            const valueDisplay = slider.parentElement?.querySelector('.style-control-value');
            if (valueDisplay) {
              const step = parseFloat(slider.step);
              valueDisplay.textContent = formatNumericValue(value, step);
            }
          }
        }
      });

      // Update all color controls
      const colorPickers = editor.querySelectorAll('.style-control-color-picker') as NodeListOf<HTMLInputElement>;
      colorPickers.forEach(picker => {
        const property = picker.dataset.property;
        if (property) {
          const value = this.map.getPaintProperty(layerId, property);
          if (value !== undefined) {
            const hexColor = normalizeColor(value);
            picker.value = hexColor;
            // Update hex display
            const hexDisplay = picker.parentElement?.querySelector('.style-control-color-value');
            if (hexDisplay) {
              hexDisplay.textContent = hexColor;
            }
          }
        }
      });
    }
  }

  /**
   * Update layer states from map (sync UI with map)
   */
  private updateLayerStatesFromMap(): void {
    if (this.state.userInteractingWithSlider) {
      return; // Don't update while user is dragging
    }

    Object.keys(this.state.layerStates).forEach(layerId => {
      try {
        // Skip custom layers - they manage their own state via adapters
        if (this.state.layerStates[layerId]?.isCustomLayer) {
          return;
        }

        // Skip Background layer group
        if (layerId === 'Background') {
          return;
        }

        const layer = this.map.getLayer(layerId);
        if (!layer) return;

        // Check visibility
        const visibility = this.map.getLayoutProperty(layerId, 'visibility');
        const isVisible = visibility !== 'none';

        // Get opacity
        const layerType = layer.type;
        const opacity = getLayerOpacity(this.map, layerId, layerType);

        // Update local state
        if (this.state.layerStates[layerId]) {
          this.state.layerStates[layerId].visible = isVisible;
          this.state.layerStates[layerId].opacity = opacity;
        }

        // Update UI
        this.updateUIForLayer(layerId, isVisible, opacity);
      } catch (error) {
        console.warn(`Failed to update state for layer ${layerId}:`, error);
      }
    });
  }

  /**
   * Update UI elements for a specific layer
   */
  private updateUIForLayer(layerId: string, visible: boolean, opacity: number): void {
    const layerItems = this.panel.querySelectorAll('.layer-control-item');

    layerItems.forEach(item => {
      if ((item as HTMLElement).dataset.layerId === layerId) {
        const checkbox = item.querySelector('.layer-control-checkbox') as HTMLInputElement;
        const opacitySlider = item.querySelector('.layer-control-opacity') as HTMLInputElement;

        if (checkbox) {
          checkbox.checked = visible;
        }

        if (opacitySlider) {
          opacitySlider.value = String(opacity);
          opacitySlider.title = `Opacity: ${Math.round(opacity * 100)}%`;
        }
      }
    });
  }

  /**
   * Check for new layers and add them to the control, remove deleted layers
   */
  private checkForNewLayers(): void {
    // Skip checking for new layers during style operations to prevent race conditions
    // that could incorrectly delete custom layers
    if (this.state.isStyleOperationInProgress) {
      return;
    }

    try {
      const style = this.map.getStyle();
      if (!style || !style.layers) {
        return;
      }

      const currentMapLayerIds = new Set(style.layers.map(layer => layer.id));

      // Check if we're in auto-detect mode (no specific layers were specified)
      const isAutoDetectMode = this.targetLayers.length === 0 ||
        (this.targetLayers.length === 1 && this.targetLayers[0] === 'Background') ||
        this.targetLayers.every(id => id === 'Background' || this.state.layerStates[id]);

      // Find new layers that aren't in our state yet
      const newLayers: string[] = [];

      // Detection priority for NEW layers (added after control):
      // 1. basemapLayerIds (from basemapStyleUrl) - most reliable
      // 2. initialLayerIds - layer NOT in initialLayerIds means it was added after control
      // 3. Source-based heuristics - fallback
      const useBasemapStyleDetection = this.basemapLayerIds !== null && this.basemapLayerIds.size > 0;
      const useInitialLayerDetection = !useBasemapStyleDetection && this.initialLayerIds !== null && this.initialLayerIds.size > 0;

      currentMapLayerIds.forEach(layerId => {
        if (layerId !== 'Background' && !this.state.layerStates[layerId]) {
          const layer = this.map.getLayer(layerId);
          if (layer) {
            // Always skip layers that were present when control was initialized
            // These are background/basemap layers and should stay grouped under "Background"
            if (this.initialLayerIds !== null && this.initialLayerIds.has(layerId)) {
              // Layer was in initial set - it's a background layer, skip it
              return;
            }

            // In auto-detect mode, apply additional filtering
            if (isAutoDetectMode) {
              // Skip drawn layers if excludeDrawnLayers is enabled
              if (this.excludeDrawnLayers && this.isDrawnLayer(layerId)) {
                return;
              }

              // Skip layers matching user-defined exclusion patterns
              if (this.isExcludedByPattern(layerId)) {
                return;
              }

              // Skip layers that are not user-added (i.e., background/basemap layers)
              if (!this.isUserAddedLayer(layerId)) {
                return;
              }

              if (useBasemapStyleDetection) {
                // Use basemap style layer IDs - if layer is in basemap, skip it
                if (this.basemapLayerIds!.has(layerId)) {
                  return;
                }
              } else if (useInitialLayerDetection) {
                // Layer NOT in initialLayerIds means it was added AFTER control
                // These are definitely user-added layers and should be included
                if (this.initialLayerIds!.has(layerId)) {
                  // Layer was in initial set - check source-based heuristics
                  const userAddedSourceIds = this.detectUserAddedSources();
                  const sourceId = (layer as any).source;
                  if (!sourceId || !userAddedSourceIds.has(sourceId)) {
                    return;
                  }
                }
                // Layer NOT in initialLayerIds - it's new, include it
              } else {
                // Fall back to source-based heuristics
                const userAddedSourceIds = this.detectUserAddedSources();
                const sourceId = (layer as any).source;
                if (!sourceId || !userAddedSourceIds.has(sourceId)) {
                  return;
                }
              }
            }
            newLayers.push(layerId);
          }
        }
      });

      // Find removed layers that are still in our state
      // Skip custom layers - they have their own removal mechanism via the adapter
      const removedLayers: string[] = [];
      Object.keys(this.state.layerStates).forEach(layerId => {
        const state = this.state.layerStates[layerId];
        // Skip Background, custom layers, and layers still in the map
        if (layerId !== 'Background' && !state.isCustomLayer && !currentMapLayerIds.has(layerId)) {
          removedLayers.push(layerId);
        }
      });

      // Remove deleted layers from UI and state
      if (removedLayers.length > 0) {
        removedLayers.forEach(layerId => {
          // Remove from state
          delete this.state.layerStates[layerId];

          // Remove from UI
          const itemEl = this.panel.querySelector(`[data-layer-id="${layerId}"]`);
          if (itemEl) {
            itemEl.remove();
          }

          // Clean up style editor if open
          if (this.state.activeStyleEditor === layerId) {
            this.state.activeStyleEditor = null;
          }
          this.styleEditors.delete(layerId);
        });
      }

      // Add UI for new layers
      if (newLayers.length > 0) {
        newLayers.forEach(layerId => {
          const layer = this.map.getLayer(layerId);
          if (!layer) return;

          // Get layer type and opacity
          const layerType = layer.type;
          const opacity = getLayerOpacity(this.map, layerId, layerType);
          const visibility = this.map.getLayoutProperty(layerId, 'visibility');
          const isVisible = visibility !== 'none';

          // Add to state
          this.state.layerStates[layerId] = {
            visible: isVisible,
            opacity: opacity,
            name: this.generateFriendlyName(layerId),
          };

          // Add to UI
          this.addLayerItem(layerId, this.state.layerStates[layerId]);
        });
      }

      // Check for new/removed custom layers
      if (this.customLayerRegistry) {
        const customLayerIds = this.customLayerRegistry.getAllLayerIds();

        // Find new custom layers (skip ones explicitly removed by the user)
        customLayerIds.forEach(layerId => {
          if (!this.state.layerStates[layerId] && !this.removedCustomLayerIds.has(layerId)) {
            const customState = this.customLayerRegistry!.getLayerState(layerId);
            if (customState) {
              this.state.layerStates[layerId] = {
                visible: customState.visible,
                opacity: customState.opacity,
                name: customState.name,
                isCustomLayer: true,
                customLayerType: this.customLayerRegistry!.getSymbolType(layerId) || undefined,
              };
              this.addLayerItem(layerId, this.state.layerStates[layerId]);
            }
          }
        });

        // Find removed custom layers
        Object.keys(this.state.layerStates).forEach(layerId => {
          const state = this.state.layerStates[layerId];
          if (state.isCustomLayer && !customLayerIds.includes(layerId)) {
            // Remove from state
            delete this.state.layerStates[layerId];

            // Remove from UI
            const itemEl = this.panel.querySelector(`[data-layer-id="${layerId}"]`);
            if (itemEl) {
              itemEl.remove();
            }

            // Clean up style editor if open
            if (this.state.activeStyleEditor === layerId) {
              this.state.activeStyleEditor = null;
            }
            this.styleEditors.delete(layerId);
          }
        });
      }
    } catch (error) {
      console.warn('Failed to check for new layers:', error);
    }
  }

  /**
   * Register a custom layer adapter dynamically.
   * This allows adding adapters after the LayerControl has been initialized.
   * @param adapter The custom layer adapter to register
   */
  registerCustomAdapter(adapter: CustomLayerAdapter): void {
    // Create registry if it doesn't exist
    if (!this.customLayerRegistry) {
      this.customLayerRegistry = new CustomLayerRegistry();
      // Subscribe to registry changes
      this.customLayerUnsubscribe = this.customLayerRegistry.onChange((event, layerId) => {
        if (event === 'add' && layerId) {
          this.removedCustomLayerIds.delete(layerId);
        }
        this.checkForNewLayers();
      });
    }

    // Register the adapter
    this.customLayerRegistry.register(adapter);

    // Rebuild layer items to include the new adapter's layers
    if (this.panel) {
      this.checkForNewLayers();
    }
  }

  // ===== Context Menu Methods =====

  /**
   * Create context menu element
   */
  private createContextMenu(): HTMLDivElement {
    const menu = document.createElement('div');
    menu.className = 'layer-control-context-menu';
    menu.style.display = 'none';

    // Rename
    const renameItem = this.createContextMenuItem('Rename', '✏️', () => {
      if (this.state.contextMenu.targetLayerId) {
        this.startRenaming(this.state.contextMenu.targetLayerId);
      }
      this.hideContextMenu();
    });

    // Zoom to layer
    const zoomItem = this.createContextMenuItem('Zoom to Layer', '🔍', () => {
      if (this.state.contextMenu.targetLayerId) {
        this.zoomToLayer(this.state.contextMenu.targetLayerId);
      }
      this.hideContextMenu();
    });

    // Separator
    const sep1 = document.createElement('div');
    sep1.className = 'context-menu-separator';

    // Move up
    const moveUpItem = this.createContextMenuItem('Move Up', '↑', () => {
      if (this.state.contextMenu.targetLayerId) {
        this.moveLayerUp(this.state.contextMenu.targetLayerId);
      }
      this.hideContextMenu();
    });

    // Move to top
    const moveTopItem = this.createContextMenuItem('Move to Top', '⤒', () => {
      if (this.state.contextMenu.targetLayerId) {
        this.moveLayerToTop(this.state.contextMenu.targetLayerId);
      }
      this.hideContextMenu();
    });

    // Move down
    const moveDownItem = this.createContextMenuItem('Move Down', '↓', () => {
      if (this.state.contextMenu.targetLayerId) {
        this.moveLayerDown(this.state.contextMenu.targetLayerId);
      }
      this.hideContextMenu();
    });

    // Move to bottom
    const moveBottomItem = this.createContextMenuItem('Move to Bottom', '⤓', () => {
      if (this.state.contextMenu.targetLayerId) {
        this.moveLayerToBottom(this.state.contextMenu.targetLayerId);
      }
      this.hideContextMenu();
    });

    // Separator
    const sep2 = document.createElement('div');
    sep2.className = 'context-menu-separator';

    // Remove layer
    const removeItem = this.createContextMenuItem('Remove Layer', '🗑️', () => {
      if (this.state.contextMenu.targetLayerId) {
        this.removeLayer(this.state.contextMenu.targetLayerId);
      }
      this.hideContextMenu();
    }, true);

    menu.appendChild(renameItem);
    menu.appendChild(zoomItem);
    menu.appendChild(sep1);
    menu.appendChild(moveUpItem);
    menu.appendChild(moveTopItem);
    menu.appendChild(moveDownItem);
    menu.appendChild(moveBottomItem);
    menu.appendChild(sep2);
    menu.appendChild(removeItem);

    return menu;
  }

  /**
   * Create a context menu item
   */
  private createContextMenuItem(
    label: string,
    icon: string,
    onClick: () => void,
    isDanger = false
  ): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'context-menu-item' + (isDanger ? ' context-menu-item-danger' : '');

    const iconEl = document.createElement('span');
    iconEl.className = 'context-menu-item-icon';
    iconEl.textContent = icon;

    const labelEl = document.createElement('span');
    labelEl.className = 'context-menu-item-label';
    labelEl.textContent = label;

    item.appendChild(iconEl);
    item.appendChild(labelEl);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });

    return item;
  }

  /**
   * Show context menu at position
   */
  private showContextMenu(layerId: string, x: number, y: number): void {
    if (!this.contextMenuEl) return;

    // Update state
    this.state.contextMenu = {
      visible: true,
      targetLayerId: layerId,
      x,
      y,
    };

    // Position the menu relative to the map container
    const mapRect = this.mapContainer.getBoundingClientRect();
    let menuX = x - mapRect.left;
    let menuY = y - mapRect.top;

    // Show menu to get dimensions
    this.contextMenuEl.style.display = 'block';

    // Adjust if menu would go off screen
    const menuRect = this.contextMenuEl.getBoundingClientRect();
    if (menuX + menuRect.width > mapRect.width) {
      menuX = mapRect.width - menuRect.width - 5;
    }
    if (menuY + menuRect.height > mapRect.height) {
      menuY = mapRect.height - menuRect.height - 5;
    }

    this.contextMenuEl.style.left = `${menuX}px`;
    this.contextMenuEl.style.top = `${menuY}px`;
  }

  /**
   * Hide context menu
   */
  private hideContextMenu(): void {
    if (!this.contextMenuEl) return;

    this.state.contextMenu = {
      visible: false,
      targetLayerId: null,
      x: 0,
      y: 0,
    };

    this.contextMenuEl.style.display = 'none';
  }

  /**
   * Start renaming a layer
   */
  private startRenaming(layerId: string): void {
    const itemEl = this.panel.querySelector(`[data-layer-id="${layerId}"]`);
    if (!itemEl) return;

    const nameEl = itemEl.querySelector('.layer-control-name');
    if (!nameEl) return;

    this.state.renamingLayerId = layerId;

    const currentName = this.state.customLayerNames.get(layerId) ||
      this.state.layerStates[layerId]?.name ||
      layerId;

    // Replace name span with input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'layer-control-name-input';
    input.value = currentName;

    const finishRename = () => {
      const newName = input.value.trim() || currentName;
      const oldName = currentName;

      if (newName !== oldName) {
        this.state.customLayerNames.set(layerId, newName);
        if (this.state.layerStates[layerId]) {
          this.state.layerStates[layerId].name = newName;
        }
        this.onLayerRename?.(layerId, oldName, newName);
      }

      // Restore name span
      const newNameEl = document.createElement('span');
      newNameEl.className = 'layer-control-name';
      newNameEl.textContent = newName;
      newNameEl.title = newName;
      input.replaceWith(newNameEl);

      this.state.renamingLayerId = null;
    };

    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Restore original name
        const newNameEl = document.createElement('span');
        newNameEl.className = 'layer-control-name';
        newNameEl.textContent = currentName;
        newNameEl.title = currentName;
        input.replaceWith(newNameEl);
        this.state.renamingLayerId = null;
      }
    });

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  }

  /**
   * Zoom to a layer's bounds
   */
  private zoomToLayer(layerId: string): void {
    // Check if it's a custom layer with getBounds support
    const layerState = this.state.layerStates[layerId];
    if (layerState?.isCustomLayer && this.customLayerRegistry) {
      const bounds = this.customLayerRegistry.getBounds(layerId);
      if (bounds) {
        this.map.fitBounds(bounds as [number, number, number, number], { padding: 50 });
        return;
      }
    }

    // For native MapLibre layers, try to get bounds from features
    const layer = this.map.getLayer(layerId);
    if (!layer) return;

    try {
      // First try querySourceFeatures for all features
      const sourceId = (layer as any).source;
      let features = sourceId ? this.map.querySourceFeatures(sourceId) : [];

      // If no source features, try rendered features
      if (features.length === 0) {
        features = this.map.queryRenderedFeatures({ layers: [layerId] });
      }

      if (features.length === 0) return;

      // Calculate bounds
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

      features.forEach(feature => {
        if (!feature.geometry) return;

        const processCoords = (coords: any) => {
          if (typeof coords[0] === 'number') {
            const [lng, lat] = coords;
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
          } else {
            coords.forEach(processCoords);
          }
        };

        if (feature.geometry.type === 'Point') {
          processCoords((feature.geometry as any).coordinates);
        } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiPoint') {
          (feature.geometry as any).coordinates.forEach(processCoords);
        } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiLineString') {
          (feature.geometry as any).coordinates.forEach((ring: any) => ring.forEach(processCoords));
        } else if (feature.geometry.type === 'MultiPolygon') {
          (feature.geometry as any).coordinates.forEach((polygon: any) =>
            polygon.forEach((ring: any) => ring.forEach(processCoords))
          );
        }
      });

      if (minLng !== Infinity && minLat !== Infinity && maxLng !== -Infinity && maxLat !== -Infinity) {
        this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50 });
      }
    } catch (error) {
      console.warn(`Failed to zoom to layer ${layerId}:`, error);
    }
  }

  /**
   * Get user layer IDs in current map order (top to bottom in UI = high z-index to low)
   * Includes both MapLibre layers and custom layers managed by adapters.
   */
  private getUserLayerIdsInMapOrder(): string[] {
    const style = this.map.getStyle();
    if (!style?.layers) return [];

    // Get map layers in their actual order (low index = rendered first/bottom)
    const mapLayerIds = style.layers.map(l => l.id);

    // Filter to only user layers that are in our state
    const userLayerIds = Object.keys(this.state.layerStates).filter(id => id !== 'Background');

    // Separate MapLibre layers and custom layers
    const mapLibreLayers = userLayerIds.filter(id => mapLayerIds.includes(id));
    const customLayers = userLayerIds.filter(id =>
      this.state.layerStates[id]?.isCustomLayer && !mapLayerIds.includes(id)
    );

    // Sort MapLibre layers by map order (reversed: high index = top in UI)
    const sortedMapLibreLayers = mapLibreLayers
      .sort((a, b) => mapLayerIds.indexOf(b) - mapLayerIds.indexOf(a));

    // Custom layers are placed at the top (rendered last/on top)
    // Maintain their relative order from the state
    return [...customLayers, ...sortedMapLibreLayers];
  }

  /**
   * Check if a layer is a MapLibre layer (not a custom layer)
   */
  private isMapLibreLayer(layerId: string): boolean {
    return this.map.getLayer(layerId) !== undefined;
  }

  /**
   * Find the next MapLibre layer ID in a direction from a given index
   * @param layerIds Array of layer IDs
   * @param startIndex Index to start searching from
   * @param direction 1 for forward (toward bottom), -1 for backward (toward top)
   * @returns MapLibre layer ID or undefined if not found
   */
  private findNextMapLibreLayer(layerIds: string[], startIndex: number, direction: 1 | -1): string | undefined {
    for (let i = startIndex; direction === 1 ? i < layerIds.length : i >= 0; i += direction) {
      if (this.isMapLibreLayer(layerIds[i])) {
        return layerIds[i];
      }
    }
    return undefined;
  }

  /**
   * Move a layer up in UI (higher rendering order = move to higher z-index)
   */
  private moveLayerUp(layerId: string): void {
    const layerIds = this.getUserLayerIdsInMapOrder();
    const index = layerIds.indexOf(layerId);
    if (index <= 0) return; // Already at top or not found

    // Check if this is a custom layer
    const isCustom = this.state.layerStates[layerId]?.isCustomLayer;

    if (!isCustom && this.isMapLibreLayer(layerId)) {
      // For MapLibre layers, we need to move them in the map
      // UI: [0]=top, [1], [2], ... [n]=bottom
      // Map array: bottom to top (low index = low z-index)
      // moveLayer(id, beforeId) moves id to render BELOW beforeId

      try {
        // Find the MapLibre layer to move before (2 positions above if exists)
        // If moving to top, use undefined as beforeId
        const targetBeforeId = index >= 2
          ? this.findNextMapLibreLayer(layerIds, index - 2, -1)
          : undefined;
        this.map.moveLayer(layerId, targetBeforeId);
      } catch (e) {
        // Ignore errors
      }
    }

    // For custom layers, just update the internal order
    // Swap positions in the state
    const newLayerStates: { [key: string]: LayerState } = {};
    const orderedIds = [...layerIds];
    [orderedIds[index], orderedIds[index - 1]] = [orderedIds[index - 1], orderedIds[index]];

    // Add Background first if it exists
    if (this.state.layerStates['Background']) {
      newLayerStates['Background'] = this.state.layerStates['Background'];
    }
    orderedIds.forEach(id => {
      if (this.state.layerStates[id]) {
        newLayerStates[id] = this.state.layerStates[id];
      }
    });
    this.state.layerStates = newLayerStates;

    // Rebuild UI
    this.buildLayerItems();
    this.onLayerReorder?.(this.getUserLayerIdsInMapOrder());
  }

  /**
   * Move a layer to the top (highest rendering order)
   */
  private moveLayerToTop(layerId: string): void {
    const layerIds = this.getUserLayerIdsInMapOrder();
    const index = layerIds.indexOf(layerId);
    if (index <= 0) return; // Already at top or not found

    // Check if this is a custom layer
    const isCustom = this.state.layerStates[layerId]?.isCustomLayer;

    if (!isCustom && this.isMapLibreLayer(layerId)) {
      // Move in MapLibre - no beforeId means move to top (highest z-index)
      try {
        this.map.moveLayer(layerId);
      } catch (e) {
        // Ignore errors
      }
    }

    // Update internal order - move to front
    const newLayerStates: { [key: string]: LayerState } = {};
    const orderedIds = [...layerIds];
    orderedIds.splice(index, 1);
    orderedIds.unshift(layerId);

    // Add Background first if it exists
    if (this.state.layerStates['Background']) {
      newLayerStates['Background'] = this.state.layerStates['Background'];
    }
    orderedIds.forEach(id => {
      if (this.state.layerStates[id]) {
        newLayerStates[id] = this.state.layerStates[id];
      }
    });
    this.state.layerStates = newLayerStates;

    // Rebuild UI
    this.buildLayerItems();
    this.onLayerReorder?.(this.getUserLayerIdsInMapOrder());
  }

  /**
   * Move a layer down in UI (lower rendering order = move to lower z-index)
   */
  private moveLayerDown(layerId: string): void {
    const layerIds = this.getUserLayerIdsInMapOrder();
    const index = layerIds.indexOf(layerId);
    if (index < 0 || index >= layerIds.length - 1) return; // Already at bottom or not found

    // Check if this is a custom layer
    const isCustom = this.state.layerStates[layerId]?.isCustomLayer;

    if (!isCustom && this.isMapLibreLayer(layerId)) {
      // The layer below in UI is at index + 1, which has lower z-index in map
      // To move our layer below it, we call moveLayer(layerId, belowLayerId)
      // This puts layerId just below belowLayerId in rendering order
      // Find the next MapLibre layer below
      const belowLayerId = this.findNextMapLibreLayer(layerIds, index + 1, 1);

      if (belowLayerId) {
        try {
          this.map.moveLayer(layerId, belowLayerId);
        } catch (e) {
          // Ignore errors
        }
      }
    }

    // Update internal order - swap positions
    const newLayerStates: { [key: string]: LayerState } = {};
    const orderedIds = [...layerIds];
    [orderedIds[index], orderedIds[index + 1]] = [orderedIds[index + 1], orderedIds[index]];

    // Add Background first if it exists
    if (this.state.layerStates['Background']) {
      newLayerStates['Background'] = this.state.layerStates['Background'];
    }
    orderedIds.forEach(id => {
      if (this.state.layerStates[id]) {
        newLayerStates[id] = this.state.layerStates[id];
      }
    });
    this.state.layerStates = newLayerStates;

    // Rebuild UI
    this.buildLayerItems();
    this.onLayerReorder?.(this.getUserLayerIdsInMapOrder());
  }

  /**
   * Move a layer to the bottom (lowest rendering order among user layers)
   */
  private moveLayerToBottom(layerId: string): void {
    const layerIds = this.getUserLayerIdsInMapOrder();
    if (layerIds.length <= 1) return;

    const index = layerIds.indexOf(layerId);
    if (index < 0 || index === layerIds.length - 1) return; // Not found or already at bottom

    // Check if this is a custom layer
    const isCustom = this.state.layerStates[layerId]?.isCustomLayer;

    if (!isCustom && this.isMapLibreLayer(layerId)) {
      // The bottom layer in UI has the lowest z-index among user layers
      // Find the bottom-most MapLibre layer
      const bottomLayerId = this.findNextMapLibreLayer(layerIds, layerIds.length - 1, -1);

      if (bottomLayerId && bottomLayerId !== layerId) {
        try {
          // Move this layer to be just below the current bottom layer
          this.map.moveLayer(layerId, bottomLayerId);
        } catch (e) {
          // Ignore errors
        }
      }
    }

    // Update internal order - move to end
    const newLayerStates: { [key: string]: LayerState } = {};
    const orderedIds = [...layerIds];
    orderedIds.splice(index, 1);
    orderedIds.push(layerId);

    // Add Background first if it exists
    if (this.state.layerStates['Background']) {
      newLayerStates['Background'] = this.state.layerStates['Background'];
    }
    orderedIds.forEach(id => {
      if (this.state.layerStates[id]) {
        newLayerStates[id] = this.state.layerStates[id];
      }
    });
    this.state.layerStates = newLayerStates;

    // Rebuild UI
    this.buildLayerItems();
    this.onLayerReorder?.(this.getUserLayerIdsInMapOrder());
  }

  /**
   * Remove a layer from the map
   */
  private removeLayer(layerId: string): void {
    // Prevent checkForNewLayers() from running during removal
    // (removing a layer triggers styledata events that could cause race conditions)
    this.state.isStyleOperationInProgress = true;

    const layerState = this.state.layerStates[layerId];

    // Handle custom layer removal
    if (layerState?.isCustomLayer && this.customLayerRegistry) {
      // Track this ID so checkForNewLayers() won't re-add it
      this.removedCustomLayerIds.add(layerId);

      // Hide the layer immediately as a visual fallback
      this.customLayerRegistry.setVisibility(layerId, false);

      // Let the adapter perform its own cleanup
      this.customLayerRegistry.removeLayer(layerId);
    }

    // Remove native MapLibre layer from the map
    try {
      const layer = this.map.getLayer(layerId);
      if (layer) {
        const sourceId = (layer as any).source;
        this.map.removeLayer(layerId);

        // Check if source is still used by other layers
        if (sourceId) {
          const style = this.map.getStyle();
          const sourceStillUsed = style?.layers?.some(l => (l as any).source === sourceId);
          if (!sourceStillUsed) {
            try {
              this.map.removeSource(sourceId);
            } catch (e) {
              // Source might not exist or be in use
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to remove layer ${layerId}:`, error);
    }

    // Remove from state
    delete this.state.layerStates[layerId];
    this.state.customLayerNames.delete(layerId);

    // Remove from UI
    const itemEl = this.panel.querySelector(`[data-layer-id="${layerId}"]`);
    if (itemEl) {
      itemEl.remove();
    }

    // Call callback
    this.onLayerRemove?.(layerId);

    // Clear flag after style events have settled
    setTimeout(() => {
      this.state.isStyleOperationInProgress = false;
    }, 200);
  }

  // ===== Drag and Drop Methods =====

  /**
   * Create drag handle element
   */
  private createDragHandle(layerId: string): HTMLDivElement {
    const handle = document.createElement('div');
    handle.className = 'layer-control-drag-handle';
    handle.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5"/>
      <circle cx="11" cy="3" r="1.5"/>
      <circle cx="5" cy="8" r="1.5"/>
      <circle cx="11" cy="8" r="1.5"/>
      <circle cx="5" cy="13" r="1.5"/>
      <circle cx="11" cy="13" r="1.5"/>
    </svg>`;
    handle.title = 'Drag to reorder';

    // Pointer events for dragging
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.startDrag(layerId, e);
    });

    return handle;
  }

  /**
   * Create a disabled drag handle for alignment (used for Background layer)
   */
  private createDisabledDragHandle(): HTMLDivElement {
    const handle = document.createElement('div');
    handle.className = 'layer-control-drag-handle layer-control-drag-handle-disabled';
    handle.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5"/>
      <circle cx="11" cy="3" r="1.5"/>
      <circle cx="5" cy="8" r="1.5"/>
      <circle cx="11" cy="8" r="1.5"/>
      <circle cx="5" cy="13" r="1.5"/>
      <circle cx="11" cy="13" r="1.5"/>
    </svg>`;
    return handle;
  }

  /**
   * Start dragging a layer
   */
  private startDrag(layerId: string, e: PointerEvent): void {
    const itemEl = this.panel.querySelector(`[data-layer-id="${layerId}"]`) as HTMLElement;
    if (!itemEl) return;

    // Get item rect before any modifications
    const rect = itemEl.getBoundingClientRect();

    // Set up drag state
    this.state.drag = {
      active: true,
      layerId,
      startY: e.clientY,
      currentY: e.clientY,
      placeholder: null,
      draggedElement: null,
    };

    // Add dragging class to panel
    this.panel.classList.add('dragging-active');

    // Hide original first (before creating clone to avoid visual jump)
    itemEl.classList.add('dragging');

    // Create placeholder at original position
    const placeholder = document.createElement('div');
    placeholder.className = 'layer-control-drop-placeholder';
    placeholder.style.height = `${rect.height}px`;
    itemEl.parentNode?.insertBefore(placeholder, itemEl);
    this.state.drag.placeholder = placeholder;

    // Create floating clone
    const clone = itemEl.cloneNode(true) as HTMLElement;
    clone.classList.remove('dragging');
    clone.className = 'layer-control-item layer-control-item-dragging';
    clone.style.width = `${rect.width}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    document.body.appendChild(clone);
    this.state.drag.draggedElement = clone;

    // Set up move and end handlers on document
    const onMove = (moveE: PointerEvent) => this.onDragMove(moveE);
    const onEnd = (endE: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
      this.endDrag(endE);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
  }

  /**
   * Handle drag move
   */
  private onDragMove(e: PointerEvent): void {
    if (!this.state.drag.active || !this.state.drag.draggedElement) return;

    const placeholder = this.state.drag.placeholder;
    if (!placeholder) return;

    // Move the floating element
    const deltaY = e.clientY - this.state.drag.startY;
    const clone = this.state.drag.draggedElement;
    const currentTop = parseFloat(clone.style.top) || 0;
    clone.style.top = `${currentTop + deltaY}px`;
    this.state.drag.startY = e.clientY;
    this.state.drag.currentY = e.clientY;

    // Get all layer items (excluding the one being dragged and Background)
    const items = Array.from(this.panel.querySelectorAll('.layer-control-item:not(.dragging)'))
      .filter(item => (item as HTMLElement).dataset.layerId !== 'Background') as HTMLElement[];

    // Find which item we're hovering over
    for (const item of items) {
      const itemRect = item.getBoundingClientRect();

      // Check if cursor is within this item's vertical bounds
      if (e.clientY >= itemRect.top && e.clientY <= itemRect.bottom) {
        const itemMiddle = itemRect.top + itemRect.height / 2;

        if (e.clientY < itemMiddle) {
          // Insert placeholder before this item (if not already there)
          if (placeholder.nextSibling !== item) {
            item.parentNode?.insertBefore(placeholder, item);
          }
        } else {
          // Insert placeholder after this item (if not already there)
          if (placeholder.previousSibling !== item) {
            item.parentNode?.insertBefore(placeholder, item.nextSibling);
          }
        }
        break;
      }
    }
  }

  /**
   * End dragging
   */
  private endDrag(_e: PointerEvent): void {
    if (!this.state.drag.active) return;

    const layerId = this.state.drag.layerId;
    const placeholder = this.state.drag.placeholder;

    // Get the original item
    const itemEl = this.panel.querySelector(`[data-layer-id="${layerId}"]`) as HTMLElement;

    if (itemEl && placeholder) {
      // Move item to placeholder position
      placeholder.parentNode?.insertBefore(itemEl, placeholder);
      itemEl.classList.remove('dragging');
    }

    // Clean up
    this.cleanupDragState();

    // Update map layer order based on UI order
    this.applyUIOrderToMap();
  }

  /**
   * Clean up drag state
   */
  private cleanupDragState(): void {
    // Remove floating element
    if (this.state.drag.draggedElement) {
      this.state.drag.draggedElement.remove();
    }

    // Remove placeholder
    if (this.state.drag.placeholder) {
      this.state.drag.placeholder.remove();
    }

    // Remove dragging class from panel
    this.panel.classList.remove('dragging-active');

    // Remove dragging class from any items
    this.panel.querySelectorAll('.layer-control-item.dragging').forEach(el => {
      el.classList.remove('dragging');
    });

    // Reset drag state
    this.state.drag = {
      active: false,
      layerId: null,
      startY: 0,
      currentY: 0,
      placeholder: null,
      draggedElement: null,
    };
  }

  /**
   * Apply UI order to map layers
   */
  private applyUIOrderToMap(): void {
    // Set flag to prevent checkForNewLayers from running during reordering
    // This prevents custom layers from being incorrectly deleted due to race conditions
    this.state.isStyleOperationInProgress = true;

    // Get layer items in current UI order
    const items = this.panel.querySelectorAll('.layer-control-item');
    const uiLayerIds: string[] = [];

    items.forEach(item => {
      const layerId = (item as HTMLElement).dataset.layerId;
      if (layerId && layerId !== 'Background') {
        uiLayerIds.push(layerId);
      }
    });

    // UI shows top layer first, but we need to move layers in reverse order
    // to maintain the correct stacking
    const reversedIds = [...uiLayerIds].reverse();

    // Build a set of MapLibre layer IDs for quick lookup
    const style = this.map.getStyle();
    const mapLibreLayerIds = new Set(style?.layers?.map(l => l.id) || []);

    // Move each layer to its correct position
    for (let i = 0; i < reversedIds.length; i++) {
      const layerId = reversedIds[i];

      // Check if layer exists in MapLibre (skip custom layers)
      if (!mapLibreLayerIds.has(layerId)) {
        continue;
      }

      // Find the next MapLibre layer to use as beforeId
      // Skip any custom layers that might be between this layer and the next
      let beforeId: string | undefined = undefined;
      for (let j = i - 1; j >= 0; j--) {
        if (mapLibreLayerIds.has(reversedIds[j])) {
          beforeId = reversedIds[j];
          break;
        }
      }

      try {
        this.map.moveLayer(layerId, beforeId);
      } catch (e) {
        // Ignore errors
      }
    }

    // Call callback
    this.onLayerReorder?.(uiLayerIds);

    // Clear flag after styledata events have settled
    // The 200ms delay accounts for the 100ms timeout in the styledata event handler
    setTimeout(() => {
      this.state.isStyleOperationInProgress = false;
    }, 200);
  }
}
