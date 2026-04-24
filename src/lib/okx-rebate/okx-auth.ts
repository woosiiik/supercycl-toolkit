import crypto from "crypto";

export function createOkxHeaders(
  apiKey: string,
  apiSecret: string,
  apiPassphrase: string,
  method: "GET" | "POST",
  requestPath: string,
  body?: string,
): Record<string, string> {
  // OKX SDK 형식: yyyy-MM-dd'T'HH:mm:ss'Z' (밀리초 없음)
  const now = new Date();
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const prehash = timestamp + method + requestPath + (body || "");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(prehash)
    .digest("base64");

  return {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": apiPassphrase,
    "Content-Type": "application/json",
  };
}
