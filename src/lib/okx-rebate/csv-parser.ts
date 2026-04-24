import type { OkxRebateRow } from "./types";

/**
 * OKX 리베이트 CSV 텍스트를 파싱하여 OkxRebateRow[] 반환.
 * 컬럼 순서: BrokerCode,Level,InstId,OrderId,SpotTradeAmt,
 *   DerivativeTradeAmt,Fee,BrokerRebate,NetFee,SettlementFee,
 *   SubBrokerRebate,UserRebate,Affiliate,TS
 */
export function parseCsv(csvText: string): OkxRebateRow[] {
  const lines = csvText.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];

  const rows: OkxRebateRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(",");
    if (fields.length !== 14) continue;

    rows.push({
      brokerCode: fields[0],
      level: fields[1],
      instId: fields[2],
      orderId: fields[3],
      spotTradeAmt: parseFloat(fields[4]) || 0,
      derivativeTradeAmt: parseFloat(fields[5]) || 0,
      fee: parseFloat(fields[6]) || 0,
      brokerRebate: parseFloat(fields[7]) || 0,
      netFee: parseFloat(fields[8]) || 0,
      settlementFee: parseFloat(fields[9]) || 0,
      subBrokerRebate: parseFloat(fields[10]) || 0,
      userRebate: parseFloat(fields[11]) || 0,
      affiliated: fields[12] === "true",
      ts: parseInt(fields[13], 10) || 0,
    });
  }

  return rows;
}
