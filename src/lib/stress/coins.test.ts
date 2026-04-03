import { describe, it, expect } from 'vitest';
import { pickRandomCoin, calculateLimitPrice } from './coins';
import type { CoinInfo } from '@/types/stress';

describe('pickRandomCoin', () => {
  it('returns a coin from the array', () => {
    const coins: CoinInfo[] = [
      { name: 'BTC', index: 0, szDecimals: 5, maxLeverage: 50 },
      { name: 'ETH', index: 1, szDecimals: 4, maxLeverage: 50 },
    ];
    const result = pickRandomCoin(coins);
    expect(coins).toContainEqual(result);
  });

  it('returns the only coin when array has one element', () => {
    const coins: CoinInfo[] = [
      { name: 'BTC', index: 0, szDecimals: 5, maxLeverage: 50 },
    ];
    expect(pickRandomCoin(coins)).toEqual(coins[0]);
  });
});

describe('calculateLimitPrice', () => {
  it('returns 50% of mid price with correct decimals', () => {
    // 100 * 0.5 = 50, szDecimals=2 → "50.00"
    expect(calculateLimitPrice('100', 2)).toBe('50.00');
  });

  it('rounds to szDecimals correctly', () => {
    // 33.333 * 0.5 = 16.6665, szDecimals=2 → "16.67"
    expect(calculateLimitPrice('33.333', 2)).toBe('16.67');
  });

  it('handles szDecimals=0', () => {
    // 99.9 * 0.5 = 49.95, szDecimals=0 → "50"
    expect(calculateLimitPrice('99.9', 0)).toBe('50');
  });

  it('handles high precision szDecimals', () => {
    // 1.23456789 * 0.5 = 0.617283945, szDecimals=8 → "0.61728395"
    expect(calculateLimitPrice('1.23456789', 8)).toBe('0.61728395');
  });

  it('result is always less than original mid price', () => {
    const mid = '50000';
    const result = parseFloat(calculateLimitPrice(mid, 2));
    expect(result).toBeLessThan(parseFloat(mid));
  });
});
