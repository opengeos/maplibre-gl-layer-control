import { describe, it, expect } from 'vitest';
import { formatNumericValue, clamp } from '../src/lib/utils/formatters';

describe('formatNumericValue', () => {
  it('formats integers with step of 1', () => {
    expect(formatNumericValue(5, 1)).toBe('5');
    expect(formatNumericValue(100, 1)).toBe('100');
  });

  it('formats decimals based on step size', () => {
    expect(formatNumericValue(0.5, 0.1)).toBe('0.5');
    expect(formatNumericValue(0.55, 0.01)).toBe('0.55');
    expect(formatNumericValue(0.555, 0.001)).toBe('0.555');
  });

  it('handles step of 0', () => {
    expect(formatNumericValue(5, 0)).toBe('5');
  });

  it('rounds to appropriate decimal places', () => {
    expect(formatNumericValue(0.12345, 0.01)).toBe('0.12');
    expect(formatNumericValue(0.999, 0.1)).toBe('1.0');
  });
});

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('clamps to minimum when value is too low', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(-0.5, 0, 1)).toBe(0);
  });

  it('clamps to maximum when value is too high', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(1.5, 0, 1)).toBe(1);
  });

  it('handles edge cases at boundaries', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('handles negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(0, -10, -1)).toBe(-1);
    expect(clamp(-15, -10, -1)).toBe(-10);
  });
});
