const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export function validateAddress(address: string): string | null {
  if (ADDRESS_REGEX.test(address)) {
    return null;
  }
  return "유효한 이더리움 주소를 입력해주세요 (0x로 시작하는 42자리)";
}
