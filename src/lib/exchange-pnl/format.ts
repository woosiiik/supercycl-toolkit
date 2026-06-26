// PnL 표시용 적응형 숫자 포맷.
// 펀딩처럼 sub-cent(예: 0.0022871) 값이 2자리 반올림으로 0.00 처럼 보이지 않도록
// 절대값이 작을수록 더 많은 소수 자릿수를 보여준다.
/** ISO 문자열/ms → "YYYY-MM-DD HH:MM:SS UTC" (항상 UTC 0 기준) */
export function fmtUtc(ts: string | number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

export function fmtAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // 1 미만은 지수표기 없이 십진수로. 작을수록 자릿수를 늘려 유효숫자 ~4자리 확보,
  // 후행 0은 정리. (예: 6.87e-4 → "0.000687")
  const leadingZeros = Math.max(0, Math.floor(-Math.log10(abs)));
  const decimals = Math.min(leadingZeros + 4, 20);
  return n
    .toFixed(decimals)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}
