import { NextRequest, NextResponse } from "next/server";

// 브라우저에서 원격 WAS(dev/staging/prod)로 직접 호출하면 JWT(Authorization) 헤더로 인해
// CORS preflight에 막히므로, 서버에서 대신 WAS로 전달하는 프록시 라우트.
// JWE 암호화 자체는 클라이언트(브라우저)에서 수행하고, 결과(partnerYouthmetaUser)만 받는다.
export async function POST(req: NextRequest) {
  try {
    const { wasUrl, jwt, partnerYouthmetaUser } = await req.json();

    if (!wasUrl || !jwt || !partnerYouthmetaUser) {
      return NextResponse.json(
        { error: "wasUrl, jwt, partnerYouthmetaUser 가 모두 필요합니다." },
        { status: 400 },
      );
    }

    const url = `${String(wasUrl).replace(/\/$/, "")}/v1/ym/user/update`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ partnerYouthmetaUser }),
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
