import type { CustomLayerAdapter, LayerState } from './types';

/**
 * Registry for managing custom layer adapters.
 * Routes layer operations to the appropriate adapter based on layer ID.
 */
export class CustomLayerRegistry {
  private adapters: Map<string, CustomLayerAdapter> = new Map();
  private changeListeners: Array<(event: 'add' | 'remove', layerId: string) => void> = [];
  private unsubscribers: Map<string, () => void> = new Map();

  /**
   * Register a custom layer adapter.
   * @param adapter The adapter to register
   */
  register(adapter: CustomLayerAdapter): void {
    this.adapters.set(adapter.type, adapter);

    // Subscribe to adapter's layer changes if supported
    if (adapter.onLayerChange) {
      const unsubscribe = adapter.onLayerChange((event, layerId) => {
        this.notifyChange(event, layerId);
      });
      this.unsubscribers.set(adapter.type, unsubscribe);
    }
  }

  /**
   * Unregister an adapter by type.
   * @param type The adapter type to unregister
   */
  unregister(type: string): void {
    // Clean up the subscription for this adapter
    const unsubscribe = this.unsubscribers.get(type);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribers.delete(type);
    }
    this.adapters.delete(type);
  }

  /**
   * Get all custom layer IDs across all adapters.
   * @returns Array of layer IDs
   */
  getAllLayerIds(): string[] {
    const ids: string[] = [];
    this.adapters.forEach(adapter => {
      ids.push(...adapter.getLayerIds());
    });
    return ids;
  }

  /**
   * Check if a layer ID is managed by any adapter.
   * @param layerId The layer ID to check
   * @returns true if the layer is managed by an adapter
   */
  hasLayer(layerId: string): boolean {
    for (const adapter of this.adapters.values()) {
      if (adapter.getLayerIds().includes(layerId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the adapter responsible for a specific layer.
   * @param layerId The layer ID
   * @returns The adapter or null if not found
   */
  getAdapterForLayer(layerId: string): CustomLayerAdapter | null {
    for (const adapter of this.adapters.values()) {
      if (adapter.getLayerIds().includes(layerId)) {
        return adapter;
      }
    }
    return null;
  }

  /**
   * Get the state of a custom layer.
   * @param layerId The layer ID
   * @returns The layer state or null if not found
   */
  getLayerState(layerId: string): LayerState | null {
    const adapter = this.getAdapterForLayer(layerId);
    return adapter ? adapter.getLayerState(layerId) : null;
  }

  /**
   * Set visibility of a custom layer.
   * @param layerId The layer ID
   * @param visible Whether the layer should be visible
   * @returns true if the operation was handled by an adapter
   */
  setVisibility(layerId: string, visible: boolean): boolean {
    const adapter = this.getAdapterForLayer(layerId);
    if (adapter) {
      adapter.setVisibility(layerId, visible);
      return true;
    }
    return false;
  }

  /**
   * Set opacity of a custom layer.
   * @param layerId The layer ID
   * @param opacity The opacity value (0-1)
   * @returns true if the operation was handled by an adapter
   */
  setOpacity(layerId: string, opacity: number): boolean {
    const adapter = this.getAdapterForLayer(layerId);
    if (adapter) {
      adapter.setOpacity(layerId, opacity);
      return true;
    }
    return false;
  }

  /**
   * Get the symbol type for a custom layer (for UI display).
   * @param layerId The layer ID
   * @returns The symbol type or null if not available
   */
  getSymbolType(layerId: string): string | null {
    const adapter = this.getAdapterForLayer(layerId);
    if (adapter && adapter.getSymbolType) {
      return adapter.getSymbolType(layerId);
    }
    return null;
  }

  /**
   * Subscribe to layer changes across all adapters.
   * @param callback Function called when layers are added or removed
   * @returns Unsubscribe function
   */
  onChange(callback: (event: 'add' | 'remove', layerId: string) => void): () => void {
    this.changeListeners.push(callback);
    return () => {
      const idx = this.changeListeners.indexOf(callback);
      if (idx >= 0) {
        this.changeListeners.splice(idx, 1);
      }
    };
  }

  private notifyChange(event: 'add' | 'remove', layerId: string): void {
    this.changeListeners.forEach(cb => cb(event, layerId));
  }

  /**
   * Clean up all subscriptions and adapters.
   */
  destroy(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers.clear();
    this.adapters.clear();
    this.changeListeners = [];
  }
}
