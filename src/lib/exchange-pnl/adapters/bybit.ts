import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../types";
import { fetchJson, hmacSha256Hex, buildQuery, splitWindows, num, DAY_MS } from "./util";

// Bybit — [A-] 청산오더 단위 손익. GET /v5/position/closed-pnl
// 인증: HMAC SHA256. sign = hmac(secret, ts + apiKey + recvWindow + queryString)
// category=linear, 단일요청 7일 윈도우 → 7일 청크 + nextPageCursor 순회.
// closedPnl 단위는 "청산 주문" → hold time 불가, 승/패는 청산오더 근사.
// 펀딩은 closed-pnl에 없어 transaction-log(type=SETTLEMENT)에서 별도 수집(실제 발생일 귀속).

const BASE = "https://api.bybit.com";
const PATH = "/v5/position/closed-pnl";
const TXLOG_PATH = "/v5/account/transaction-log";
const RECV = "5000";
const MAX_PAGES = 20;
const WINDOW = 7 * DAY_MS;

function bybitGet(
  apiKey: string,
  apiSecret: string,
  path: string,
  qs: string,
): ReturnType<typeof fetchJson> {
  const ts = Date.now().toString();
  const sign = hmacSha256Hex(apiSecret, ts + apiKey + RECV + qs);
  return fetchJson(`${path} ${qs.slice(0, 40)}`, `${BASE}${path}?${qs}`, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": RECV,
      "X-BAPI-SIGN": sign,
    },
  });
}

export async function collectBybit(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  warnings.push("Bybit는 청산오더 단위 데이터입니다 — hold time 미지원, 승/패·승률은 청산오더 기준 근사입니다. 펀딩은 transaction-log(SETTLEMENT)에서 별도 수집합니다.");

  const windows = splitWindows(req.startTime, req.endTime, WINDOW);

  // === ① 청산손익 (closed-pnl) ===
  for (const w of windows) {
    const tag = new Date(w.start).toISOString().slice(0, 10);
    let cursor = "";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = buildQuery({ category: "linear", limit: 100, startTime: w.start, endTime: w.end, cursor });
      requestCount++;
      const { page: rp, ok, body } = await bybitGet(apiKey, apiSecret, PATH, qs);
      rp.label = `closed-pnl ${tag} p${page}`;
      rawPages.push(rp);

      const b = body as { retCode?: number; retMsg?: string; result?: { list?: BybitClosed[]; nextPageCursor?: string } };
      if (!ok || (b?.retCode !== undefined && b.retCode !== 0)) {
        warnings.push(`Bybit closed-pnl 오류 (${tag} p${page}): retCode=${b?.retCode} msg=${b?.retMsg ?? rp.status}`);
        break;
      }
      const list = b?.result?.list ?? [];
      for (const d of list) rows.push(normalize(d));
      cursor = b?.result?.nextPageCursor ?? "";
      if (!cursor || list.length === 0) break;
    }
  }

  // === ② 펀딩 (transaction-log, type=SETTLEMENT) ===
  for (const w of windows) {
    const tag = new Date(w.start).toISOString().slice(0, 10);
    let cursor = "";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = buildQuery({
        accountType: "UNIFIED",
        category: "linear",
        type: "SETTLEMENT",
        limit: 50, // transaction-log 최대 50
        startTime: w.start,
        endTime: w.end,
        cursor,
      });
      requestCount++;
      const { page: rp, ok, body } = await bybitGet(apiKey, apiSecret, TXLOG_PATH, qs);
      rp.label = `transaction-log(SETTLEMENT) ${tag} p${page}`;
      rawPages.push(rp);

      const b = body as { retCode?: number; retMsg?: string; result?: { list?: BybitTxLog[]; nextPageCursor?: string } };
      if (!ok || (b?.retCode !== undefined && b.retCode !== 0)) {
        warnings.push(`Bybit transaction-log 오류 (${tag} p${page}): retCode=${b?.retCode} msg=${b?.retMsg ?? rp.status}`);
        break;
      }
      const list = b?.result?.list ?? [];
      for (const d of list) rows.push(normalizeFunding(d));
      cursor = b?.result?.nextPageCursor ?? "";
      if (!cursor || list.length === 0) break;
    }
  }

  return {
    exchange: "bybit",
    rows,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [PATH, TXLOG_PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface BybitClosed {
  symbol?: string;
  side?: string; // 청산 주문의 side (Buy/Sell)
  closedPnl?: string;
  openFee?: string;
  closeFee?: string;
  orderId?: string;
  createdTime?: string;
  updatedTime?: string;
}

function normalize(d: BybitClosed): NormalizedRow {
  const close = num(d.updatedTime ?? d.createdTime);
  const net = num(d.closedPnl); // 수수료 포함 여부 실데이터 검증 권장
  const fee = -(num(d.openFee) + num(d.closeFee));
  // closedPnl을 net으로 두고 fee는 별도 표기. pricePnl = net - fee 로 근사.
  return {
    exchange: "bybit",
    id: d.orderId ?? `${d.symbol}-${close}`,
    symbol: d.symbol ?? "",
    side: null, // 청산오더 side는 포지션 방향과 반대라 미표기
    pricePnl: net - fee,
    fee,
    funding: 0,
    netPnl: net,
    openTime: null,
    closeTime: close,
    holdTimeMs: null,
    win: net > 0,
    unit: "closing_order",
  };
}

// transaction-log SETTLEMENT(펀딩) → 펀딩 전용 row (price/fee 0)
interface BybitTxLog {
  symbol?: string;
  type?: string; // SETTLEMENT
  funding?: string; // 펀딩 금액 (지급=음수)
  cashFlow?: string;
  change?: string;
  transactionTime?: string;
  id?: string;
}

function normalizeFunding(d: BybitTxLog): NormalizedRow {
  // 펀딩 금액: funding 우선, 없으면 cashFlow/change 폴백
  const amount =
    d.funding !== undefined && d.funding !== ""
      ? num(d.funding)
      : d.cashFlow !== undefined && d.cashFlow !== ""
        ? num(d.cashFlow)
        : num(d.change);
  const close = num(d.transactionTime);
  return {
    exchange: "bybit",
    id: d.id ?? `funding-${d.symbol}-${close}`,
    symbol: d.symbol ?? "",
    side: null,
    pricePnl: 0,
    fee: 0,
    funding: amount,
    netPnl: amount,
    openTime: null,
    closeTime: close,
    holdTimeMs: null,
    win: null, // 펀딩 원장이라 승/패 카운트 제외
    unit: "income",
  };
}
