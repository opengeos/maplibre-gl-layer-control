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
 * Normalize a color value to hex format
 * Handles hex strings, RGB strings, and RGB arrays
 * @param value Color value in various formats
 * @returns Normalized hex color string (always 6 digits)
 */
export function normalizeColor(value: any): string {
  if (typeof value === 'string') {
    // Already hex format
    if (value.startsWith('#')) {
      // Expand shorthand hex (#RGB to #RRGGBB)
      if (value.length === 4) {
        const r = value[1];
        const g = value[2];
        const b = value[3];
        return `#${r}${r}${g}${g}${b}${b}`;
      }
      return value;
    }

    // RGB string format: 'rgb(51, 136, 255)'
    if (value.startsWith('rgb')) {
      const match = value.match(/\d+/g);
      if (match && match.length >= 3) {
        const [r, g, b] = match.map((num) => parseInt(num, 10));
        return rgbToHex(r, g, b);
      }
    }
  } else if (Array.isArray(value) && value.length >= 3) {
    // RGB array format: [51, 136, 255]
    return rgbToHex(value[0], value[1], value[2]);
  }

  // Fallback color (MapLibre default blue)
  return '#3388ff';
}
