import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../types";
import { fetchJson, hmacSha256Base64, buildQuery, splitWindows, num, DAY_MS } from "./util";

// Bitget — [A] 포지션 히스토리. GET /api/v2/mix/position/history-position
// 인증: key+secret+passphrase, sign=base64(hmac-sha256(secret, ts+method+requestPath+body))
// productType=USDT-FUTURES 로 전체 심볼 일괄. idLessThan 커서(응답 endId).
// 주의: startTime~endTime 간격은 90일 초과 불가 → 89일 윈도우로 분할.

const BASE = "https://api.bitget.com";
const PATH = "/api/v2/mix/position/history-position";
const MAX_PAGES = 30;
const WINDOW = 89 * DAY_MS;

export async function collectBitget(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret, passphrase } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  const windows = splitWindows(req.startTime, req.endTime, WINDOW);
  outer: for (const w of windows) {
    const tag = `${new Date(w.start).toISOString().slice(0, 10)}`;
    let idLessThan = "";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = buildQuery({
        productType: "USDT-FUTURES",
        limit: 100,
        startTime: w.start,
        endTime: w.end,
        idLessThan,
      });
      const requestPath = `${PATH}?${qs}`;
      const ts = Date.now().toString();
      const sign = hmacSha256Base64(apiSecret, ts + "GET" + requestPath);
      requestCount++;
      const { page: rp, ok, body } = await fetchJson(`history-position ${tag} p${page}`, BASE + requestPath, {
        method: "GET",
        headers: {
          "ACCESS-KEY": apiKey,
          "ACCESS-SIGN": sign,
          "ACCESS-TIMESTAMP": ts,
          "ACCESS-PASSPHRASE": passphrase,
          locale: "en-US",
          "Content-Type": "application/json",
        },
      });
      rawPages.push(rp);

      const b = body as { code?: string; msg?: string; data?: { list?: BitgetPos[]; endId?: string } };
      if (!ok || (b?.code && b.code !== "00000")) {
        warnings.push(`Bitget 응답 오류 (${tag} p${page}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
        break outer;
      }
      const list = b?.data?.list ?? [];
      for (const d of list) rows.push(normalize(d));
      const endId = b?.data?.endId;
      if (list.length < 100 || !endId) break;
      idLessThan = endId;
    }
  }

  return {
    exchange: "bitget",
    rows,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface BitgetPos {
  positionId?: string;
  symbol?: string;
  holdSide?: string; // long/short
  openAvgPrice?: string;
  closeAvgPrice?: string;
  ctime?: string;
  utime?: string;
  openFee?: string;
  closeFee?: string;
  totalFunding?: string;
  pnl?: string; // 실현손익(가격)
  netProfit?: string; // 순익
}

function normalize(d: BitgetPos): NormalizedRow {
  const open = num(d.ctime);
  const close = num(d.utime);
  const price = num(d.pnl);
  const fee = num(d.openFee) + num(d.closeFee);
  const funding = num(d.totalFunding);
  const net = d.netProfit !== undefined ? num(d.netProfit) : price + fee + funding;
  const hs = (d.holdSide || "").toLowerCase();
  return {
    exchange: "bitget",
    id: d.positionId ?? `${d.symbol}-${open}-${close}`,
    symbol: d.symbol ?? "",
    side: hs === "long" || hs === "short" ? (hs as "long" | "short") : null,
    pricePnl: price,
    fee,
    funding,
    netPnl: net,
    openTime: open || null,
    closeTime: close,
    holdTimeMs: open && close ? close - open : null,
    win: net > 0,
    unit: "position",
  };
}
