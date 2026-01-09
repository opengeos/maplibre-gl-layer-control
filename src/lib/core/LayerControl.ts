import type { IControl, Map as MapLibreMap, LayerSpecification } from 'maplibre-gl';
import type {
  LayerControlOptions,
  LayerState,
  OriginalStyle,
  InternalControlState,
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
  private container!: HTMLDivElement;
  private button!: HTMLButtonElement;
  private panel!: HTMLDivElement;

  // State management
  private state: InternalControlState;
  private targetLayers: string[];
  private styleEditors: Map<string, HTMLElement>;

  // Panel width management
  private minPanelWidth: number;
  private maxPanelWidth: number;
  private maxPanelHeight: number;
  private showStyleEditor: boolean;
  private showOpacitySlider: boolean;
  private showLayerSymbol: boolean;
  private excludeDrawnLayers: boolean;
  private customLayerRegistry: CustomLayerRegistry | null = null;
  private customLayerUnsubscribe: (() => void) | null = null;
  private widthSliderEl: HTMLElement | null = null;
  private widthThumbEl: HTMLElement | null = null;
  private widthValueEl: HTMLElement | null = null;
  private isWidthSliderActive = false;
  private widthDragRectWidth: number | null = null;
  private widthDragStartX: number | null = null;
  private widthDragStartWidth: number | null = null;
  private widthFrame: number | null = null;

  constructor(options: LayerControlOptions = {}) {
    this.minPanelWidth = options.panelMinWidth || 240;
    this.maxPanelWidth = options.panelMaxWidth || 420;
    this.maxPanelHeight = options.panelMaxHeight || 600;
    this.showStyleEditor = options.showStyleEditor !== false;
    this.showOpacitySlider = options.showOpacitySlider !== false;
    this.showLayerSymbol = options.showLayerSymbol !== false;
    this.excludeDrawnLayers = options.excludeDrawnLayers !== false;

    this.state = {
      collapsed: options.collapsed !== false,
      panelWidth: options.panelWidth || 348,
      activeStyleEditor: null,
      layerStates: options.layerStates || {},
      originalStyles: new Map<string, OriginalStyle>(),
      userInteractingWithSlider: false,
      backgroundLegendOpen: false,
      backgroundLayerVisibility: new Map<string, boolean>(),
      onlyRenderedFilter: false,
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
  }

  /**
   * Called when the control is added to the map
   */
  onAdd(map: MapLibreMap): HTMLElement {
    this.map = map;

    // Auto-detect layers if layerStates not provided
    if (Object.keys(this.state.layerStates).length === 0) {
      this.autoDetectLayers();
    }

    this.container = this.createContainer();
    this.button = this.createToggleButton();
    this.panel = this.createPanel();

    this.container.appendChild(this.button);
    this.container.appendChild(this.panel);

    // Now that panel is attached, update width display
    this.updateWidthDisplay();

    // Setup event listeners
    this.setupEventListeners();

    // Build layer items
    this.buildLayerItems();

    return this.container;
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

    this.container.parentNode?.removeChild(this.container);
    // Cleanup will be handled by garbage collection
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
      // Get the original style's source IDs to determine which layers are from the base style
      const originalSourceIds = this.getOriginalStyleSourceIds();

      const userAddedLayers: string[] = [];
      const backgroundLayerIds: string[] = [];

      allLayerIds.forEach(layerId => {
        const layer = this.map.getLayer(layerId);
        if (!layer) return;

        // Skip drawn layers if excludeDrawnLayers is enabled
        if (this.excludeDrawnLayers && this.isDrawnLayer(layerId)) {
          backgroundLayerIds.push(layerId);
          return;
        }

        // Check if this layer uses a source from the original style
        const sourceId = (layer as any).source;

        // Layers without a source (like background color layer) are background layers
        // Layers using sources NOT in the original style are user-added
        if (!sourceId || originalSourceIds.has(sourceId)) {
          backgroundLayerIds.push(layerId);
        } else {
          userAddedLayers.push(layerId);
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
   * Get the source IDs that were part of the original style (from the style URL)
   * Sources added via map.addSource() are considered user-added
   */
  private getOriginalStyleSourceIds(): Set<string> {
    const originalSourceIds = new Set<string>();
    const style = this.map.getStyle();
    if (!style || !style.sources) return originalSourceIds;

    // Try to determine the style's base URL from sprite or glyphs
    const spriteUrl = style.sprite as string | undefined;
    const glyphsUrl = style.glyphs;

    let styleBaseDomain = '';
    if (spriteUrl) {
      try {
        const url = new URL(typeof spriteUrl === 'string' ? spriteUrl : '');
        styleBaseDomain = url.hostname;
      } catch {
        // Ignore URL parsing errors
      }
    } else if (glyphsUrl) {
      try {
        const url = new URL(glyphsUrl.replace('{fontstack}', 'test').replace('{range}', 'test'));
        styleBaseDomain = url.hostname;
      } catch {
        // Ignore URL parsing errors
      }
    }

    // Check each source to determine if it's from the original style
    Object.entries(style.sources).forEach(([sourceId, source]) => {
      const src = source as any;

      // Check if this source matches the style's base domain
      let sourceUrl = src.url || (src.tiles && src.tiles[0]) || '';

      if (sourceUrl) {
        try {
          const url = new URL(sourceUrl);
          // If source is from the same domain as the style, it's original
          if (styleBaseDomain && url.hostname === styleBaseDomain) {
            originalSourceIds.add(sourceId);
            return;
          }
          // Common tile providers that are typically part of base styles
          const basemapDomains = [
            'demotiles.maplibre.org',
            'api.maptiler.com',
            'tiles.stadiamaps.com',
            'api.mapbox.com',
            'basemaps.cartocdn.com'
          ];
          if (basemapDomains.some(domain => url.hostname.includes(domain))) {
            originalSourceIds.add(sourceId);
            return;
          }
        } catch {
          // If URL parsing fails, check other heuristics
        }
      }

      // Sources without URL and without data are likely from original style
      // (e.g., composite sources, or sources defined inline in the style)
      if (!src.data && !sourceUrl && src.type !== 'geojson') {
        originalSourceIds.add(sourceId);
      }
    });

    return originalSourceIds;
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
      /^gm[-_\s]/i,                  // Geoman (gm-main-*, gm_*, Gm Temporary...)
      /^gl-draw[-_]/i,               // Mapbox GL Draw
      /^mapbox-gl-draw[-_]/i,        // Mapbox GL Draw alternative
      /^terra-draw[-_]/i,            // Terra Draw
      /^maplibre-gl-draw[-_]/i,      // MapLibre GL Draw
      /^draw[-_]layer/i,             // Generic draw layers
    ];

    return drawnLayerPatterns.some(pattern => pattern.test(layerId));
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

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.collapse();
      }
    });

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
      this.customLayerUnsubscribe = this.customLayerRegistry.onChange(() => {
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

    // Visibility checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'layer-control-checkbox';
    checkbox.checked = state.visible;
    checkbox.addEventListener('change', () => {
      this.toggleLayerVisibility(layerId, checkbox.checked);
    });

    // Layer name
    const name = document.createElement('span');
    name.className = 'layer-control-name';
    name.textContent = state.name || layerId;
    name.title = state.name || layerId;

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

    // Update local state
    if (this.state.layerStates[layerId]) {
      this.state.layerStates[layerId].visible = visible;
    }

    // Try custom layer registry first
    if (this.customLayerRegistry?.setVisibility(layerId, visible)) {
      return;
    }

    // Fallback to native MapLibre layer
    this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
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

    // Update local state
    if (this.state.layerStates[layerId]) {
      this.state.layerStates[layerId].opacity = opacity;
    }

    // Try custom layer registry first
    if (this.customLayerRegistry?.setOpacity(layerId, opacity)) {
      return;
    }

    // Fallback to native MapLibre layer
    const layerType = getLayerType(this.map, layerId);
    if (layerType) {
      setLayerOpacity(this.map, layerId, layerType, opacity);
    }
  }

  /**
   * Check if a layer is a user-added layer (vs basemap layer)
   */
  private isUserAddedLayer(layerId: string): boolean {
    return this.state.layerStates[layerId] !== undefined && layerId !== 'Background';
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
      // Show info message for custom layers
      const editor = this.createCustomLayerInfoPanel(layerId, layerState.customLayerType);
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
  private createCustomLayerInfoPanel(layerId: string, layerType?: string): HTMLDivElement {
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
    const typeLabel = layerType ? layerType.toUpperCase() : 'Custom';
    infoText.textContent = `This is a ${typeLabel} layer. Style editing is not available for this layer type. Use the visibility toggle and opacity slider to control the layer.`;

    content.appendChild(infoText);

    // Close button
    const actions = document.createElement('div');
    actions.className = 'style-editor-actions';

    const closeActionBtn = document.createElement('button');
    closeActionBtn.className = 'style-editor-button style-editor-button-close';
    closeActionBtn.textContent = 'Close';
    closeActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeStyleEditor(layerId);
    });

    actions.appendChild(closeActionBtn);

    editor.appendChild(header);
    editor.appendChild(content);
    editor.appendChild(actions);

    return editor;
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

    const closeActionBtn = document.createElement('button');
    closeActionBtn.className = 'style-editor-button style-editor-button-close';
    closeActionBtn.textContent = 'Close';
    closeActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeStyleEditor(layerId);
    });

    actions.appendChild(resetBtn);
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
    this.createSliderControl(container, layerId, 'raster-hue-rotate', 'Hue Rotate', typeof hueRotate === 'number' ? hueRotate : 0, 0, 360, 5);
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
      this.map.setPaintProperty(layerId, property, color);
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
      this.map.setPaintProperty(layerId, property, value);
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
    try {
      const style = this.map.getStyle();
      if (!style || !style.layers) {
        return;
      }

      const currentMapLayerIds = new Set(style.layers.map(layer => layer.id));
      const originalSourceIds = this.getOriginalStyleSourceIds();

      // Check if we're in auto-detect mode (no specific layers were specified)
      const isAutoDetectMode = this.targetLayers.length === 0 ||
        (this.targetLayers.length === 1 && this.targetLayers[0] === 'Background') ||
        this.targetLayers.every(id => id === 'Background' || this.state.layerStates[id]);

      // Find new layers that aren't in our state yet
      const newLayers: string[] = [];
      currentMapLayerIds.forEach(layerId => {
        if (layerId !== 'Background' && !this.state.layerStates[layerId]) {
          const layer = this.map.getLayer(layerId);
          if (layer) {
            // In auto-detect mode, only add layers using user-added sources
            if (isAutoDetectMode) {
              // Skip drawn layers if excludeDrawnLayers is enabled
              if (this.excludeDrawnLayers && this.isDrawnLayer(layerId)) {
                return;
              }

              const sourceId = (layer as any).source;
              // If no source or source is from original style, skip (it's a background layer)
              if (!sourceId || originalSourceIds.has(sourceId)) {
                return;
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

        // Find new custom layers
        customLayerIds.forEach(layerId => {
          if (!this.state.layerStates[layerId]) {
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
}
