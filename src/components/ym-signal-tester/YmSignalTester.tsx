"use client";

import { useState } from "react";
import { CompactEncrypt, importSPKI } from "jose";

interface Signal {
  symbol: string;
  position: string;
  nonce?: string;
}

type ApiMode = "signal" | "member";
type SignalType = "realtime" | "confirmed";

const DEFAULT_PUBLIC_KEY =
  "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz4ZBbxtzHKUvU3GeXtOC\nuKpAbhiJHSKt/kgig4QMeT0n3wr6zwKWZomz70smvEVZkoX12Aqqdgj8J9MxMzO2\nSFR+OgRn+XLvK182XMxeHWQpk9+ULEaOPOAYWSYo2ao8gsCsJdKT3TakTHtmrh2V\nVcAj2UZvTfro1lPbGu+Sve4Rlbi6xyA/BliwvnVVHTf4DQZmvopDsY002nAwTjdr\nAUswGWRBZTeKUwXk7mWBsoWvtgnnRUHsnW+qQpu6RCRZuGyIrWecbynTRCNMlY/A\nkkQaaWMVL8xR9Mi6LrR0S4XLlV5fR1alQEm1oeNE4du95FtPSIMQkGYCkSTESjbM\nDwIDAQAB\n-----END PUBLIC KEY-----";

const WAS_ENVS: { label: string; url: string; defaultKey: string }[] = [
  { label: "Local", url: "http://localhost:8080", defaultKey: DEFAULT_PUBLIC_KEY },
  { label: "Dev", url: "https://pnl-dev.supercycl.io", defaultKey: DEFAULT_PUBLIC_KEY },
  { label: "Staging", url: "https://pnl-stg.supercycl.io", defaultKey: "" },
  { label: "Production", url: "https://pnl.supercycl.io", defaultKey: "" },
];

const POSITION_OPTIONS_PREMIUM = ["L1", "L2", "L3", "S1", "S2", "S3"];
const POSITION_OPTIONS_SMART = ["LL", "SS"];

const DEFAULT_REALTIME_SIGNALS: Signal[] = [
  { symbol: "BTCUSDT", position: "S1", nonce: "" },
  { symbol: "ETHUSDT", position: "S1", nonce: "" },
  { symbol: "SOLUSDT", position: "L1", nonce: "" },
  { symbol: "DOGEUSDT", position: "L1", nonce: "" },
];

const DEFAULT_PREMIUM_SIGNALS: Signal[] = [
  { symbol: "BTCUSDT", position: "S1" },
  { symbol: "ETHUSDT", position: "S1" },
];

const DEFAULT_SMART_SIGNALS: Signal[] = [
  { symbol: "BTCUSDT", position: "SS" },
  { symbol: "DOGEUSDT", position: "LL" },
  { symbol: "ETHUSDT", position: "LL" },
];

const btnCls =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";
const btnRedCls =
  "rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700";
const btnGrayCls =
  "rounded-md bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-600";
const inputCls =
  "w-full p-2 bg-gray-800 border border-gray-600 rounded text-white text-sm font-mono";

async function encryptJwe(plaintext: string, publicKeyPem: string): Promise<string> {
  const key = await importSPKI(publicKeyPem, "RSA-OAEP");
  const encoder = new TextEncoder();
  return await new CompactEncrypt(encoder.encode(plaintext))
    .setProtectedHeader({ alg: "RSA-OAEP", enc: "A256GCM" })
    .encrypt(key);
}

