"use client";

import { useState } from "react";
import { compactDecrypt, importPKCS8, importJWK } from "jose";

export default function JweDecoder() {
  const [privateKeyText, setPrivateKeyText] = useState("");
  const [jweText, setJweText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [header, setHeader] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDecrypt() {
    setError(null);
    setResult(null);
    setHeader(null);
    setLoading(true);

    try {
      const trimmedKey = privateKeyText.trim();
      const trimmedJwe = jweText.trim();

      if (!trimmedKey || !trimmedJwe) {
        setError("Private key와 JWE cipher text를 모두 입력해주세요");
        return;
      }

      // JWE 헤더에서 알고리즘 자동 감지
      const headerB64 = trimmedJwe.split(".")[0];
      const headerJson = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
      const alg = headerJson.alg || "RSA-OAEP-256";
      setHeader(JSON.stringify(headerJson, null, 2));

      // Private key 파싱: PEM 또는 JWK
      let key;
      if (trimmedKey.startsWith("-----BEGIN")) {
        key = await importPKCS8(trimmedKey, alg);
      } else if (trimmedKey.startsWith("{")) {
        const jwk = JSON.parse(trimmedKey);
        key = await importJWK(jwk, alg);
      } else {
        setError("PEM (-----BEGIN ...) 또는 JWK ({...}) 형식의 private key를 입력해주세요");
        return;
      }

      // JWE 복호화
      const { plaintext } = await compactDecrypt(trimmedJwe, key);
      const decoded = new TextDecoder().decode(plaintext);

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
        <label htmlFor="jwe-private-key" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          RSA Private Key (PEM 또는 JWK)
        </label>
        <textarea
          id="jwe-private-key"
          value={privateKeyText}
          onChange={(e) => setPrivateKeyText(e.target.value)}
          placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
          rows={6}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* JWE Cipher Text */}
      <div className="flex flex-col gap-1">
        <label htmlFor="jwe-cipher" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          JWE Compact Serialization
        </label>
        <textarea
          id="jwe-cipher"
          value={jweText}
          onChange={(e) => setJweText(e.target.value)}
          placeholder="eyJhbGciOiJSU0EtT0FFUCIsImVuYyI6IkEyNTZHQ00ifQ...."
          rows={4}
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

      {/* JWE Header */}
      {header && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">JWE Header</span>
          <pre className="overflow-auto rounded-md border border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
            {header}
          </pre>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">복호화 결과</span>
          <pre className="max-h-96 overflow-auto rounded-md border border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}