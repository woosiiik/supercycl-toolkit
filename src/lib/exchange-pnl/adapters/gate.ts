import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../types";
import { fetchJson, hmacSha512Hex, sha512Hex, buildQuery, num } from "./util";

// Gate — [A] 포지션 히스토리. GET /api/v4/futures/usdt/position_close
// 인증: HMAC SHA512. sign payload = `${method}\n${path}\n${query}\n${sha512(body)}\n${ts}`
// settle=usdt 로 전체 심볼 일괄. pnl = pnl_pnl + pnl_fund + pnl_fee 분해.

const BASE = "https://api.gateio.ws";
const PREFIX = "/api/v4";
const PATH = "/futures/usdt/position_close";
const MAX_PAGES = 30;

export async function collectGate(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = buildQuery({
      limit: 100,
      offset: page * 100,
      from: Math.floor(req.startTime / 1000),
      to: Math.floor(req.endTime / 1000),
    });
    const fullPath = PREFIX + PATH;
    const ts = Math.floor(Date.now() / 1000).toString();
    const bodyHash = sha512Hex("");
    const signMsg = `GET\n${fullPath}\n${query}\n${bodyHash}\n${ts}`;
    const sign = hmacSha512Hex(apiSecret, signMsg);
    const url = `${BASE}${fullPath}?${query}`;
    requestCount++;
    const { page: rp, ok, body } = await fetchJson(`position_close p${page}`, url, {
      method: "GET",
      headers: {
        KEY: apiKey,
        SIGN: sign,
        Timestamp: ts,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    rawPages.push(rp);

    if (!ok) {
      const b = body as { label?: string; message?: string };
      warnings.push(`Gate 응답 오류 (p${page}): ${b?.label ?? rp.status} ${b?.message ?? ""}`);
      break;
    }
    const list = (Array.isArray(body) ? body : []) as GatePos[];
    for (const d of list) rows.push(normalize(d));
    if (list.length < 100) break;
  }

  return {
    exchange: "gate",
    rows,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [PREFIX + PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface GatePos {
  contract?: string;
  side?: string; // long/short
  pnl?: string; // net
  pnl_pnl?: string; // 가격손익
  pnl_fund?: string; // 펀딩
  pnl_fee?: string; // 수수료
  time?: number; // 종료 (초)
  first_open_time?: number; // 오픈 (초)
}

function normalize(d: GatePos): NormalizedRow {
  const open = num(d.first_open_time) * 1000;
  const close = num(d.time) * 1000;
  const price = num(d.pnl_pnl);
  const fee = num(d.pnl_fee);
  const funding = num(d.pnl_fund);
  // Gate net(pnl)은 가격손익만일 수 있음 → 분해값이 있으면 합산을 net으로 사용
  const hasComponents = d.pnl_pnl !== undefined || d.pnl_fee !== undefined || d.pnl_fund !== undefined;
  const net = hasComponents ? price + fee + funding : num(d.pnl);
  const side = d.side === "long" || d.side === "short" ? d.side : null;
  return {
    exchange: "gate",
    id: `${d.contract}-${d.side}-${d.first_open_time}-${d.time}`,
    symbol: d.contract ?? "",
    side,
    pricePnl: hasComponents ? price : num(d.pnl),
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