export default function YmSignalTester() {
  const [wasUrl, setWasUrl] = useState(WAS_ENVS[1].url);
  const [publicKey, setPublicKey] = useState(DEFAULT_PUBLIC_KEY);
  const [apiMode, setApiMode] = useState<ApiMode>("signal");
  const [signalType, setSignalType] = useState<SignalType>("realtime");
  const [timestamp, setTimestamp] = useState(() =>
    Math.floor(Date.now() / 1000),
  );
  const [useNow, setUseNow] = useState(true);

  // Realtime signals
  const [realtimeSignals, setRealtimeSignals] = useState<Signal[]>(
    DEFAULT_REALTIME_SIGNALS,
  );
  // Confirmed signals
  const [premiumSignals, setPremiumSignals] = useState<Signal[]>(
    DEFAULT_PREMIUM_SIGNALS,
  );
  const [smartSignals, setSmartSignals] = useState<Signal[]>(
    DEFAULT_SMART_SIGNALS,
  );

  // Member notify
  const [memberUid, setMemberUid] = useState("12345");
  const [memberUserid, setMemberUserid] = useState("testuser_ym");
  const [memberEndDate, setMemberEndDate] = useState("2027-06-03");
  const [memberIsAdmin, setMemberIsAdmin] = useState("N");
  const [memberIsPremium, setMemberIsPremium] = useState("N");
  const [memberIsSmart, setMemberIsSmart] = useState("N");

  const [logs, setLogs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  function log(msg: string) {
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ${msg}`,
      ...prev,
    ]);
  }

  function setNow() {
    setTimestamp(Math.floor(Date.now() / 1000));
  }

  function buildSignalPayload() {
    const ts = useNow ? Math.floor(Date.now() / 1000) : timestamp;
    if (signalType === "realtime") {
      return {
        data: {
          timestamp: ts,
          signals: realtimeSignals,
        },
      };
    }
    return {
      data: {
        timestamp: ts,
        premium: { signals: premiumSignals },
        smart: { signals: smartSignals },
      },
    };
  }

  function buildMemberPayload() {
    return {
      data: {
        uid: memberUid,
        userid: memberUserid,
        end_date: memberEndDate,
        is_admin: memberIsAdmin,
        is_premium: memberIsPremium,
        is_smart: memberIsSmart,
      },
    };
  }

  async function send() {
    const isSignal = apiMode === "signal";
    const endpoint = isSignal
      ? signalType === "realtime"
        ? "/v1/partner/ym/signal/realtime"
        : "/v1/partner/ym/signal/confirmed"
      : "/v1/partner/ym/member/notify";
    const url = `${wasUrl}${endpoint}`;
    const payload = isSignal ? buildSignalPayload() : buildMemberPayload();
    const payloadJson = JSON.stringify(payload);

    log(`>>> POST ${url}`);
    log(`>>> Plaintext: ${JSON.stringify(payload, null, 2)}`);
    setSending(true);

    try {
      if (!publicKey.trim()) {
        log(`❌ RSA Public Key를 입력하세요`);
        return;
      }

      log(`>>> JWE 암호화 중... (RSA-OAEP + A256GCM)`);
      const jweToken = await encryptJwe(payloadJson, publicKey.trim());
      log(`>>> Encrypted (${jweToken.length} chars): ${jweToken.substring(0, 80)}...`);

      const body = { encrypted: jweToken };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      log(`<<< ${res.status} Response: ${JSON.stringify(data, null, 2)}`);
      if (data.retCode === 0) {
        log(`✅ 전송 성공!`);
      } else {
        log(`⚠️ retCode=${data.retCode}, retMsg=${data.retMsg || ""}`);
      }
    } catch (e) {
      log(`❌ 전송 에러: ${e}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 환경 선택 */}
      <Section title="WAS 환경">
        <div className="flex gap-2">
          {WAS_ENVS.map((env) => (
            <button
              key={env.label}
              onClick={() => {
                setWasUrl(env.url);
                if (env.defaultKey) setPublicKey(env.defaultKey);
              }}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                wasUrl === env.url
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400"
              }`}
            >
              {env.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500 font-mono">{wasUrl}</p>
      </Section>

      {/* RSA Public Key */}
      <Section title="RSA Public Key (JWE 암호화)">
        <textarea
          className={`${inputCls} h-24 text-xs`}
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
        />
        <p className="mt-1 text-xs text-gray-500">
          RSA 2048bit PEM. 알고리즘: RSA-OAEP + A256GCM
        </p>
      </Section>

      {/* API 모드 선택 */}
      <Section title="기능 선택">
        <div className="flex gap-2">
          {(
            [
              { value: "signal", label: "시그널 전송", desc: "signal/realtime, signal/confirmed" },
              { value: "member", label: "회원 정보 변경", desc: "member/notify" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setApiMode(opt.value)}
              className={`px-4 py-2 text-sm rounded-md border ${
                apiMode === opt.value
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400"
              }`}
            >
              {opt.label}
              <span className="block text-xs opacity-60 font-mono">
                {opt.desc}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {apiMode === "signal" ? (
        <>
          {/* 시그널 타입 선택 */}
          <Section title="시그널 타입">
            <div className="flex gap-2">
              {(
                [
                  { value: "realtime", label: "Realtime", desc: "/v1/partner/ym/signal/realtime" },
                  { value: "confirmed", label: "Confirmed", desc: "/v1/partner/ym/signal/confirmed" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSignalType(opt.value)}
                  className={`px-4 py-2 text-sm rounded-md border ${
                    signalType === opt.value
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400"
                  }`}
                >
                  {opt.label}
                  <span className="block text-xs opacity-60 font-mono">
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {/* Timestamp */}
          <Section title="Timestamp">
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useNow}
                onChange={(e) => setUseNow(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-gray-300">전송 시 현재 시간 사용</span>
            </label>
            {!useNow && (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  className={`${inputCls} w-48`}
                  value={timestamp}
                  onChange={(e) => setTimestamp(Number(e.target.value))}
                />
                <button onClick={setNow} className={btnGrayCls}>
                  현재 시간
                </button>
                <span className="text-xs text-gray-500">
                  {new Date(timestamp * 1000).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}{" "}
                  KST
                </span>
              </div>
            )}
          </Section>

          {/* Signals */}
          {signalType === "realtime" ? (
            <Section title="Premium Signals (Realtime)">
              <SignalList
                signals={realtimeSignals}
                onChange={setRealtimeSignals}
                positionOptions={POSITION_OPTIONS_PREMIUM}
                showNonce
              />
            </Section>
          ) : (
            <>
              <Section title="Premium Signals">
                <SignalList
                  signals={premiumSignals}
                  onChange={setPremiumSignals}
                  positionOptions={POSITION_OPTIONS_PREMIUM}
                />
              </Section>
              <Section title="Smart Signals">
                <SignalList
                  signals={smartSignals}
                  onChange={setSmartSignals}
                  positionOptions={POSITION_OPTIONS_SMART}
                />
              </Section>
            </>
          )}
        </>
      ) : (
        /* 회원 정보 변경 */
        <Section title="회원 정보 (member/notify)">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">uid</label>
              <input
                className={inputCls}
                value={memberUid}
                onChange={(e) => setMemberUid(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">userid</label>
              <input
                className={inputCls}
                value={memberUserid}
                onChange={(e) => setMemberUserid(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">end_date</label>
              <input
                type="date"
                className={inputCls}
                value={memberEndDate}
                onChange={(e) => setMemberEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-4">
              {(
                [
                  { key: "is_admin", label: "Admin", value: memberIsAdmin, set: setMemberIsAdmin },
                  { key: "is_premium", label: "Premium", value: memberIsPremium, set: setMemberIsPremium },
                  { key: "is_smart", label: "Smart", value: memberIsSmart, set: setMemberIsSmart },
                ] as const
              ).map((opt) => (
                <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={opt.value === "Y"}
                    onChange={(e) => opt.set(e.target.checked ? "Y" : "N")}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Request Preview & Send */}
      <Section title="요청 미리보기">
        <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-auto max-h-48 mb-4">
          <span className="text-blue-400">POST</span>{" "}
          {wasUrl}
          {apiMode === "signal"
            ? signalType === "realtime"
              ? "/v1/partner/ym/signal/realtime"
              : "/v1/partner/ym/signal/confirmed"
            : "/v1/partner/ym/member/notify"}
          {"\n"}
          <span className="text-gray-500">{"// JWE 암호화되어 { \"encrypted\": \"...\" } 로 전송"}</span>
          {"\n\n"}
          {JSON.stringify(
            apiMode === "signal" ? buildSignalPayload() : buildMemberPayload(),
            null,
            2,
          )}
        </pre>
        <button
          onClick={send}
          disabled={sending}
          className={`${btnCls} ${sending ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {sending
            ? "전송 중..."
            : apiMode === "signal"
              ? "시그널 전송"
              : "회원 정보 변경"}
        </button>
      </Section>

      {/* Logs */}
      <Section title="로그">
        <div className="bg-gray-900 rounded p-3 h-64 overflow-auto font-mono text-xs whitespace-pre-wrap">
          {logs.length === 0 ? (
            <span className="text-gray-500">로그가 여기에 표시됩니다...</span>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="text-gray-300 mb-1">
                {l}
              </div>
            ))
          )}
        </div>
        {logs.length > 0 && (
          <button
            onClick={() => setLogs([])}
            className="mt-2 text-xs text-gray-500 hover:text-gray-300"
          >
            로그 지우기
          </button>
        )}
      </Section>
    </div>
  );
}

/* ─── Signal List Component ─── */

function SignalList({
  signals,
  onChange,
  positionOptions,
  showNonce = false,
}: {
  signals: Signal[];
  onChange: (signals: Signal[]) => void;
  positionOptions: string[];
  showNonce?: boolean;
}) {
  function update(index: number, field: keyof Signal, value: string) {
    const next = [...signals];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  }

  function toggleCancel(index: number) {
    const next = [...signals];
    next[index] = {
      ...next[index],
      nonce: next[index].nonce === "cancel" ? "" : "cancel",
    };
    onChange(next);
  }

  function remove(index: number) {
    onChange(signals.filter((_, i) => i !== index));
  }

  function add() {
    onChange([
      ...signals,
      { symbol: "", position: positionOptions[0], ...(showNonce ? { nonce: "" } : {}) },
    ]);
  }

  return (
    <div className="space-y-2">
      {signals.map((sig, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={`${inputCls} w-40`}
            value={sig.symbol}
            onChange={(e) => update(i, "symbol", e.target.value.toUpperCase())}
            placeholder="BTCUSDT"
          />
          <select
            className="p-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
            value={sig.position}
            onChange={(e) => update(i, "position", e.target.value)}
          >
            {positionOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {showNonce && (
            <button
              onClick={() => toggleCancel(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
                sig.nonce === "cancel"
                  ? "bg-orange-600 border-orange-600 text-white"
                  : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400"
              }`}
            >
              cancel
            </button>
          )}
          <button onClick={() => remove(i)} className={btnRedCls}>
            삭제
          </button>
        </div>
      ))}
      <button onClick={add} className={btnGrayCls}>
        + 시그널 추가
      </button>
    </div>
  );
}

/* ─── Section Component ─── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}
