import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../types";
import { fetchJson, hmacSha256Hex, buildQuery, splitWindows, num, DAY_MS } from "./util";

// BingX — [A] 포지션 히스토리. GET /openApi/swap/v1/trade/positionHistory
// positionHistory는 symbol 필수지만, income 원장(symbol 선택)에서 거래 심볼을 먼저 자동 추출 가능.
// 인증: HMAC SHA256, header X-BX-APIKEY, signature 쿼리 append.
// netProfit = realisedProfit + positionCommission + totalFunding (분해 제공).
// 주의: 요청 span 최대 3개월 → 89일 윈도우로 분할.
// 주의: startTs/endTs가 오픈/종료 어느 시각 기준인지 미문서화 — 조회 범위보다 먼저 열려
// 범위 안에서 닫힌 포지션이 누락될 수 있어, 조회 시작을 89일 앞당긴 뒤 결과를
// 종료 시각(updateTime) 기준으로 요청 범위로 필터링한다.

const BASE = "https://open-api.bingx.com";
const PATH = "/openApi/swap/v1/trade/positionHistory";
const INCOME_PATH = "/openApi/swap/v2/user/income";
const MAX_PAGES = 20;
const WINDOW = 89 * DAY_MS;
const LOOKBACK_MS = 89 * DAY_MS;
// income 원장은 운영(WAS)과 동일하게 30일 윈도우로 분할 조회
const INCOME_WINDOW = 30 * DAY_MS;

export async function collectBingx(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret, symbols } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  let symbolList = (symbols || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 범위 직전에 열려 범위 안에서 닫힌 포지션 포착용 — 조회 시작을 89일 앞당김
  const queryStart = Math.max(0, req.startTime - LOOKBACK_MS);

  // 심볼 미입력 시 income 원장에서 거래 심볼 자동 추출
  if (symbolList.length === 0) {
    const derived = await deriveSymbolsFromIncome(apiKey, apiSecret, queryStart, req.endTime);
    rawPages.push(...derived.rawPages);
    requestCount += derived.requestCount;
    symbolList = derived.symbols;
    if (derived.error) {
      warnings.push(`심볼 자동추출 실패: ${derived.error} — '조회 심볼'에 직접 입력하면 우회할 수 있습니다.`);
    } else if (symbolList.length === 0) {
      warnings.push("income 원장에서 거래 심볼을 찾지 못했습니다 (해당 기간 BingX 선물 거래 없음 또는 키 권한 확인 필요).");
    } else {
      warnings.push(`income 원장에서 ${symbolList.length}개 심볼 자동 추출: ${symbolList.join(", ")}`);
    }
  }

  const windows = splitWindows(queryStart, req.endTime, WINDOW);
  const seen = new Set<string>();
  for (const symbol of symbolList) {
    win: for (const w of windows) {
      const tag = `${symbol} ${new Date(w.start).toISOString().slice(0, 10)}`;
      for (let pageId = 0; pageId < MAX_PAGES; pageId++) {
        const params: Record<string, string | number> = {
          symbol,
          startTs: w.start,
          endTs: w.end,
          pageIndex: pageId,
          pageSize: 100,
          timestamp: Date.now(),
        };
        // BingX 서명: 쿼리스트링(파라미터 순서 그대로) 을 HMAC SHA256
        const qs = buildQuery(params);
        const sign = hmacSha256Hex(apiSecret, qs);
        const url = `${BASE}${PATH}?${qs}&signature=${sign}`;
        requestCount++;
        const { page: rp, ok, body } = await fetchJson(`positionHistory ${tag} p${pageId}`, url, {
          method: "GET",
          headers: { "X-BX-APIKEY": apiKey },
        });
        rawPages.push(rp);

        const b = body as { code?: number; msg?: string; data?: { positionHistory?: BingxPos[] } | BingxPos[] };
        if (!ok || (b?.code !== undefined && b.code !== 0)) {
          warnings.push(`BingX 응답 오류 (${tag} p${pageId}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
          break win;
        }
        // data 형태: { positionHistory: [...] } 또는 배열 (버전차 대응)
        const list: BingxPos[] = Array.isArray(b?.data)
          ? (b.data as BingxPos[])
          : ((b?.data as { positionHistory?: BingxPos[] })?.positionHistory ?? []);
        for (const d of list) {
          const row = normalize(d, symbol);
          // lookback으로 넓힌 조회 — 요청 범위 밖에서 닫힌 포지션 제외, 윈도우 간 중복 dedupe
          if (row.closeTime < req.startTime || row.closeTime > req.endTime) continue;
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          rows.push(row);
        }
        if (list.length < 100) break;
      }
    }
  }

  return {
    exchange: "bingx",
    rows,
    rawPages,
    warnings,
    meta: {
      requestCount,
      endpoints: symbolList.length ? [INCOME_PATH, PATH] : [INCOME_PATH],
      startTime: req.startTime,
      endTime: req.endTime,
    },
  };
}

interface BingxIncome {
  symbol?: string;
  incomeType?: string;
  income?: string;
  time?: number;
}

// income 원장(symbol 선택)에서 거래에 등장한 distinct 심볼을 추출.
async function deriveSymbolsFromIncome(
  apiKey: string,
  apiSecret: string,
  startTime: number,
  endTime: number,
): Promise<{ symbols: string[]; rawPages: RawPage[]; requestCount: number; error?: string }> {
  const rawPages: RawPage[] = [];
  const found = new Set<string>();
  let requestCount = 0;
  let error: string | undefined;

  const windows = splitWindows(startTime, endTime, INCOME_WINDOW);
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
        error = `code=${b?.code} msg=${b?.msg ?? rp.status}`;
        return { symbols: [...found], rawPages, requestCount, error };
      }
      const list = Array.isArray(b?.data) ? b.data : [];
      for (const it of list) {
        if (it.symbol) found.add(it.symbol);
      }
      if (list.length < 1000) break;
      const lastTime = num(list[list.length - 1]?.time);
      if (!lastTime || lastTime + 1 <= cursorStart) break;
      cursorStart = lastTime + 1;
    }
  }

  return { symbols: [...found], rawPages, requestCount };
}

interface BingxPos {
  positionId?: string;
  symbol?: string;
  positionSide?: string; // LONG/SHORT
  realisedProfit?: string;
  netProfit?: string;
  positionCommission?: string;
  totalFunding?: string;
  openTime?: number | string;
  updateTime?: number | string;
  closeTime?: number | string;
  leverage?: number | string;
}

function normalize(d: BingxPos, fallbackSymbol: string): NormalizedRow {
  const open = num(d.openTime);
  const close = num(d.updateTime ?? d.closeTime);
  const price = num(d.realisedProfit);
  const fee = num(d.positionCommission);
  const funding = num(d.totalFunding);
  const net = d.netProfit !== undefined ? num(d.netProfit) : price + fee + funding;
  const ps = (d.positionSide || "").toLowerCase();
  return {
    exchange: "bingx",
    id: d.positionId ?? `${fallbackSymbol}-${open}-${close}`,
    symbol: d.symbol ?? fallbackSymbol,
    side: ps === "long" || ps === "short" ? (ps as "long" | "short") : null,
    pricePnl: price,
    fee,
    funding,
    netPnl: net,
    openTime: open || null,
    closeTime: close,
    holdTimeMs: open && close ? close - open : null,
    win: net > 0,
    unit: "position",
    leverage: num(d.leverage) || null,
  };
}
