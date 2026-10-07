import { colord, extend } from 'colord';
import namesPlugin from 'colord/plugins/names';

extend([namesPlugin]);

/**
 * Convert RGB values to hex color string
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 * @returns Hex color string (e.g., '#ff0000')
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => {
    const hex = clamp(v).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Normalize a color value to six-digit RGB hex.
 * String values are parsed as CSS colors; numeric arrays use RGB byte channels.
 * Alpha channels are ignored.
 * @param value Color value in CSS string or RGB(A) array format
 * @returns Normalized hex color string, or null when the value is invalid
 */
export function normalizeColor(value: unknown): string | null {
  if (typeof value === 'string') {
    const color = colord(value);
    if (!color.isValid()) return null;
    const { r, g, b } = color.toRgb();
    return rgbToHex(r, g, b);
  }

  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b] = value;
    if (
      typeof r === 'number' &&
      Number.isFinite(r) &&
      typeof g === 'number' &&
      Number.isFinite(g) &&
      typeof b === 'number' &&
      Number.isFinite(b)
    ) {
      return rgbToHex(r, g, b);
    }
  }

  return null;
}
