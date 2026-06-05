"use client";

import { useState, useMemo } from "react";
import { CompactEncrypt, importSPKI } from "jose";

// JWT payload 디코딩 (검증 없이 표시용). 실패 시 null.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.trim().split(".");
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Form POST 테스터와 동일한 기본 공개키
const DEFAULT_PUBLIC_KEY =
  "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz4ZBbxtzHKUvU3GeXtOC\nuKpAbhiJHSKt/kgig4QMeT0n3wr6zwKWZomz70smvEVZkoX12Aqqdgj8J9MxMzO2\nSFR+OgRn+XLvK182XMxeHWQpk9+ULEaOPOAYWSYo2ao8gsCsJdKT3TakTHtmrh2V\nVcAj2UZvTfro1lPbGu+Sve4Rlbi6xyA/BliwvnVVHTf4DQZmvopDsY002nAwTjdr\nAUswGWRBZTeKUwXk7mWBsoWvtgnnRUHsnW+qQpu6RCRZuGyIrWecbynTRCNMlY/A\nkkQaaWMVL8xR9Mi6LrR0S4XLlV5fR1alQEm1oeNE4du95FtPSIMQkGYCkSTESjbM\nDwIDAQAB\n-----END PUBLIC KEY-----";

const WAS_ENVS: { label: string; url: string; defaultKey: string }[] = [
  { label: "Dev", url: "https://pnl-dev.supercycl.io", defaultKey: DEFAULT_PUBLIC_KEY },
  { label: "Staging", url: "https://pnl-stg.supercycl.io", defaultKey: "" },
  { label: "Production", url: "https://pnl.supercycl.io", defaultKey: "" },
];

const btnCls =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";
const inputCls =
  "w-full p-2 bg-white border border-zinc-300 rounded text-zinc-900 text-sm font-mono";

// 중요하지 않은 필드 기본값
const DEFAULT_TEMP = "1111111";
const DEFAULT_NONCE = "nonce01";
const DEFAULT_SC_PRICE = "1000";
const DEFAULT_PLATFORM = "parameter";

// Form POST 테스터와 동일한 JWE 암호화 (RSA-OAEP-256 + A256GCM)
async function encryptJwe(plaintext: string, publicKeyPem: string): Promise<string> {
  const key = await importSPKI(publicKeyPem.trim(), "RSA-OAEP-256");
  const encoder = new TextEncoder();
  return await new CompactEncrypt(encoder.encode(plaintext))
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM" })
    .encrypt(key);
}

