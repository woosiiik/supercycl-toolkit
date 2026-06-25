import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../types";
import { fetchJson, hmacSha256Base64, buildQuery, num } from "./util";

// OKX — [A] 포지션 히스토리. GET /api/v5/account/positions-history
// 인증: key+secret+passphrase, sign=base64(hmac-sha256(secret, ts+method+path+body))
// ts 형식: ISO8601 (예: 2020-12-08T09:08:57.715Z)
//
// 주의: positions-history에는 begin/end 파라미터가 없다(무시됨). 기간 필터는 클라이언트에서
// uTime 기준으로 적용한다. after/before 커서는 posId가 아니라 uTime(ms) 타임스탬프다.

const BASE = "https://www.okx.com";
const MAX_PAGES = 30;

export async function collectOkx(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret, passphrase } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  const endpoints = ["/api/v5/account/positions-history"];
  let requestCount = 0;

  let after = ""; // 더 오래된 데이터 커서 = 마지막 row 의 uTime(ms)
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = buildQuery({ instType: "SWAP", limit: 100, after });
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
    if (data.length === 0) break;

    // 응답은 uTime 내림차순(최신→과거). 기간 [startTime,endTime] 으로 클립.
    let oldestUTime = Number.POSITIVE_INFINITY;
    for (const d of data) {
      const uTime = num(d.uTime);
      if (uTime > 0 && uTime < oldestUTime) oldestUTime = uTime;
      if (uTime < req.startTime || uTime > req.endTime) continue;
      rows.push(normalize(d));
    }

    if (data.length < 100) break;
    // 이미 시작일 이전까지 내려왔으면 중단
    if (Number.isFinite(oldestUTime) && oldestUTime <= req.startTime) break;
    const lastUTime = num(data[data.length - 1]?.uTime);
    if (!lastUTime) break;
    after = String(lastUTime);
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
  lever?: string; // 레버리지
  cTime: string;
  uTime: string;
}

function normalize(d: OkxPos): NormalizedRow {
  const openTime = num(d.cTime);
  const closeTime = num(d.uTime);
  const net = num(d.realizedPnl);
  // positions-history의 방향 필드는 direction. (posSide는 실시간 positions 필드 → 폴백)
  const dir = (d.direction || d.posSide || "").toLowerCase();
  const side = dir === "long" || dir === "short" ? (dir as "long" | "short") : null;
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
    leverage: num(d.lever) || null,
  };
}
