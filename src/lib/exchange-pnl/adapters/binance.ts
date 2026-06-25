import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../types";
import { fetchJson, hmacSha256Hex, buildQuery, num } from "./util";

// Binance (USDT-M) — [B] income 방식. GET /fapi/v1/income
// 인증: HMAC SHA256, header X-MBX-APIKEY, signature 쿼리 append. timestamp 필수.
// REALIZED_PNL/COMMISSION/FUNDING_FEE 타입만 컴포넌트로 사용. 포지션 단위(hold/승패) 불가.
// income 한 행 = 컴포넌트 1개 → row 1개 (집계 시 일별/심볼별로 합산).

const BASE = "https://fapi.binance.com";
const PATH = "/fapi/v1/income";
const MAX_PAGES = 50;
const COMPONENT_TYPES = new Set(["REALIZED_PNL", "COMMISSION", "FUNDING_FEE"]);

export async function collectBinance(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  warnings.push("Binance는 income 원장 합산 방식입니다 — 일별/30일/심볼별 PnL만 정확하며 hold time·포지션 승/패는 제공되지 않습니다.");

  let startTime = req.startTime;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params: Record<string, string | number> = {
      startTime,
      endTime: req.endTime,
      limit: 1000,
      timestamp: Date.now(),
    };
    const qs = buildQuery(params);
    const sign = hmacSha256Hex(apiSecret, qs);
    const url = `${BASE}${PATH}?${qs}&signature=${sign}`;
    requestCount++;
    const { page: rp, ok, body } = await fetchJson(`income p${page}`, url, {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    rawPages.push(rp);

    if (!ok) {
      const b = body as { code?: number; msg?: string };
      warnings.push(`Binance 응답 오류 (p${page}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
      break;
    }
    const list = (Array.isArray(body) ? body : []) as BinanceIncome[];
    for (const d of list) {
      const row = normalize(d);
      if (row) rows.push(row);
    }
    if (list.length < 1000) break;
    // 다음 페이지: 마지막 time + 1ms
    const lastTime = num(list[list.length - 1]?.time);
    if (!lastTime || lastTime + 1 <= startTime) break;
    startTime = lastTime + 1;
  }

  return {
    exchange: "binance",
    rows,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface BinanceIncome {
  symbol?: string;
  incomeType?: string;
  income?: string;
  time?: number;
  tranId?: number | string;
}

function normalize(d: BinanceIncome): NormalizedRow | null {
  const type = d.incomeType ?? "";
  if (!COMPONENT_TYPES.has(type)) return null; // TRANSFER 등 제외
  const amount = num(d.income);
  const isRealized = type === "REALIZED_PNL";
  const isFunding = type === "FUNDING_FEE";
  const isFee = type === "COMMISSION";
  return {
    exchange: "binance",
    id: `${d.tranId ?? ""}-${type}`,
    symbol: d.symbol ?? "",
    side: null,
    pricePnl: isRealized ? amount : 0,
    fee: isFee ? amount : 0,
    funding: isFunding ? amount : 0,
    netPnl: amount,
    openTime: null,
    closeTime: num(d.time),
    holdTimeMs: null,
    win: null, // income 단위라 포지션 승/패 불가
    unit: "income",
  };
}
