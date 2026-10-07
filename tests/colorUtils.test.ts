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
  it('returns canonical six-digit hex colors', () => {
    expect(normalizeColor('#ff0000')).toBe('#ff0000');
    expect(normalizeColor('#3388ff')).toBe('#3388ff');
    expect(normalizeColor('#FF0000')).toBe('#ff0000');
  });

  it('expands shorthand hex colors', () => {
    expect(normalizeColor('#f00')).toBe('#ff0000');
    expect(normalizeColor('#abc')).toBe('#aabbcc');
  });

  it('converts RGB strings to hex', () => {
    expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(normalizeColor('rgb(51, 136, 255)')).toBe('#3388ff');
  });

  it('converts named CSS colors', () => {
    expect(normalizeColor('red')).toBe('#ff0000');
    expect(normalizeColor('rebeccapurple')).toBe('#663399');
  });

  it('converts HSL and HSLA strings while ignoring alpha', () => {
    expect(normalizeColor('hsl(120, 60%, 40%)')).toBe('#29a329');
    expect(normalizeColor('hsla(120, 60%, 40%, 0.5)')).toBe('#29a329');
  });

  it('parses decimal and percentage RGB channels', () => {
    expect(normalizeColor('rgb(51.5, 136.2, 254.6)')).toBe('#3488ff');
    expect(normalizeColor('rgb(10%, 20%, 30%)')).toBe('#1a334d');
  });

  it('trims whitespace and parses case-insensitively', () => {
    expect(normalizeColor('  ReD  ')).toBe('#ff0000');
    expect(normalizeColor('RGB(255, 0, 0)')).toBe('#ff0000');
  });

  it('converts RGBA strings to hex (ignores alpha)', () => {
    expect(normalizeColor('rgba(255, 0, 0, 0.5)')).toBe('#ff0000');
  });

  it('ignores alpha in hex strings', () => {
    expect(normalizeColor('#ff000080')).toBe('#ff0000');
  });

  it('converts RGB arrays to hex', () => {
    expect(normalizeColor([255, 0, 0])).toBe('#ff0000');
    expect(normalizeColor([51, 136, 255])).toBe('#3388ff');
  });

  it('handles RGBA arrays (ignores alpha)', () => {
    expect(normalizeColor([255, 0, 0, 0.5])).toBe('#ff0000');
  });

  it('returns null for invalid colors and unsupported values', () => {
    expect(normalizeColor(null)).toBeNull();
    expect(normalizeColor(undefined)).toBeNull();
    expect(normalizeColor('invalid')).toBeNull();
    expect(normalizeColor('#gggggg')).toBeNull();
    expect(normalizeColor('rgb(1,2)')).toBeNull();
    expect(normalizeColor({})).toBeNull();
  });

  it('rejects short arrays and invalid RGB channels', () => {
    expect(normalizeColor([255, 0])).toBeNull();
    expect(normalizeColor([255, '0', 0])).toBeNull();
    expect(normalizeColor([255, Number.NaN, 0])).toBeNull();
    expect(normalizeColor([255, Number.POSITIVE_INFINITY, 0])).toBeNull();
  });
});
