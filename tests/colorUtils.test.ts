import { describe, it, expect } from 'vitest';
import { rgbToHex, normalizeColor } from '../src/lib/utils/colorUtils';

describe('rgbToHex', () => {
  it('converts RGB values to hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
  });

  it('handles black and white', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
  });

  it('handles mixed values', () => {
    expect(rgbToHex(51, 136, 255)).toBe('#3388ff');
    expect(rgbToHex(128, 128, 128)).toBe('#808080');
  });

  it('clamps values outside 0-255 range', () => {
    expect(rgbToHex(300, -50, 128)).toBe('#ff0080');
  });

  it('rounds decimal values', () => {
    expect(rgbToHex(127.4, 127.6, 0)).toBe('#7f8000');
  });
});

describe('normalizeColor', () => {
  it('returns hex colors unchanged', () => {
    expect(normalizeColor('#ff0000')).toBe('#ff0000');
    expect(normalizeColor('#3388ff')).toBe('#3388ff');
  });

  it('expands shorthand hex colors', () => {
    expect(normalizeColor('#f00')).toBe('#ff0000');
    expect(normalizeColor('#abc')).toBe('#aabbcc');
  });

  it('converts RGB strings to hex', () => {
    expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(normalizeColor('rgb(51, 136, 255)')).toBe('#3388ff');
  });

  it('converts RGBA strings to hex (ignores alpha)', () => {
    expect(normalizeColor('rgba(255, 0, 0, 0.5)')).toBe('#ff0000');
  });

  it('converts RGB arrays to hex', () => {
    expect(normalizeColor([255, 0, 0])).toBe('#ff0000');
    expect(normalizeColor([51, 136, 255])).toBe('#3388ff');
  });

  it('handles RGBA arrays (ignores alpha)', () => {
    expect(normalizeColor([255, 0, 0, 0.5])).toBe('#ff0000');
  });

  it('returns fallback color for invalid input', () => {
    expect(normalizeColor(null)).toBe('#3388ff');
    expect(normalizeColor(undefined)).toBe('#3388ff');
    expect(normalizeColor('invalid')).toBe('#3388ff');
    expect(normalizeColor({})).toBe('#3388ff');
  });
});
