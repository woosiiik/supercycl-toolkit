"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { CompactEncrypt, importSPKI, importJWK } from "jose";

const STORAGE_KEY = "handoff-tester-state";

const DEFAULT_URL = "https://aggr-dev.supercycl.io";
const DEFAULT_PARTNER = "Youthmeta";
const DEFAULT_PUBLIC_KEY =
  "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz4ZBbxtzHKUvU3GeXtOC\nuKpAbhiJHSKt/kgig4QMeT0n3wr6zwKWZomz70smvEVZkoX12Aqqdgj8J9MxMzO2\nSFR+OgRn+XLvK182XMxeHWQpk9+ULEaOPOAYWSYo2ao8gsCsJdKT3TakTHtmrh2V\nVcAj2UZvTfro1lPbGu+Sve4Rlbi6xyA/BliwvnVVHTf4DQZmvopDsY002nAwTjdr\nAUswGWRBZTeKUwXk7mWBsoWvtgnnRUHsnW+qQpu6RCRZuGyIrWecbynTRCNMlY/A\nkkQaaWMVL8xR9Mi6LrR0S4XLlV5fR1alQEm1oeNE4du95FtPSIMQkGYCkSTESjbM\nDwIDAQAB\n-----END PUBLIC KEY-----";
const DEFAULT_PLAINTEXT = JSON.stringify(
  {
    data: {
      platform: "ex",
      uid: 12345,
      userid: "testuser_ym",
      temp: 1775446490,
      nonce: "e2e-test-nonce-001",
      sc_price: 3000,
      end_date: "2026-05-06",
    },
  },
  null,
  2,
);

function loadSaved() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function HandoffTester() {
  const saved = loadSaved();
  const [targetUrl, setTargetUrl] = useState(saved?.targetUrl ?? DEFAULT_URL);
  const [partner, setPartner] = useState(saved?.partner ?? DEFAULT_PARTNER);
  const [publicKeyText, setPublicKeyText] = useState(
    saved?.publicKeyText ?? DEFAULT_PUBLIC_KEY,
  );
  const [plaintext, setPlaintext] = useState(
    saved?.plaintext ?? DEFAULT_PLAINTEXT,
  );
  const [jweResult, setJweResult] = useState<string | null>(
    saved?.jweResult ?? null,
  );
  const [actionUrl, setActionUrl] = useState<string | null>(
    saved?.actionUrl ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const saveState = useCallback(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          targetUrl,
          partner,
          publicKeyText,
          plaintext,
          jweResult,
          actionUrl,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [targetUrl, partner, publicKeyText, plaintext, jweResult, actionUrl]);

  useEffect(() => {
    saveState();
  }, [saveState]);

  function handleReset() {
    setTargetUrl(DEFAULT_URL);
    setPartner(DEFAULT_PARTNER);
    setPublicKeyText(DEFAULT_PUBLIC_KEY);
    setPlaintext(DEFAULT_PLAINTEXT);
    setJweResult(null);
    setActionUrl(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  async function handleSend() {
    setError(null);
    setJweResult(null);
    setActionUrl(null);
    setLoading(true);

    try {
      const trimmedKey = publicKeyText.trim();
      const trimmedData = plaintext.trim();
      const trimmedUrl = targetUrl.trim();

      if (!trimmedKey || !trimmedData || !trimmedUrl) {
        setError("URL, 공개키, 데이터를 모두 입력해주세요");
        return;
      }

      // Public key 파싱
      let key;
      if (trimmedKey.startsWith("-----BEGIN")) {
        key = await importSPKI(trimmedKey, "RSA-OAEP-256");
      } else if (trimmedKey.startsWith("{")) {
        key = await importJWK(JSON.parse(trimmedKey), "RSA-OAEP-256");
      } else {
        setError("PEM 또는 JWK 형식의 공개키를 입력해주세요");
        return;
      }

      // JWE 암호화
      const encoder = new TextEncoder();
      const jwe = await new CompactEncrypt(encoder.encode(trimmedData))
        .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM" })
        .encrypt(key);

      // action URL 구성: /api/handoff?partner=...
      const urlObj = new URL(trimmedUrl);
      const fullActionUrl = `${urlObj.origin}/api/ym?partner=${encodeURIComponent(partner.trim())}`;

      setJweResult(jwe);
      setActionUrl(fullActionUrl);

      // form submit
      setTimeout(() => {
        formRef.current?.submit();
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Target URL */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="ho-url"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          대상 URL
        </label>
        <input
          id="ho-url"
          type="text"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Partner */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="ho-partner"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Partner
        </label>
        <input
          id="ho-partner"
          type="text"
          value={partner}
          onChange={(e) => setPartner(e.target.value)}
          placeholder="Youthmeta"
          className="w-64 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Public Key */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="ho-pubkey"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          RSA Public Key (PEM 또는 JWK)
        </label>
        <textarea
          id="ho-pubkey"
          value={publicKeyText}
          onChange={(e) => setPublicKeyText(e.target.value)}
          placeholder={
            "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
          }
          rows={10}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Plaintext Data */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="ho-data"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          암호화할 데이터
        </label>
        <textarea
          id="ho-data"
          value={plaintext}
          onChange={(e) => setPlaintext(e.target.value)}
          placeholder='{"data": {"platform": "ex", ...}}'
          rows={14}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {loading ? "처리 중..." : "슈퍼사이클로 이동 (Form POST)"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          초기화
        </button>
      </div>

      {/* Action URL */}
      {actionUrl && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Form POST URL
          </span>
          <code className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {actionUrl}
          </code>
        </div>
      )}

      {/* JWE Result */}
      {jweResult && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            생성된 JWE
          </span>
          <pre className="max-h-32 overflow-auto rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 break-all whitespace-pre-wrap dark:bg-zinc-800 dark:text-zinc-300">
            {jweResult}
          </pre>
        </div>
      )}

      {/* Hidden Form for POST submission */}
      {actionUrl && jweResult && (
        <form
          ref={formRef}
          method="POST"
          action={actionUrl}
          target="_blank"
          className="hidden"
        >
          <input type="hidden" name="jwe" value={jweResult} />
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
