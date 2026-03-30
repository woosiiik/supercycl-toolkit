import { describe, it, expect } from 'vitest';
import { validateAddress } from './validation';

describe('validateAddress', () => {
  it('returns null for a valid lowercase address', () => {
    expect(validateAddress('0x1234567890abcdef1234567890abcdef12345678')).toBeNull();
  });

  it('returns null for a valid uppercase address', () => {
    expect(validateAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBeNull();
  });

  it('returns null for a valid mixed-case address', () => {
    expect(validateAddress('0xAbCdEf1234567890aBcDeF1234567890AbCdEf12')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateAddress('')).toBe('유효한 이더리움 주소를 입력해주세요 (0x로 시작하는 42자리)');
  });

  it('returns error for address without 0x prefix', () => {
    expect(validateAddress('1234567890abcdef1234567890abcdef12345678')).toBe(
      '유효한 이더리움 주소를 입력해주세요 (0x로 시작하는 42자리)'
    );
  });

  it('returns error for address that is too short', () => {
    expect(validateAddress('0x1234')).toBe(
      '유효한 이더리움 주소를 입력해주세요 (0x로 시작하는 42자리)'
    );
  });

  it('returns error for address that is too long', () => {
    expect(validateAddress('0x1234567890abcdef1234567890abcdef123456789')).toBe(
      '유효한 이더리움 주소를 입력해주세요 (0x로 시작하는 42자리)'
    );
  });

  it('returns error for address with non-hex characters', () => {
    expect(validateAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(
      '유효한 이더리움 주소를 입력해주세요 (0x로 시작하는 42자리)'
    );
  });
});
