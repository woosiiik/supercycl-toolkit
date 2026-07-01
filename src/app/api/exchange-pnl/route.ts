import { NextRequest, NextResponse } from "next/server";
import type { CollectRequest, ExchangeId } from "@/lib/exchange-pnl/types";
import { getAdapter } from "@/lib/exchange-pnl/adapters";
import { getTradeAdapter } from "@/lib/exchange-pnl/adapters/trade";

// 거래소 PNL 수집 프록시.
// 브라우저에서 거래소 API를 직접 호출하면 CORS + 서명(HMAC) 문제가 있으므로
// 서버에서 서명·호출하고 원본 + 정규화 데이터를 반환한다.
// API key는 클라이언트가 보관(localStorage)하고 매 요청에 전달 — 서버에 저장하지 않는다.

export const runtime = "nodejs";
export const maxDuration = 120;
// Bybit·Binance·OKX는 미국을 지역 차단하므로, Vercel 기본 미국 리전(iad1) 대신
// 비-미국 리전(프랑크푸르트)에서 실행한다. vercel.json regions 와 일치.
export const preferredRegion = "fra1";

const VALID: ExchangeId[] = ["okx", "bingx", "bitget", "gate", "bybit", "binance", "hyperliquid"];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CollectRequest>;
    const { exchange, credentials, startTime, endTime } = body;
    const method = body.method === "trade" ? "trade" : "position";

    if (!exchange || !VALID.includes(exchange)) {
      return NextResponse.json({ error: `유효하지 않은 거래소: ${exchange}` }, { status: 400 });
    }
    if (!credentials || typeof credentials !== "object") {
      return NextResponse.json({ error: "credentials 가 필요합니다." }, { status: 400 });
    }
    if (typeof startTime !== "number" || typeof endTime !== "number") {
      return NextResponse.json({ error: "startTime, endTime(ms) 가 필요합니다." }, { status: 400 });
    }

    const adapter = method === "trade" ? getTradeAdapter(exchange) : getAdapter(exchange);
    if (!adapter) {
      return NextResponse.json({ error: `어댑터 없음: ${exchange} (${method})` }, { status: 400 });
    }

    const result = await adapter({ exchange, credentials, startTime, endTime, method });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
