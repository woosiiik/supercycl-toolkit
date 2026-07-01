import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../../types";
import { fetchJson, hmacSha256Hex, buildQuery, splitWindows, num, DAY_MS } from "../util";

// BingX 트레이드 방식 — income 원장(GET /openApi/swap/v2/user/income) 합산.
// REALIZED_PNL/COMMISSION/FUNDING_FEE 타입만 컴포넌트로 사용 (Binance income과 동일 모델).
// 포지션 종료 여부 무관, 거래 발생일 귀속. 보유시간·포지션 승/패 불가.
// 인증: HMAC SHA256, header X-BX-APIKEY, signature 쿼리 append.

const BASE = "https://open-api.bingx.com";
const INCOME_PATH = "/openApi/swap/v2/user/income";
const MAX_PAGES = 30;
const WINDOW = 30 * DAY_MS; // 운영 웹앱과 동일하게 30일 윈도우

export async function collectBingxTrade(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  warnings.push("BingX 트레이드 방식 — income 원장 합산(TRANSFER만 제외, 거래 발생일 귀속). 운영 웹앱과 동일. 보유시간·포지션 승/패는 제공되지 않습니다.");

  const windows = splitWindows(req.startTime, req.endTime, WINDOW);
  for (const w of windows) {
    let cursorStart = w.start;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params: Record<string, string | number> = {
        startTime: cursorStart,
        endTime: w.end,
        limit: 1000,
        timestamp: Date.now(),
      };
      const qs = buildQuery(params);
      const sign = hmacSha256Hex(apiSecret, qs);
      const url = `${BASE}${INCOME_PATH}?${qs}&signature=${sign}`;
      requestCount++;
      const { page: rp, ok, body } = await fetchJson(
        `income ${new Date(w.start).toISOString().slice(0, 10)} p${page}`,
        url,
        { method: "GET", headers: { "X-BX-APIKEY": apiKey } },
      );
      rawPages.push(rp);

      const b = body as { code?: number; msg?: string; data?: BingxIncome[] };
      if (!ok || (b?.code !== undefined && b.code !== 0)) {
        warnings.push(`BingX income 오류 (p${page}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
        break;
      }
      const list = Array.isArray(b?.data) ? b.data : [];
      for (const d of list) {
        const row = normalize(d);
        if (row) rows.push(row);
      }
      if (list.length < 1000) break;
      const lastTime = num(list[list.length - 1]?.time);
      if (!lastTime || lastTime + 1 <= cursorStart) break;
      cursorStart = lastTime + 1;
    }
  }

  return {
    exchange: "bingx",
    rows,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [INCOME_PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface BingxIncome {
  symbol?: string;
  incomeType?: string;
  income?: string;
  time?: number;
  tranId?: number | string;
  tradeId?: number | string;
}

function normalize(d: BingxIncome): NormalizedRow | null {
  const type = d.incomeType ?? "";
  if (type === "TRANSFER") return null; // 이체(dnw)는 PnL 아님 → 제외
  const amount = num(d.income);
  if (amount === 0) return null;
  const isFunding = type === "FUNDING_FEE";
  const isFee = type === "COMMISSION" || type === "FEE";
  // REALIZED_PNL 및 기타 비-이체 항목은 실현손익으로 귀속
  return {
    exchange: "bingx",
    id: `${d.tranId ?? d.tradeId ?? ""}-${type}-${d.time ?? ""}`,
    symbol: d.symbol ?? "",
    side: null,
    pricePnl: isFunding || isFee ? 0 : amount,
    fee: isFee ? amount : 0,
    funding: isFunding ? amount : 0,
    netPnl: amount,
    openTime: null,
    closeTime: num(d.time),
    holdTimeMs: null,
    win: null,
    unit: isFunding || isFee ? "income" : "fill",
  };
}
