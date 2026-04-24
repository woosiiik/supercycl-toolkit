import { NextResponse } from "next/server";
import { createOkxHeaders } from "@/lib/okx-rebate/okx-auth";
import { OKX_BASE_URL, OKX_REBATE_PATH } from "@/lib/okx-rebate/constants";

function getOkxCredentials() {
  const apiKey = process.env.OKX_API;
  const apiSecret = process.env.OKX_SECRET;
  const apiPassphrase = process.env.OKX_PASS;
  if (!apiKey || !apiSecret || !apiPassphrase) {
    throw new Error(
      "OKX 환경변수가 설정되지 않았습니다 (OKX_API, OKX_SECRET, OKX_PASS)",
    );
  }
  return { apiKey, apiSecret, apiPassphrase };
}

// "2026-04-13" → "20260413" (OKX SDK 형식: yyyyMMdd)
function toOkxDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

// --- Action: create-link ---
// POST /api/v5/broker/fd/rebate-per-orders
async function createLink(beginDate: string, endDate: string) {
  const okx = getOkxCredentials();
  const body = JSON.stringify({
    begin: toOkxDate(beginDate),
    end: toOkxDate(endDate),
    brokerType: "api",
  });

  const url = `${OKX_BASE_URL}${OKX_REBATE_PATH}`;
  const headers = createOkxHeaders(
    okx.apiKey,
    okx.apiSecret,
    okx.apiPassphrase,
    "POST",
    OKX_REBATE_PATH,
    body,
  );

  console.log("[OKX create-link] POST", url);
  console.log("[OKX create-link] body:", body);
  console.log("[OKX create-link] headers:", JSON.stringify(headers, null, 2));

  const res = await fetch(url, { method: "POST", headers, body });
  const status = res.status;
  const text = await res.text();

  console.log("[OKX create-link] HTTP", status);
  console.log("[OKX create-link] response:", text);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: `OKX API returned non-JSON (HTTP ${status}): ${text.slice(0, 500)}` },
      { status: 502 },
    );
  }

  if (json.code !== "0") {
    return NextResponse.json(
      { error: `OKX API error (code=${json.code}): ${json.msg}` },
      { status: 400 },
    );
  }

  const ts = json.data?.[0]?.ts;
  if (!ts) {
    return NextResponse.json(
      { error: `OKX API: ts not found. data=${JSON.stringify(json.data)}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ requestId: Number(ts) });
}

// --- Action: check-link ---
// GET /api/v5/broker/fd/rebate-per-orders?type=...&begin=...&end=...&brokerType=1
async function checkLink(
  requestId: number,
  beginDate: string,
  endDate: string,
) {
  const okx = getOkxCredentials();
  const params = new URLSearchParams({
    type: "false",
    begin: toOkxDate(beginDate),
    end: toOkxDate(endDate),
    brokerType: "api",
  });
  const requestPath = `${OKX_REBATE_PATH}?${params.toString()}`;
  const url = `${OKX_BASE_URL}${requestPath}`;

  const headers = createOkxHeaders(
    okx.apiKey,
    okx.apiSecret,
    okx.apiPassphrase,
    "GET",
    requestPath,
  );

  console.log("[OKX check-link] GET", url);

  const res = await fetch(url, { method: "GET", headers });
  const status = res.status;
  const text = await res.text();

  console.log("[OKX check-link] HTTP", status);
  console.log("[OKX check-link] response:", text);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: `OKX API returned non-JSON (HTTP ${status}): ${text.slice(0, 500)}` },
      { status: 502 },
    );
  }

  if (json.code !== "0") {
    return NextResponse.json(
      { error: `OKX API error (code=${json.code}): ${json.msg}` },
      { status: 400 },
    );
  }

  const items: Array<{
    cTime: string | number;
    state: string;
    fileHref: string;
  }> = json.data || [];

  console.log("[OKX check-link] items:", JSON.stringify(items));

  const match = items.find(
    (item) =>
      Number(item.cTime) === requestId && item.state === "finished",
  );

  if (match) {
    console.log("[OKX check-link] READY, downloadUrl:", match.fileHref);
    return NextResponse.json({ ready: true, downloadUrl: match.fileHref });
  }

  return NextResponse.json({ ready: false });
}

// --- Action: list-links ---
// 기존 생성된 다운로드 링크 목록 조회 (2회/분)
async function listLinks(beginDate: string, endDate: string) {
  const okx = getOkxCredentials();
  const params = new URLSearchParams({
    type: "false",
    begin: toOkxDate(beginDate),
    end: toOkxDate(endDate),
    brokerType: "api",
  });
  const requestPath = `${OKX_REBATE_PATH}?${params.toString()}`;
  const url = `${OKX_BASE_URL}${requestPath}`;

  const headers = createOkxHeaders(
    okx.apiKey,
    okx.apiSecret,
    okx.apiPassphrase,
    "GET",
    requestPath,
  );

  console.log("[OKX list-links] GET", url);

  const res = await fetch(url, { method: "GET", headers });
  const status = res.status;
  const text = await res.text();

  console.log("[OKX list-links] HTTP", status);
  console.log("[OKX list-links] response:", text);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: `OKX API returned non-JSON (HTTP ${status}): ${text.slice(0, 500)}` },
      { status: 502 },
    );
  }

  if (json.code !== "0") {
    return NextResponse.json(
      { error: `OKX API error (code=${json.code}): ${json.msg}` },
      { status: 400 },
    );
  }

  const items: Array<{
    cTime: string | number;
    state: string;
    fileHref: string;
  }> = json.data || [];

  return NextResponse.json({
    links: items.map((item) => ({
      cTime: Number(item.cTime),
      cTimeStr: new Date(Number(item.cTime)).toISOString(),
      state: item.state,
      fileHref: item.fileHref || null,
    })),
  });
}

// --- Action: download-csv ---
async function downloadCsv(downloadUrl: string) {
  console.log("[OKX download-csv] GET", downloadUrl);

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    const text = await res.text();
    console.log("[OKX download-csv] FAILED HTTP", res.status, text.slice(0, 500));
    return NextResponse.json(
      { error: `CSV download failed: HTTP ${res.status}` },
      { status: 500 },
    );
  }

  const csvText = await res.text();
  const lines = csvText.split("\n").filter((l) => l.trim().length > 0);

  console.log("[OKX download-csv] lines:", lines.length, "first:", lines[0]?.slice(0, 100));

  if (lines.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  // 헤더 스킵
  const dataLines = lines.slice(1);
  const rows = [];

  for (let i = 0; i < dataLines.length; i++) {
    const fields = dataLines[i].split(",");
    if (fields.length !== 14) {
      console.log(`[OKX download-csv] skip line ${i + 2}: ${fields.length} fields`);
      continue;
    }

    rows.push({
      brokerCode: fields[0],
      level: fields[1],
      instId: fields[2],
      orderId: fields[3],
      spotTradeAmt: parseFloat(fields[4]) || 0,
      derivativeTradeAmt: parseFloat(fields[5]) || 0,
      fee: parseFloat(fields[6]) || 0,
      brokerRebate: parseFloat(fields[7]) || 0,
      netFee: parseFloat(fields[8]) || 0,
      settlementFee: parseFloat(fields[9]) || 0,
      subBrokerRebate: parseFloat(fields[10]) || 0,
      userRebate: parseFloat(fields[11]) || 0,
      affiliated: fields[12] === "true",
      ts: parseInt(fields[13], 10) || 0,
    });
  }

  console.log("[OKX download-csv] parsed rows:", rows.length);
  return NextResponse.json({ rows });
}

// --- Main handler ---
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;
    console.log("[OKX csv] action:", action, "params:", JSON.stringify(body));

    switch (action) {
      case "create-link":
        return createLink(body.beginDate, body.endDate);
      case "check-link":
        return checkLink(body.requestId, body.beginDate, body.endDate);
      case "list-links":
        return listLinks(body.beginDate, body.endDate);
      case "download-csv":
        return downloadCsv(body.downloadUrl);
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OKX csv] unhandled error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
