"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { CompactEncrypt, importSPKI, importJWK } from "jose";

function StepRow({
  done,
  active,
  label,
  timeout,
}: {
  done: boolean;
  active: boolean;
  label: string;
  timeout?: boolean;
}) {
  let icon = "○";
  let color = "text-zinc-400 dark:text-zinc-500";
  if (timeout) {
    icon = "⚠";
    color = "text-yellow-600 dark:text-yellow-400";
  } else if (done) {
    icon = "✓";
    color = "text-green-600 dark:text-green-400";
  } else if (active) {
    icon = "●";
    color = "text-blue-600 dark:text-blue-400 animate-pulse";
  }
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      <span className="w-4 text-center">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

const STORAGE_KEY = "postmessage-tester-state";

const DEFAULT_URL = "https://aggr-dev.supercycl.io";
const DEFAULT_PUBLIC_KEY =
  "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz4ZBbxtzHKUvU3GeXtOC\nuKpAbhiJHSKt/kgig4QMeT0n3wr6zwKWZomz70smvEVZkoX12Aqqdgj8J9MxMzO2\nSFR+OgRn+XLvK182XMxeHWQpk9+ULEaOPOAYWSYo2ao8gsCsJdKT3TakTHtmrh2V\nVcAj2UZvTfro1lPbGu+Sve4Rlbi6xyA/BliwvnVVHTf4DQZmvopDsY002nAwTjdr\nAUswGWRBZTeKUwXk7mWBsoWvtgnnRUHsnW+qQpu6RCRZuGyIrWecbynTRCNMlY/A\nkkQaaWMVL8xR9Mi6LrR0S4XLlV5fR1alQEm1oeNE4du95FtPSIMQkGYCkSTESjbM\nDwIDAQAB\n-----END PUBLIC KEY-----";
const DEFAULT_PLAINTEXT = JSON.stringify(
  {
    Platform: "ex",
    uid: 12345,
    userid: "testuser_ym",
    temp: 1775446490,
    nonce: "e2e-test-nonce-001",
    sc_price: 3000,
    end_date: "2026-05-06",
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

export default function PostMessageTester() {
  const saved = loadSaved();
  const [targetUrl, setTargetUrl] = useState(saved?.targetUrl ?? DEFAULT_URL);
  const [partner, setPartner] = useState(saved?.partner ?? "Youthmeta");
  const [publicKeyText, setPublicKeyText] = useState(
    saved?.publicKeyText ?? DEFAULT_PUBLIC_KEY,
  );
  const [plaintext, setPlaintext] = useState(
    saved?.plaintext ?? DEFAULT_PLAINTEXT,
  );
  const [status, setStatus] = useState<string | null>(saved?.status ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [jwePreview, setJwePreview] = useState<string | null>(
    saved?.jwePreview ?? null,
  );
  const [calledUrl, setCalledUrl] = useState<string | null>(
    saved?.calledUrl ?? null,
  );
  const [step, setStep] = useState<
    "idle" | "encrypting" | "opening" | "waiting" | "sent" | "timeout"
  >(saved?.step ?? "idle");
  const [messageLogs, setMessageLogs] = useState<string[]>([]);
  const newTabRef = useRef<Window | null>(null);

  // localStorage에 상태 저장
  const saveState = useCallback(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          targetUrl,
          partner,
          publicKeyText,
          plaintext,
          status,
          jwePreview,
          calledUrl,
          step,
        }),
      );
    } catch {
      // ignore
    }
  }, [
    targetUrl,
    partner,
    publicKeyText,
    plaintext,
    status,
    jwePreview,
    calledUrl,
    step,
  ]);

  useEffect(() => {
    saveState();
  }, [saveState]);

  function handleReset() {
    setTargetUrl(DEFAULT_URL);
    setPartner("Youthmeta");
    setPublicKeyText(DEFAULT_PUBLIC_KEY);
    setPlaintext(DEFAULT_PLAINTEXT);
    setStatus(null);
    setError(null);
    setJwePreview(null);
    setCalledUrl(null);
    setStep("idle");
    setMessageLogs([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  async function handleSend() {
    setError(null);
    setStatus(null);
    setJwePreview(null);
    setCalledUrl(null);
    setStep("encrypting");
    setLoading(true);

    try {
      const trimmedKey = publicKeyText.trim();
      const trimmedData = plaintext.trim();
      const trimmedUrl = targetUrl.trim();

      if (!trimmedKey || !trimmedData || !trimmedUrl) {
        setError("URL, 공개키, 데이터를 모두 입력해주세요");
        return;
      }

      // Public key 파싱: PEM 또는 JWK
      let key;
      if (trimmedKey.startsWith("-----BEGIN")) {
        key = await importSPKI(trimmedKey, "RSA-OAEP-256");
      } else if (trimmedKey.startsWith("{")) {
        const jwk = JSON.parse(trimmedKey);
        key = await importJWK(jwk, "RSA-OAEP-256");
      } else {
        setError(
          "PEM (-----BEGIN PUBLIC KEY-----) 또는 JWK ({...}) 형식의 공개키를 입력해주세요",
        );
        return;
      }

      // JWE 암호화 (RSA-OAEP-256 + A256GCM)
      const encoder = new TextEncoder();
      const jwe = await new CompactEncrypt(encoder.encode(trimmedData))
        .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM" })
        .encrypt(key);

      setJwePreview(jwe);

      // partner 파라미터를 URL에 추가
      const urlObj = new URL(trimmedUrl);
      if (partner.trim()) {
        urlObj.searchParams.set("partner", partner.trim());
      }
      const fullUrl = urlObj.toString();
      setCalledUrl(fullUrl);

      // target origin 추출
      const targetOrigin = urlObj.origin;

      // 새 탭 열기
      setStep("opening");
      const newTab = window.open(fullUrl, "_blank");
      if (!newTab) {
        setError("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.");
        setStep("idle");
        return;
      }
      newTabRef.current = newTab;
      setStep("waiting");

      // 메시지 핸들러
      const onMessage = (event: MessageEvent) => {
        // 모든 수신 메시지 로그
        const dataStr =
          typeof event.data === "string"
            ? event.data
            : JSON.stringify(event.data);
        setMessageLogs((prev) => [
          ...prev.slice(-19),
          `[${new Date().toLocaleTimeString()}] origin=${event.origin} data=${dataStr.slice(0, 200)}`,
        ]);

        // origin 체크 생략 — localhost 테스트 및 상대방이 "*"로 보내는 경우 지원
        // "ready" 문자열 또는 { type: "ready" } 객체 모두 처리
        const isReady =
          event.data === "ready" ||
          (typeof event.data === "object" && event.data?.type === "ready");

        if (isReady) {
          newTab.postMessage(jwe, targetOrigin);
          window.removeEventListener("message", onMessage);
          setStep("sent");
          setStatus("JWE 전송 완료 ✅");
        }
      };

      window.addEventListener("message", onMessage);

      // 30초 타임아웃
      setTimeout(() => {
        window.removeEventListener("message", onMessage);
        setStep((prev) => (prev === "sent" ? prev : "timeout"));
        setStatus((prev) =>
          prev === "JWE 전송 완료 ✅"
            ? prev
            : "타임아웃 — ready 신호를 받지 못했습니다",
        );
      }, 30000);
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
          htmlFor="pm-url"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          대상 URL
        </label>
        <input
          id="pm-url"
          type="text"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Partner */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="pm-partner"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Partner (URL 파라미터)
        </label>
        <input
          id="pm-partner"
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
          htmlFor="pm-pubkey"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          RSA Public Key (PEM 또는 JWK)
        </label>
        <textarea
          id="pm-pubkey"
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
          htmlFor="pm-data"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          암호화할 데이터
        </label>
        <textarea
          id="pm-data"
          value={plaintext}
          onChange={(e) => setPlaintext(e.target.value)}
          placeholder='{"userId": "test", "token": "abc123"}'
          rows={12}
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
          {loading ? "처리 중..." : "슈퍼사이클로 이동"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          초기화
        </button>
      </div>

      {/* Progress Steps */}
      {step !== "idle" && (
        <div className="flex flex-col gap-2 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            진행 상태
          </h4>
          <div className="flex flex-col gap-1.5 text-sm">
            <StepRow
              done={step !== "encrypting"}
              active={step === "encrypting"}
              label="1. JWE 암호화"
            />
            <StepRow
              done={["waiting", "sent", "timeout"].includes(step)}
              active={step === "opening"}
              label="2. 새 탭 열기"
            />
            <StepRow
              done={step === "sent"}
              active={step === "waiting"}
              label="3. ready 신호 대기 중..."
              timeout={step === "timeout"}
            />
            <StepRow
              done={step === "sent"}
              active={false}
              label="4. JWE postMessage 전송"
            />
          </div>
        </div>
      )}

      {/* Called URL */}
      {calledUrl && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            호출 URL
          </span>
          <code className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {calledUrl}
          </code>
        </div>
      )}

      {/* JWE Result */}
      {jwePreview && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            생성된 JWE
          </span>
          <pre className="max-h-32 overflow-auto rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 break-all whitespace-pre-wrap dark:bg-zinc-800 dark:text-zinc-300">
            {jwePreview}
          </pre>
        </div>
      )}

      {/* Status */}
      {status && (
        <div
          className={`rounded-md border p-3 text-sm ${
            step === "sent"
              ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
              : step === "timeout"
                ? "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                : "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
          }`}
        >
          {status}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* PostMessage 수신 로그 */}
      {messageLogs.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            수신된 postMessage 로그
          </span>
          <pre className="max-h-40 overflow-auto rounded bg-zinc-100 p-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {messageLogs.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
