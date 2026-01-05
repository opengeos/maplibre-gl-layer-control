/**
 * Format a numeric value based on the step size
 * @param value Numeric value to format
 * @param step Step size (determines decimal places)
 * @returns Formatted string
 */
export function formatNumericValue(value: number, step: number): string {
  let decimals = 0;

  if (step && Number(step) !== 1) {
    const stepNumber = Number(step);
    if (stepNumber > 0 && stepNumber < 1) {
      decimals = Math.min(4, Math.ceil(Math.abs(Math.log10(stepNumber))));
    }
  }

  return value.toFixed(decimals);
}

/**
 * Clamp a numeric value between min and max
 * @param value Value to clamp
 * @param min Minimum value
 * @param max Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
