import type { NormalizedRow, ReconstructedPosition } from "../../types";

// 네이티브 포지션 히스토리(unit:"position" 정규화 row)를 포지션 재구성 구조로 변환.
// tier-A(OKX·BingX·Bitget·Gate)는 거래소가 닫힌 포지션을 직접 제공하므로 재구성 없이 그대로 매핑한다.
// (크기·fill수는 포지션 히스토리에 없어 미표시. 모두 청산 완료 포지션이므로 open=false.)
export function nativeToReconstructed(rows: NormalizedRow[]): ReconstructedPosition[] {
  const out: ReconstructedPosition[] = [];
  for (const r of rows) {
    if (r.unit !== "position") continue;
    out.push({
      exchange: r.exchange,
      coin: r.symbol,
      side: r.side ?? "long",
      openTime: r.openTime,
      closeTime: r.closeTime,
      holdTimeMs: r.holdTimeMs,
      maxSize: 0,
      pricePnl: r.pricePnl,
      fee: r.fee,
      funding: r.funding,
      netPnl: r.netPnl,
      win: r.win,
      fillCount: 0,
      orphan: false,
      open: false,
    });
  }
  return out;
}
