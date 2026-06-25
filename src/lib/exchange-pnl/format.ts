// PnL 표시용 적응형 숫자 포맷.
// 펀딩처럼 sub-cent(예: 0.0022871) 값이 2자리 반올림으로 0.00 처럼 보이지 않도록
// 절대값이 작을수록 더 많은 소수 자릿수를 보여준다.
export function fmtAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs < 0.001) return n.toExponential(2); // 극소값은 지수표기
  if (abs < 0.01) return n.toFixed(6);
  if (abs < 1) return n.toFixed(4);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
