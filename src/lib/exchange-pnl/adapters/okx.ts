import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../types";
import { fetchJson, hmacSha256Base64, buildQuery, num } from "./util";

// OKX — [A] 포지션 히스토리. GET /api/v5/account/positions-history
// 인증: key+secret+passphrase, sign=base64(hmac-sha256(secret, ts+method+path+body))
// ts 형식: ISO8601 (예: 2020-12-08T09:08:57.715Z)

const BASE = "https://www.okx.com";
const MAX_PAGES = 30; // posId after 커서 페이지네이션 안전 상한

export async function collectOkx(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret, passphrase } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  const endpoints = ["/api/v5/account/positions-history"];
  let requestCount = 0;

  let after = ""; // 이전(더 오래된) 데이터 커서 = 마지막 posId
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = buildQuery({
      instType: "SWAP",
      limit: 100,
      after,
      begin: req.startTime,
      end: req.endTime,
    });
    const path = `/api/v5/account/positions-history?${qs}`;
    const ts = new Date().toISOString();
    const sign = hmacSha256Base64(apiSecret, ts + "GET" + path);
    requestCount++;
    const { page: rp, ok, body } = await fetchJson(`positions-history p${page}`, BASE + path, {
      method: "GET",
      headers: {
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      },
    });
    rawPages.push(rp);

    const b = body as { code?: string; msg?: string; data?: OkxPos[] };
    if (!ok || (b?.code && b.code !== "0")) {
      warnings.push(`OKX 응답 오류 (p${page}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
      break;
    }
    const data = b?.data ?? [];
    for (const d of data) rows.push(normalize(d));
    if (data.length < 100) break;
    after = data[data.length - 1]?.posId ?? "";
    if (!after) break;
  }

  return {
    exchange: "okx",
    rows,
    rawPages,
    warnings,
    meta: { requestCount, endpoints, startTime: req.startTime, endTime: req.endTime },
  };
}

interface OkxPos {
  instId: string;
  posId: string;
  posSide: string; // long/short/net
  direction?: string;
  pnl: string; // 가격손익
  fee: string; // 수수료(음수)
  fundingFee: string;
  realizedPnl: string; // net
  cTime: string;
  uTime: string;
}

function normalize(d: OkxPos): NormalizedRow {
  const openTime = num(d.cTime);
  const closeTime = num(d.uTime);
  const net = num(d.realizedPnl);
  const side = d.posSide === "long" || d.posSide === "short" ? d.posSide : null;
  return {
    exchange: "okx",
    id: d.posId,
    symbol: d.instId,
    side,
    pricePnl: num(d.pnl),
    fee: num(d.fee),
    funding: num(d.fundingFee),
    netPnl: net,
    openTime: openTime || null,
    closeTime,
    holdTimeMs: openTime && closeTime ? closeTime - openTime : null,
    win: net > 0,
    unit: "position",
  };
}