// "BTCUSDT, XRPUSDT" 또는 줄바꿈 구분 → ["BTCUSDT", "XRPUSDT"]
function parseCoinList(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

export default function YmCoinlistRegister() {
  const [wasUrl, setWasUrl] = useState(WAS_ENVS[0].url);
  const [jwt, setJwt] = useState("");
  const [publicKey, setPublicKey] = useState(DEFAULT_PUBLIC_KEY);

  // 회원 정보 입력 폼
  const [fUid, setFUid] = useState(""); // ymUid (수정불가)
  const [fUserid, setFUserid] = useState("test123");
  const [fTemp, setFTemp] = useState(DEFAULT_TEMP);
  const [fNonce, setFNonce] = useState(DEFAULT_NONCE);
  const [fScPrice, setFScPrice] = useState(DEFAULT_SC_PRICE);
  const [fPlatform, setFPlatform] = useState(DEFAULT_PLATFORM);
  const [fEndDate, setFEndDate] = useState("2027-06-03");
  const [fAlarmDate, setFAlarmDate] = useState("2026-10-25");
  const [fIsAdmin, setFIsAdmin] = useState("N");
  const [fIsPremium, setFIsPremium] = useState("N");
  const [fIsSmart, setFIsSmart] = useState("N");
  const [fCoinList, setFCoinList] = useState("BTCUSDT, XRPUSDT");

  const [logs, setLogs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [userResult, setUserResult] = useState<Record<string, unknown> | null>(
    null,
  );

  // 폼 → 전송 payload
  const buildData = () => ({
    data: {
      uid: fUid,
      userid: fUserid,
      temp: fTemp,
      nonce: fNonce,
      sc_price: fScPrice,
      platform: fPlatform,
      end_date: fEndDate,
      alarm_date: fAlarmDate,
      is_admin: fIsAdmin,
      is_premium: fIsPremium,
      is_smart: fIsSmart,
      coin_list: parseCoinList(fCoinList),
    },
  });

  // JWT에서 address, exp 추출 및 만료 여부 (입력 즉시 갱신)
  const jwtInfo = useMemo(() => {
    if (!jwt.trim()) return null;
    const payload = decodeJwtPayload(jwt);
    if (!payload) return { error: true as const };
    const address =
      typeof payload.master === "string" ? payload.master : undefined;
    const exp = typeof payload.exp === "number" ? payload.exp : undefined;
    const expired = exp !== undefined ? exp * 1000 < Date.now() : undefined;
    return { error: false as const, address, exp, expired };
  }, [jwt]);

  function log(msg: string) {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  }

  // GET /v1/ym/user 조회
  async function fetchUser() {
    if (!jwt.trim()) {
      log("❌ JWT(access-token)를 입력하세요");
      return;
    }
    setFetching(true);
    setUserResult(null);
    log(`>>> GET ${wasUrl}/v1/ym/user`);

    try {
      const res = await fetch(
        `/api/ym-coinlist?wasUrl=${encodeURIComponent(wasUrl)}&jwt=${encodeURIComponent(jwt.trim())}`,
      );
      const raw = await res.text();
      let result: { error?: string; status?: number; data?: unknown };
      try {
        result = JSON.parse(raw);
      } catch {
        log(`❌ 응답 파싱 실패 (HTTP ${res.status}): ${raw.slice(0, 300)}`);
        return;
      }

      if (result.error) {
        log(`❌ 프록시 에러 (HTTP ${res.status}): ${result.error}`);
        return;
      }

      const httpStatus = result.status ?? res.status;
      log(
        `<<< HTTP ${httpStatus} 조회 응답: ${JSON.stringify(result.data, null, 2)}`,
      );

      const dataObj =
        result.data && typeof result.data === "object"
          ? (result.data as {
              retCode?: number;
              retMessage?: string;
              retMsg?: string;
              result?: Record<string, unknown>;
            })
          : null;

      if (dataObj?.retCode === 0) {
        setUserResult(dataObj.result ?? {});
        applyResultToForm(dataObj.result ?? {});
        log("✅ 조회 성공! 결과를 회원 정보 입력 폼에 반영했습니다.");
        log(
          "ⓘ GET 응답에 없는 필드(temp/nonce/sc_price/platform/is_admin)는 기존 입력값을 유지합니다.",
        );
      } else if (httpStatus < 200 || httpStatus >= 300) {
        log(`❌ WAS 오류 응답: HTTP ${httpStatus}`);
      } else if (dataObj?.retCode !== undefined) {
        log(
          `❌ 조회 실패: retCode=${dataObj.retCode}, retMessage=${dataObj.retMessage || dataObj.retMsg || ""}`,
        );
      } else {
        log("⚠️ 표준 응답(retCode)이 아닙니다. 위 응답 본문을 확인하세요.");
      }
    } catch (e) {
      log(`❌ 조회 에러: ${e}`);
    } finally {
      setFetching(false);
    }
  }

  // 조회 결과를 폼에 반영 (GET에 있는 필드만)
  function applyResultToForm(result: Record<string, unknown>) {
    const r = result as {
      ymUid?: string;
      ymUserid?: string;
      isPremium?: boolean;
      isSmart?: boolean;
      ymEndDate?: string;
      alarmDate?: string;
      watchlist?: Array<{ symbol: string; name?: string }>;
    };
    if (typeof r.ymUid === "string") setFUid(r.ymUid);
    if (typeof r.ymUserid === "string") setFUserid(r.ymUserid);
    if (typeof r.ymEndDate === "string") setFEndDate(r.ymEndDate);
    if (typeof r.alarmDate === "string") setFAlarmDate(r.alarmDate);
    setFIsPremium(r.isPremium ? "Y" : "N");
    setFIsSmart(r.isSmart ? "Y" : "N");
    if (Array.isArray(r.watchlist)) {
      setFCoinList(r.watchlist.map((w) => w.symbol).join(", "));
    }
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

      const payloadJson = JSON.stringify(buildData());
      log(`>>> Plaintext: ${JSON.stringify(buildData(), null, 2)}`);
      log(">>> JWE 암호화 중... (RSA-OAEP-256 + A256GCM)");
      const jwe = await encryptJwe(payloadJson, publicKey);
      log(`>>> Encrypted (${jwe.length} chars): ${jwe.substring(0, 80)}...`);

      const res = await fetch("/api/ym-coinlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wasUrl, jwt: jwt.trim(), partnerYouthmetaUser: jwe }),
      });

      // 프록시 응답 파싱 (HTML 에러 페이지 등 비-JSON 응답도 표시)
      const raw = await res.text();
      let result: {
        error?: string;
        status?: number;
        url?: string;
        data?: unknown;
      };
      try {
        result = JSON.parse(raw);
      } catch {
        log(`❌ 프록시 응답 파싱 실패 (HTTP ${res.status}): ${raw.slice(0, 300)}`);
        return;
      }

      if (result.error) {
        log(`❌ 프록시 에러 (HTTP ${res.status}): ${result.error}`);
        return;
      }

      const httpStatus = result.status ?? res.status;
      log(
        `<<< HTTP ${httpStatus} Response: ${JSON.stringify(result.data, null, 2)}`,
      );

      const dataObj =
        result.data && typeof result.data === "object"
          ? (result.data as {
              retCode?: number;
              retMessage?: string;
              retMsg?: string;
              result?: Record<string, unknown>;
            })
          : null;
      const retCode = dataObj?.retCode;

      if (retCode === 0) {
        log("✅ 유저 정보 변경 성공!");
        // 변경 후 최신 정보 표시 (응답이 GET /v1/ym/user와 동일 형식)
        if (dataObj?.result) {
          setUserResult(dataObj.result);
          applyResultToForm(dataObj.result);
        }
      } else if (retCode !== undefined) {
        log(
          `❌ 실패: retCode=${retCode}, retMessage=${dataObj?.retMessage || dataObj?.retMsg || ""}`,
        );
      } else if (httpStatus < 200 || httpStatus >= 300) {
        log(`❌ WAS 오류 응답: HTTP ${httpStatus}`);
      } else {
        log("⚠️ 표준 응답(retCode)이 아닙니다. 위 응답 본문을 확인하세요.");
      }
    } catch (e) {
      log(`❌ 전송 에러: ${e}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
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
        {jwtInfo &&
          (jwtInfo.error ? (
            <p className="mt-2 text-xs text-red-600">
              ⚠️ JWT 디코딩 실패 — 토큰 형식을 확인하세요.
            </p>
          ) : (
            <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-2 text-xs font-mono text-zinc-700">
              <div className="break-all">
                <span className="text-zinc-500">address: </span>
                {jwtInfo.address ?? "(없음)"}
              </div>
              <div className="mt-0.5">
                <span className="text-zinc-500">exp: </span>
                {jwtInfo.exp !== undefined ? (
                  <>
                    {new Date(jwtInfo.exp * 1000).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}{" "}
                    KST{" "}
                    {jwtInfo.expired ? (
                      <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 font-sans font-semibold text-red-700">
                        만료됨
                      </span>
                    ) : (
                      <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 font-sans font-semibold text-green-700">
                        유효
                      </span>
                    )}
                  </>
                ) : (
                  "(없음)"
                )}
              </div>
            </div>
          ))}
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={fetchUser}
            disabled={fetching}
            className={`${btnCls} ${fetching ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {fetching ? "조회 중..." : "조회"}
          </button>
          <p className="text-xs text-zinc-500">
            GET /v1/ym/user — 현재 회원 정보를 조회하여 아래 폼에 채웁니다.
          </p>
        </div>
      </Section>

      {/* 회원 정보 입력 폼 (좌) + 조회 결과 (우) */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <Section title="회원 정보 입력 (변경할 값)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="ymUid (수정불가)" value={fUid} readOnly />
              <Field label="userid" value={fUserid} onChange={setFUserid} />
              <Field
                label="end_date"
                type="date"
                value={fEndDate}
                onChange={setFEndDate}
              />
              <Field
                label="alarm_date"
                type="date"
                value={fAlarmDate}
                onChange={setFAlarmDate}
              />
              <Field label="temp" value={fTemp} onChange={setFTemp} />
              <Field label="nonce" value={fNonce} onChange={setFNonce} />
              <Field label="sc_price" value={fScPrice} onChange={setFScPrice} />
              <Field label="platform" value={fPlatform} onChange={setFPlatform} />
            </div>

            <div className="mt-3 flex items-center gap-4">
              {(
                [
                  { label: "is_admin", value: fIsAdmin, set: setFIsAdmin },
                  { label: "is_premium", value: fIsPremium, set: setFIsPremium },
                  { label: "is_smart", value: fIsSmart, set: setFIsSmart },
                ] as const
              ).map((o) => (
                <label
                  key={o.label}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={o.value === "Y"}
                    onChange={(e) => o.set(e.target.checked ? "Y" : "N")}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-zinc-700">
                    {o.label} ({o.value})
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-3">
              <label className="block text-xs text-zinc-500 mb-1">
                coin_list (콤마 또는 줄바꿈 구분)
              </label>
              <textarea
                className={`${inputCls} h-20`}
                value={fCoinList}
                onChange={(e) => setFCoinList(e.target.value)}
                placeholder="BTCUSDT, XRPUSDT"
              />
              <p className="mt-1 text-xs text-zinc-500">
                t_ym_user_watchlist에 교체 반영됩니다. (비우면 전부 삭제)
              </p>
            </div>
          </Section>
        </div>

        {userResult && (
          <div className="w-96 shrink-0">
            <Section title="조회 결과 (GET /v1/ym/user)">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(userResult).map(([k, v]) => (
                    <tr
                      key={k}
                      className="border-b border-zinc-100 last:border-0"
                    >
                      <td className="py-1.5 pr-3 align-top font-mono text-xs text-zinc-500 whitespace-nowrap">
                        {k}
                      </td>
                      <td className="py-1.5 font-mono text-xs text-zinc-800 break-all">
                        {renderVal(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>
        )}
      </div>

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

      {/* 요청 미리보기 & 전송 */}
      <Section title="요청 미리보기">
        <pre className="p-3 bg-zinc-50 rounded text-xs text-zinc-700 overflow-auto max-h-60 mb-4">
          <span className="text-blue-600">POST</span> {wasUrl}/v1/ym/user/update
          {"\n"}
          <span className="text-zinc-500">Authorization: Bearer {"{JWT}"}</span>
          {"\n"}
          <span className="text-zinc-500">
            {"// data가 JWE 암호화되어 { \"partnerYouthmetaUser\": \"...\" } 로 전송"}
          </span>
          {"\n\n"}
          {JSON.stringify(buildData(), null, 2)}
        </pre>
        <button
          onClick={send}
          disabled={sending}
          className={`${btnCls} ${sending ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {sending ? "전송 중..." : "유스메타 유저 정보 변경"}
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <input
        type={type}
        className={`${inputCls} ${readOnly ? "bg-zinc-100 text-zinc-500 cursor-not-allowed" : ""}`}
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </div>
  );
}

function renderVal(v: unknown): string {
  if (Array.isArray(v)) {
    if (v.length === 0) return "(빈 목록)";
    return v
      .map((item) => {
        if (item && typeof item === "object" && "symbol" in item) {
          const o = item as { symbol: string; name?: string };
          return o.name ? `${o.symbol} (${o.name})` : o.symbol;
        }
        return String(item);
      })
      .join(", ");
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
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
