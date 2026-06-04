"use client";

import { useState } from "react";
import { CompactEncrypt, importSPKI } from "jose";

// Form POST 테스터와 동일한 기본 공개키
const DEFAULT_PUBLIC_KEY =
  "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz4ZBbxtzHKUvU3GeXtOC\nuKpAbhiJHSKt/kgig4QMeT0n3wr6zwKWZomz70smvEVZkoX12Aqqdgj8J9MxMzO2\nSFR+OgRn+XLvK182XMxeHWQpk9+ULEaOPOAYWSYo2ao8gsCsJdKT3TakTHtmrh2V\nVcAj2UZvTfro1lPbGu+Sve4Rlbi6xyA/BliwvnVVHTf4DQZmvopDsY002nAwTjdr\nAUswGWRBZTeKUwXk7mWBsoWvtgnnRUHsnW+qQpu6RCRZuGyIrWecbynTRCNMlY/A\nkkQaaWMVL8xR9Mi6LrR0S4XLlV5fR1alQEm1oeNE4du95FtPSIMQkGYCkSTESjbM\nDwIDAQAB\n-----END PUBLIC KEY-----";

// Form POST 테스터와 동일한 기본 데이터
const DEFAULT_PLAINTEXT = JSON.stringify(
  {
    data: {
      uid: "12345",
      userid: "test123",
      temp: "1778461200",
      nonce: "",
      sc_price: "10000",
      end_date: "2027-06-03",
      platform: "EX",
      is_admin: "Y",
      is_premium: "N",
      is_smart: "N",
      alarm_date: "2026-10-25",
      coin_list: ["BTCUSDT", "XRPUSDT"],
    },
  },
  null,
  2,
);

const WAS_ENVS: { label: string; url: string; defaultKey: string }[] = [
  { label: "Dev", url: "https://pnl-dev.supercycl.io", defaultKey: DEFAULT_PUBLIC_KEY },
  { label: "Staging", url: "https://pnl-stg.supercycl.io", defaultKey: "" },
  { label: "Production", url: "https://pnl.supercycl.io", defaultKey: "" },
];

const btnCls =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";
const inputCls =
  "w-full p-2 bg-white border border-zinc-300 rounded text-zinc-900 text-sm font-mono";

// Form POST 테스터와 동일한 JWE 암호화 (RSA-OAEP-256 + A256GCM)
async function encryptJwe(plaintext: string, publicKeyPem: string): Promise<string> {
  const key = await importSPKI(publicKeyPem.trim(), "RSA-OAEP-256");
  const encoder = new TextEncoder();
  return await new CompactEncrypt(encoder.encode(plaintext))
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM" })
    .encrypt(key);
}

