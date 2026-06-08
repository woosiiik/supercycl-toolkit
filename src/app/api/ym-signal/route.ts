import { NextRequest, NextResponse } from "next/server";

// 브라우저에서 원격 WAS(dev/staging/prod)로 직접 호출하면 CORS preflight에 막히므로,
// 서버에서 대신 WAS로 전달하는 프록시 라우트.
// JWE 암호화 자체는 클라이언트(브라우저)에서 수행하고, 결과(encrypted)만 받는다.

const ALLOWED_ENDPOINTS = new Set([
  "/v1/partner/ym/signal/realtime",
  "/v1/partner/ym/signal/confirmed",
  "/v1/partner/ym/member/notify",
]);

export async function POST(req: NextRequest) {
  try {
    const { wasUrl, endpoint, encrypted } = await req.json();

    if (!wasUrl || !endpoint || !encrypted) {
      return NextResponse.json(
        { error: "wasUrl, endpoint, encrypted 가 모두 필요합니다." },
        { status: 400 },
      );
    }

    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
      return NextResponse.json(
        { error: `허용되지 않은 endpoint: ${endpoint}` },
        { status: 400 },
      );
    }

    const url = `${String(wasUrl).replace(/\/$/, "")}${endpoint}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encrypted }),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return NextResponse.json({ status: res.status, url, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
