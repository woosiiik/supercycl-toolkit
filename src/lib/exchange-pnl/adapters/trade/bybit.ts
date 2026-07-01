import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../../types";
import { fetchJson, hmacSha256Hex, buildQuery, splitWindows, num, DAY_MS } from "../util";

// Bybit 트레이드 방식 — 운영 웹앱(BybitPnl)과 동일.
// GET /v5/account/transaction-log (계정 원장) 전체를 change 로 합산.
// TRANSFER_IN/TRANSFER_OUT(이체)만 제외, 나머지는 모두 PnL. SETTLEMENT는 펀딩으로 분해.
// (UNIFIED 계정 기준. Classic 계정은 별도 엔드포인트가 필요할 수 있음.)

const HOSTS = ["https://api.bybit.com", "https://api.bytick.com"];
const PATH = "/v5/account/transaction-log";
const RECV = "5000";
const MAX_PAGES = 30;
const WINDOW = 7 * DAY_MS;

async function bybitGet(apiKey: string, apiSecret: string, qs: string) {
  let last: Awaited<ReturnType<typeof fetchJson>> | undefined;
  for (const host of HOSTS) {
    const ts = Date.now().toString();
    const sign = hmacSha256Hex(apiSecret, ts + apiKey + RECV + qs);
    const res = await fetchJson(`${PATH} ${qs.slice(0, 40)}`, `${host}${PATH}?${qs}`, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": ts,
        "X-BAPI-RECV-WINDOW": RECV,
        "X-BAPI-SIGN": sign,
      },
    });
    last = res;
    if (res.page.status !== 403) return res;
  }
  return last!;
}

export async function collectBybitTrade(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  warnings.push("Bybit 트레이드 방식 — transaction-log(계정 원장) 전체 합산(TRANSFER만 제외, SETTLEMENT=펀딩). 운영 웹앱과 동일. 보유시간·포지션 승/패는 제공되지 않습니다. UNIFIED 계정 기준.");

  const windows = splitWindows(req.startTime, req.endTime, WINDOW);
  for (const w of windows) {
    const tag = new Date(w.start).toISOString().slice(0, 10);
    let cursor = "";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = buildQuery({
        accountType: "UNIFIED",
        category: "linear",
        currency: "USDT",
        limit: 50,
        startTime: w.start,
        endTime: w.end,
        cursor,
      });
      requestCount++;
      const { page: rp, ok, body } = await bybitGet(apiKey, apiSecret, qs);
      rp.label = `transaction-log ${tag} p${page}`;
      rawPages.push(rp);

      const b = body as { retCode?: number; retMsg?: string; result?: { list?: BybitTxLog[]; nextPageCursor?: string } };
      if (!ok || (b?.retCode !== undefined && b.retCode !== 0)) {
        if (rp.status === 403) {
          warnings.push("Bybit HTTP 403 — 서버 IP/지역 차단. 비-미국 리전에서 실행해야 합니다.");
        }
        warnings.push(`Bybit transaction-log 오류 (${tag} p${page}): retCode=${b?.retCode} msg=${b?.retMsg ?? rp.status}`);
        break;
      }
      const list = b?.result?.list ?? [];
      for (const d of list) {
        const row = normalize(d);
        if (row) rows.push(row);
      }
      cursor = b?.result?.nextPageCursor ?? "";
      if (!cursor || list.length === 0) break;
    }
  }

  return {
    exchange: "bybit",
    rows,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface BybitTxLog {
  symbol?: string;
  type?: string; // TRADE / SETTLEMENT / TRANSFER_IN / TRANSFER_OUT / ...
  change?: string; // 잔액 순변동
  cashFlow?: string;
  transactionTime?: string;
  id?: string;
  tradeId?: string;
}

function normalize(d: BybitTxLog): NormalizedRow | null {
  const type = d.type ?? "";
  // 이체는 PnL 아님 → 제외
  if (type === "TRANSFER_IN" || type === "TRANSFER_OUT") return null;
  const change = num(d.change);
  if (change === 0) return null;
  const close = num(d.transactionTime);
  const isFunding = type === "SETTLEMENT";
  return {
    exchange: "bybit",
    id: d.id ?? d.tradeId ?? `${type}-${d.symbol}-${close}`,
    symbol: d.symbol ?? "",
    side: null,
    pricePnl: isFunding ? 0 : change, // 수수료는 change에 포함(운영과 동일, 별도 분리 안 함)
    fee: 0,
    funding: isFunding ? change : 0,
    netPnl: change,
    openTime: null,
    closeTime: close,
    holdTimeMs: null,
    win: null,
    unit: isFunding ? "income" : "fill",
  };
}
