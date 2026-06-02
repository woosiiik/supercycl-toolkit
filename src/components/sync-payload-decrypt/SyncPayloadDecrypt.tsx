"use client";

import { useState } from "react";

// base64 문자열 → Uint8Array
function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/").trim();
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// PKCS#8 PEM → CryptoKey (RSA-OAEP, SHA-256)
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const der = base64ToBytes(pemBody);
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer as ArrayBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
}

export default function SyncPayloadDecrypt() {
  const [privateKeyText, setPrivateKeyText] = useState("");
  const [payloadText, setPayloadText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDecrypt() {
    setError(null);
    setResult(null);
    setEnvelope(null);
    setLoading(true);

    try {
      const trimmedKey = privateKeyText.trim();
      const trimmedPayload = payloadText.trim();

      if (!trimmedKey || !trimmedPayload) {
        setError("Private key와 encryptedPayload를 모두 입력해주세요");
        return;
      }
      if (!trimmedKey.startsWith("-----BEGIN")) {
        setError(
          "PKCS#8 PEM (-----BEGIN PRIVATE KEY-----) 형식의 private key를 입력해주세요",
        );
        return;
      }

      // 1. RSA private key 로드 (RSA-OAEP / SHA-256)
      const privateKey = await importPrivateKey(trimmedKey);

      // 2. encryptedPayload(base64) → JSON 파싱
      const payloadJson = new TextDecoder().decode(
        base64ToBytes(trimmedPayload),
      );
      let payload: {
        encryptedKey?: string;
        iv?: string;
        authTag?: string;
        data?: string;
      };
      try {
        payload = JSON.parse(payloadJson);
      } catch {
        setError(
          "payload base64 디코딩 결과가 JSON이 아닙니다. encryptedPayload 값을 확인해주세요.",
        );
        return;
      }

      if (
        !payload.encryptedKey ||
        !payload.iv ||
        !payload.authTag ||
        payload.data === undefined
      ) {
        setError(
          "JSON에 encryptedKey, iv, authTag, data 필드가 모두 있어야 합니다.",
        );
        return;
      }

      setEnvelope(JSON.stringify(payload, null, 2));

      const encryptedKey = base64ToBytes(payload.encryptedKey);
      const iv = base64ToBytes(payload.iv);
      const authTag = base64ToBytes(payload.authTag);
      const data = base64ToBytes(payload.data);

      // 3. RSA-OAEP(SHA-256, MGF1-SHA-256)로 AES 키 복호화
      const aesKeyRaw = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        encryptedKey.buffer as ArrayBuffer,
      );

      const aesKey = await crypto.subtle.importKey(
        "raw",
        aesKeyRaw,
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );

      // 4. AES-256-GCM 복호화 (Web Crypto는 ciphertext + authTag 결합 입력)
      const dataWithTag = new Uint8Array(data.length + authTag.length);
      dataWithTag.set(data, 0);
      dataWithTag.set(authTag, data.length);

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: 128 },
        aesKey,
        dataWithTag.buffer as ArrayBuffer,
      );

      const decoded = new TextDecoder().decode(decrypted);

      // JSON이면 포맷팅
      try {
        const parsed = JSON.parse(decoded);
        setResult(JSON.stringify(parsed, null, 2));
      } catch {
        setResult(decoded);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Private Key */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="sync-private-key"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          RSA Private Key (PKCS#8 PEM) — private.pem 내용
        </label>
        <textarea
          id="sync-private-key"
          value={privateKeyText}
          onChange={(e) => setPrivateKeyText(e.target.value)}
          placeholder={
            "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
          }
          rows={6}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Encrypted Payload */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="sync-payload"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          encryptedPayload (base64)
        </label>
        <textarea
          id="sync-payload"
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          placeholder="eyJlbmNyeXB0ZWRLZXkiOiIuLi4iLCJpdiI6Ii4uLiIsImF1dGhUYWciOiIuLi4iLCJkYXRhIjoiLi4uIn0="
          rows={5}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Decrypt Button */}
      <button
        type="button"
        onClick={handleDecrypt}
        disabled={loading}
        className="self-start rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600"
      >
        {loading ? "복호화 중..." : "복호화"}
      </button>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Parsed Envelope */}
      {envelope && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Payload Envelope (base64 디코딩 결과)
          </span>
          <pre className="max-h-60 overflow-auto rounded-md border border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
            {envelope}
          </pre>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            복호화 결과 (평문)
          </span>
          <pre className="max-h-96 overflow-auto rounded-md border border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
