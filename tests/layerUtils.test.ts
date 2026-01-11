import { describe, it, expect } from 'vitest';
import { getOpacityProperty, isStyleableLayerType } from '../src/lib/utils/layerUtils';

describe('getOpacityProperty', () => {
  it('returns correct property for fill layers', () => {
    expect(getOpacityProperty('fill')).toBe('fill-opacity');
  });

  it('returns correct property for line layers', () => {
    expect(getOpacityProperty('line')).toBe('line-opacity');
  });

  it('returns correct property for circle layers', () => {
    expect(getOpacityProperty('circle')).toBe('circle-opacity');
  });

  it('returns correct property for raster layers', () => {
    expect(getOpacityProperty('raster')).toBe('raster-opacity');
  });

  it('returns correct property for background layers', () => {
    expect(getOpacityProperty('background')).toBe('background-opacity');
  });

  it('returns array for symbol layers (icon and text)', () => {
    const result = getOpacityProperty('symbol');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain('icon-opacity');
    expect(result).toContain('text-opacity');
  });

  it('returns correct property for heatmap layers', () => {
    expect(getOpacityProperty('heatmap')).toBe('heatmap-opacity');
  });

  it('returns correct property for fill-extrusion layers', () => {
    expect(getOpacityProperty('fill-extrusion')).toBe('fill-extrusion-opacity');
  });

  it('returns exaggeration for hillshade layers', () => {
    expect(getOpacityProperty('hillshade')).toBe('hillshade-exaggeration');
  });

  it('returns null for color-relief layers', () => {
    expect(getOpacityProperty('color-relief')).toBe(null);
  });

  it('generates property name for unknown layer types', () => {
    expect(getOpacityProperty('custom')).toBe('custom-opacity');
  });
});

describe('isStyleableLayerType', () => {
  it('returns true for styleable layer types', () => {
    expect(isStyleableLayerType('fill')).toBe(true);
    expect(isStyleableLayerType('line')).toBe(true);
    expect(isStyleableLayerType('circle')).toBe(true);
    expect(isStyleableLayerType('symbol')).toBe(true);
    expect(isStyleableLayerType('raster')).toBe(true);
    expect(isStyleableLayerType('heatmap')).toBe(true);
    expect(isStyleableLayerType('fill-extrusion')).toBe(true);
    expect(isStyleableLayerType('hillshade')).toBe(true);
  });

  it('returns false for non-styleable layer types', () => {
    expect(isStyleableLayerType('background')).toBe(false);
    expect(isStyleableLayerType('color-relief')).toBe(false);
    expect(isStyleableLayerType('custom')).toBe(false);
  });
});