export default function YmCoinlistRegister() {
  const [wasUrl, setWasUrl] = useState(WAS_ENVS[0].url);
  const [jwt, setJwt] = useState("");
  const [publicKey, setPublicKey] = useState(DEFAULT_PUBLIC_KEY);
  const [plaintext, setPlaintext] = useState(DEFAULT_PLAINTEXT);
  const [logs, setLogs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  function log(msg: string) {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  }

  async function send() {
    const url = `${wasUrl}/v1/ym/user/update`;
    log(`>>> POST ${url}`);
    setSending(true);

    try {
      if (!jwt.trim()) {
        log("❌ JWT(access-token)를 입력하세요");
        return;
      }
      if (!publicKey.trim()) {
        log("❌ RSA Public Key를 입력하세요");
        return;
      }
      // 데이터 JSON 유효성 체크
      try {
        JSON.parse(plaintext);
      } catch {
        log("❌ 암호화할 데이터가 유효한 JSON이 아닙니다");
        return;
      }

      log(">>> JWE 암호화 중... (RSA-OAEP-256 + A256GCM)");
      const jwe = await encryptJwe(plaintext, publicKey);
      log(`>>> Encrypted (${jwe.length} chars): ${jwe.substring(0, 80)}...`);

      const res = await fetch("/api/ym-coinlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wasUrl, jwt: jwt.trim(), partnerYouthmetaUser: jwe }),
      });
      const result = await res.json();

      if (result.error) {
        log(`❌ 프록시 에러: ${result.error}`);
        return;
      }

      log(`<<< ${result.status} Response: ${JSON.stringify(result.data, null, 2)}`);
      const retCode =
        result.data && typeof result.data === "object"
          ? (result.data as { retCode?: number }).retCode
          : undefined;
      if (retCode === 0) {
        log("✅ 등록 성공!");
      } else if (retCode !== undefined) {
        const retMsg =
          (result.data as { retMsg?: string }).retMsg || "";
        log(`⚠️ retCode=${retCode}, retMsg=${retMsg}`);
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
                  : "bg-white border-zinc-300 text-zinc-500 hover:border-zinc-400"
              }`}
            >
              {env.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500 font-mono">{wasUrl}</p>
      </Section>

      {/* JWT */}
      <Section title="JWT (access-token)">
        <textarea
          className={`${inputCls} h-20 text-xs`}
          value={jwt}
          onChange={(e) => setJwt(e.target.value)}
          placeholder="eyJhbGciOiJ... (Bearer 제외, 토큰 본문만 입력)"
        />
        <p className="mt-1 text-xs text-zinc-500">
          Authorization: Bearer 헤더로 전송됩니다. (Bearer 접두어 없이 토큰만 입력)
        </p>
      </Section>

      {/* RSA Public Key */}
      <Section title="RSA Public Key (JWE 암호화)">
        <textarea
          className={`${inputCls} h-24 text-xs`}
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
        />
        <p className="mt-1 text-xs text-zinc-500">
          RSA 2048bit PEM. 알고리즘: RSA-OAEP-256 + A256GCM (Form POST 테스터와 동일)
        </p>
      </Section>

      {/* 암호화할 데이터 */}
      <Section title="암호화할 데이터">
        <textarea
          className={`${inputCls} h-72 text-xs`}
          value={plaintext}
          onChange={(e) => setPlaintext(e.target.value)}
        />
        <p className="mt-1 text-xs text-zinc-500">
          복호화 평문 {"{ \"data\": { ... } }"} 형식. coin_list가 t_ym_user_watchlist에
          교체 반영됩니다. ([] 이면 전부 삭제, 키 부재 시 무변경)
        </p>
      </Section>

      {/* 요청 미리보기 & 전송 */}
      <Section title="요청 미리보기">
        <pre className="p-3 bg-zinc-50 rounded text-xs text-zinc-700 overflow-auto max-h-48 mb-4">
          <span className="text-blue-600">POST</span> {wasUrl}/v1/ym/user/update
          {"\n"}
          <span className="text-zinc-500">Authorization: Bearer {"{JWT}"}</span>
          {"\n"}
          <span className="text-zinc-500">
            {"// data가 JWE 암호화되어 { \"partnerYouthmetaUser\": \"...\" } 로 전송"}
          </span>
          {"\n\n"}
          {plaintext}
        </pre>
        <button
          onClick={send}
          disabled={sending}
          className={`${btnCls} ${sending ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {sending ? "전송 중..." : "코인리스트 등록"}
        </button>
      </Section>

      {/* 로그 */}
      <Section title="로그">
        <div className="bg-zinc-50 rounded p-3 h-64 overflow-auto font-mono text-xs whitespace-pre-wrap">
          {logs.length === 0 ? (
            <span className="text-zinc-500">로그가 여기에 표시됩니다...</span>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="text-zinc-700 mb-1">
                {l}
              </div>
            ))
          )}
        </div>
        {logs.length > 0 && (
          <button
            onClick={() => setLogs([])}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-700"
          >
            로그 지우기
          </button>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-white">
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}
