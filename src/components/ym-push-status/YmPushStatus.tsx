"use client";

import { useState } from "react";

type DbEnv = "local" | "dev" | "prod";

interface StatusResult {
  address: string;
  user: {
    address: string;
    affiliate_no: number | null;
    created_at: string;
  } | null;
  ymUser: {
    ym_uid: string;
    ym_userid: string;
    ym_end_date: string;
    is_admin: number;
    is_premium: number;
    is_smart: number;
    status: string;
    created_at: string;
    updated_at: string;
  } | null;
  watchlist: string[];
  pushSubscriptions: Array<{
    subscription_no: number;
    endpoint: string;
    address: string;
    user_agent: string | null;
    last_bind_time: string | null;
    created_at: string;
  }>;
  notifSettings: {
    ym_signal_enabled: number;
    ym_signal_signal_occur: number;
    ym_signal_signal_confirm: number;
    ym_signal_counter_position: number;
    _exists: boolean;
  };
  exchangeKeys: Array<{
    address: string;
    exchange_name: string;
    uid: string;
  }>;
  positions: Array<{
    symbol: string;
    direction: string;
    member: string;
  }>;
}

const btnCls =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";
const inputCls =
  "w-full p-2 border border-zinc-300 rounded text-zinc-900 text-sm font-mono bg-white";

export default function YmPushStatus() {
  const [env, setEnv] = useState<DbEnv>("dev");
  const [addressInput, setAddressInput] = useState("");
  const [uidInput, setUidInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StatusResult | null>(null);

  async function query() {
    if (!addressInput && !uidInput) {
      setError("address 또는 OKX UID를 입력하세요");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ env });
      if (addressInput) params.set("address", addressInput);
      if (uidInput) params.set("uid", uidInput);
      const res = await fetch(`/api/ym-push-status?${params}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 환경 선택 */}
      <Section title="환경">
        <div className="flex gap-2">
          {(["local", "dev", "prod"] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEnv(e)}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                env === e
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400"
              }`}
            >
              {e === "local" ? "Local" : e === "dev" ? "Dev" : "Prod"}
            </button>
          ))}
        </div>
      </Section>

      {/* 조회 */}
      <Section title="사용자 조회">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-1">
              Wallet Address (0x...)
            </label>
            <input
              className={inputCls}
              value={addressInput}
              onChange={(e) => {
                setAddressInput(e.target.value);
                if (e.target.value) setUidInput("");
              }}
              placeholder="0x3b5e79a05e7e4b1a8d7bcf153eeaabd520d5b7ba"
            />
          </div>
          <div className="text-zinc-400 text-sm pb-2">또는</div>
          <div className="w-48">
            <label className="block text-xs text-zinc-500 mb-1">
              OKX UID
            </label>
            <input
              className={inputCls}
              value={uidInput}
              onChange={(e) => {
                setUidInput(e.target.value);
                if (e.target.value) setAddressInput("");
              }}
              placeholder="644794618454153352"
            />
          </div>
          <button
            onClick={query}
            disabled={loading}
            className={`${btnCls} ${loading ? "opacity-50" : ""}`}
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </Section>

      {result && (
        <>
          {uidInput && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
              <span className="text-zinc-500">Address: </span>
              <span className="font-mono font-medium text-zinc-900">{result.address}</span>
            </div>
          )}
          <StatusView result={result} env={env} addressInput={addressInput} uidInput={uidInput} />
        </>
      )}
    </div>
  );
}

/* ─── Status View ─── */

type CheckId =
  | "user"
  | "ymUser"
  | "ymStatus"
  | "ymExpiry"
  | "isPremium"
  | "isSmart"
  | "watchlist"
  | "pushSub"
  | "notifEnabled"
  | "notifOccur"
  | "notifConfirm"
  | "notifCounter";

interface CheckDetail {
  title: string;
  table: string;
  data: Record<string, unknown> | unknown[] | null;
  boldKeys: string[];
}

function StatusView({
  result,
  env,
  addressInput,
  uidInput,
}: {
  result: StatusResult;
  env: DbEnv;
  addressInput: string;
  uidInput: string;
}) {
  const { user, ymUser, watchlist, pushSubscriptions, notifSettings, exchangeKeys } = result;
  const [selectedCheck, setSelectedCheck] = useState<CheckId | null>(null);
  const [positions, setPositions] = useState(result.positions);
  const [posLoading, setPosLoading] = useState(false);

  async function refreshPositions() {
    setPosLoading(true);
    try {
      const params = new URLSearchParams({ env, type: "positions" });
      if (addressInput) params.set("address", addressInput);
      if (uidInput) params.set("uid", uidInput);
      const res = await fetch(`/api/ym-push-status?${params}`);
      const data = await res.json();
      if (!data.error) setPositions(data.positions || []);
    } finally {
      setPosLoading(false);
    }
  }

  const checks = {
    userExists: !!user,
    affiliateOk: user?.affiliate_no === 1,
    ymUserExists: !!ymUser,
    ymUserActive: ymUser?.status === "ACTIVE",
    ymNotExpired: ymUser ? new Date(ymUser.ym_end_date) >= new Date(new Date().toISOString().split("T")[0]) : false,
    isPremium: ymUser ? ymUser.is_premium === 1 || ymUser.is_admin === 1 : false,
    isSmart: ymUser ? ymUser.is_smart === 1 || ymUser.is_admin === 1 : false,
    hasWatchlist: watchlist.length > 0,
    hasPushSub: pushSubscriptions.length > 0,
    signalEnabled: notifSettings.ym_signal_enabled === 1,
    signalOccur: notifSettings.ym_signal_signal_occur === 1,
    signalConfirm: notifSettings.ym_signal_signal_confirm === 1,
    counterPosition: notifSettings.ym_signal_counter_position === 1,
  };

  const canReceivePremiumRealtime =
    checks.userExists && checks.affiliateOk && checks.ymUserExists && checks.ymUserActive && checks.ymNotExpired &&
    checks.isPremium && checks.hasWatchlist && checks.hasPushSub &&
    checks.signalEnabled && checks.signalOccur;

  const canReceiveConfirmed =
    checks.userExists && checks.affiliateOk && checks.ymUserExists && checks.ymUserActive && checks.ymNotExpired &&
    (checks.isPremium || checks.isSmart) && checks.hasWatchlist && checks.hasPushSub &&
    checks.signalEnabled && checks.signalConfirm;

  const canReceiveCounter =
    canReceivePremiumRealtime && checks.counterPosition && positions.length > 0;

  return (
    <div className="space-y-4">
      {/* 종합 판정 */}
      <Section title="종합 판정">
        <div className="grid grid-cols-3 gap-3">
          <VerdictCard label="미확정 시그널 (Premium Realtime)" ok={canReceivePremiumRealtime} />
          <VerdictCard label="확정 시그널 (Premium + Smart Confirmed)" ok={canReceiveConfirmed} />
          <VerdictCard label="포지션 반대 시그널" ok={canReceiveCounter} />
        </div>
      </Section>

      {/* 상세 체크 */}
      <Section title="상세 체크리스트">
        {(() => {
          const checkDetailMap: Record<CheckId, CheckDetail> = {
            user: { title: "t_user", table: "t_user", data: user, boldKeys: ["address", "affiliate_no"] },
            ymUser: { title: "t_partner_youthmeta_user", table: "t_partner_youthmeta_user", data: ymUser, boldKeys: ["ym_uid", "ym_userid", "status"] },
            ymStatus: { title: "t_partner_youthmeta_user (status)", table: "t_partner_youthmeta_user", data: ymUser, boldKeys: ["status"] },
            ymExpiry: { title: "t_partner_youthmeta_user (만료일)", table: "t_partner_youthmeta_user", data: ymUser, boldKeys: ["ym_end_date"] },
            isPremium: { title: "t_partner_youthmeta_user (premium)", table: "t_partner_youthmeta_user", data: ymUser, boldKeys: ["is_premium", "is_admin"] },
            isSmart: { title: "t_partner_youthmeta_user (smart)", table: "t_partner_youthmeta_user", data: ymUser, boldKeys: ["is_smart", "is_admin"] },
            watchlist: { title: "t_ym_user_watchlist", table: "t_ym_user_watchlist", data: watchlist, boldKeys: [] },
            pushSub: { title: "t_push_subscription_pwa", table: "t_push_subscription_pwa", data: pushSubscriptions, boldKeys: ["endpoint", "address"] },
            notifEnabled: { title: "t_user_settings_notification", table: "t_user_settings_notification", data: notifSettings._exists ? notifSettings : null, boldKeys: ["ym_signal_enabled"] },
            notifOccur: { title: "t_user_settings_notification", table: "t_user_settings_notification", data: notifSettings._exists ? notifSettings : null, boldKeys: ["ym_signal_signal_occur"] },
            notifConfirm: { title: "t_user_settings_notification", table: "t_user_settings_notification", data: notifSettings._exists ? notifSettings : null, boldKeys: ["ym_signal_signal_confirm"] },
            notifCounter: { title: "t_user_settings_notification", table: "t_user_settings_notification", data: notifSettings._exists ? notifSettings : null, boldKeys: ["ym_signal_counter_position"] },
          };
          const detail = selectedCheck ? checkDetailMap[selectedCheck] : null;

          return (
            <div className="flex gap-4">
              <div className={selectedCheck ? "w-1/2" : "w-full"}>
                <table className="w-full text-sm">
                  <tbody>
                    <CheckRow id="user" label="t_user 파트너 (affiliate) 번호" ok={checks.affiliateOk} detail={user ? `affiliate_no=${user.affiliate_no ?? "NULL"}` : "NOT FOUND"} selected={selectedCheck === "user"} onSelect={setSelectedCheck} />
                    <CheckRow id="ymUser" label="t_partner_youthmeta_user 존재" ok={checks.ymUserExists} detail={ymUser ? `uid=${ymUser.ym_uid}, userid=${ymUser.ym_userid}` : "NOT FOUND"} selected={selectedCheck === "ymUser"} onSelect={setSelectedCheck} />
                    <CheckRow id="ymStatus" label="YM 상태 ACTIVE" ok={checks.ymUserActive} detail={ymUser?.status || "-"} selected={selectedCheck === "ymStatus"} onSelect={setSelectedCheck} />
                    <CheckRow id="ymExpiry" label="YM 만료일 유효" ok={checks.ymNotExpired} detail={ymUser?.ym_end_date || "-"} selected={selectedCheck === "ymExpiry"} onSelect={setSelectedCheck} />
                    <CheckRow id="isPremium" label="is_premium 또는 is_admin" ok={checks.isPremium} detail={ymUser ? `premium=${ymUser.is_premium}, admin=${ymUser.is_admin}` : "-"} selected={selectedCheck === "isPremium"} onSelect={setSelectedCheck} />
                    <CheckRow id="isSmart" label="is_smart 또는 is_admin" ok={checks.isSmart} detail={ymUser ? `smart=${ymUser.is_smart}, admin=${ymUser.is_admin}` : "-"} selected={selectedCheck === "isSmart"} onSelect={setSelectedCheck} />
                    <CheckRow id="watchlist" label="워치리스트 등록" ok={checks.hasWatchlist} detail={watchlist.length > 0 ? `${watchlist.length}개: ${watchlist.join(", ")}` : "0개"} selected={selectedCheck === "watchlist"} onSelect={setSelectedCheck} />
                    <CheckRow id="pushSub" label="Push 구독 (기기 등록)" ok={checks.hasPushSub} detail={`${pushSubscriptions.length}개 기기`} selected={selectedCheck === "pushSub"} onSelect={setSelectedCheck} />
                    <CheckRow id="notifEnabled" label="알림 설정: ym_signal_enabled" ok={checks.signalEnabled} detail={notifSettings._exists ? String(notifSettings.ym_signal_enabled) : "설정 없음 (default=ON)"} selected={selectedCheck === "notifEnabled"} onSelect={setSelectedCheck} />
                    <CheckRow id="notifOccur" label="알림 설정: signal_occur (미확정)" ok={checks.signalOccur} detail={notifSettings._exists ? String(notifSettings.ym_signal_signal_occur) : "설정 없음 (default=ON)"} selected={selectedCheck === "notifOccur"} onSelect={setSelectedCheck} />
                    <CheckRow id="notifConfirm" label="알림 설정: signal_confirm (확정)" ok={checks.signalConfirm} detail={notifSettings._exists ? String(notifSettings.ym_signal_signal_confirm) : "설정 없음 (default=ON)"} selected={selectedCheck === "notifConfirm"} onSelect={setSelectedCheck} />
                    <CheckRow id="notifCounter" label="알림 설정: counter_position (반대 포지션)" ok={checks.counterPosition} detail={notifSettings._exists ? String(notifSettings.ym_signal_counter_position) : "설정 없음 (default=ON)"} selected={selectedCheck === "notifCounter"} onSelect={setSelectedCheck} />
                  </tbody>
                </table>
              </div>

              {detail && (
                <div className="w-1/2 border border-zinc-200 rounded-lg p-4 self-start sticky top-4 bg-zinc-50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-zinc-600">{detail.table}</h4>
                    <button
                      onClick={() => setSelectedCheck(null)}
                      className="text-xs text-zinc-400 hover:text-zinc-700"
                    >
                      닫기
                    </button>
                  </div>
                  {detail.data === null ? (
                    <p className="text-sm text-zinc-500">레코드 없음 (모든 값 default=ON)</p>
                  ) : Array.isArray(detail.data) ? (
                    <div className="overflow-auto max-h-[500px]">
                      {detail.data.length === 0 ? (
                        <p className="text-sm text-zinc-500">데이터 없음</p>
                      ) : typeof detail.data[0] === "string" ? (
                        <div className="flex flex-wrap gap-1.5">
                          {(detail.data as string[]).map((s) => (
                            <span key={s} className="px-2 py-0.5 bg-white border border-zinc-300 rounded text-xs text-zinc-800 font-mono">{s}</span>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(detail.data as Record<string, unknown>[]).map((item, idx) => (
                            <RecordView key={idx} data={item} boldKeys={detail.boldKeys} index={idx} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-auto max-h-[500px]">
                      <RecordView data={detail.data as Record<string, unknown>} boldKeys={detail.boldKeys} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </Section>

      {/* 워치리스트 */}
      <Section title={`워치리스트 (${watchlist.length}개)`}>
        {watchlist.length === 0 ? (
          <p className="text-sm text-zinc-500">등록된 관심 코인 없음</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {watchlist.map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 bg-white border border-zinc-300 rounded text-xs text-zinc-800 font-mono"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Push 구독 */}
      <Section title={`Push 구독 (${pushSubscriptions.length}개 기기)`}>
        {pushSubscriptions.length === 0 ? (
          <p className="text-sm text-zinc-500">등록된 Push 구독 없음</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200">
                <th className="pb-1 pr-2">No</th>
                <th className="pb-1 pr-2">기기 (User-Agent)</th>
                <th className="pb-1 pr-2">Endpoint</th>
                <th className="pb-1 pr-2">Bind Time</th>
                <th className="pb-1">Created</th>
              </tr>
            </thead>
            <tbody>
              {pushSubscriptions.map((sub) => (
                <tr key={sub.subscription_no} className="border-b border-zinc-100">
                  <td className="py-1 pr-2 text-zinc-700">{sub.subscription_no}</td>
                  <td
                    className="py-1 pr-2 text-zinc-700 max-w-xs truncate"
                    title={sub.user_agent || undefined}
                  >
                    {sub.user_agent || "-"}
                  </td>
                  <td className="py-1 pr-2 text-zinc-700 font-mono truncate max-w-sm">
                    {sub.endpoint.substring(0, 60)}...
                  </td>
                  <td className="py-1 pr-2 text-zinc-500">
                    {sub.last_bind_time ? formatDt(sub.last_bind_time) : "-"}
                  </td>
                  <td className="py-1 text-zinc-500">{formatDt(sub.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 거래소 연동 & 포지션 */}
      <Section title="거래소 연동 & 포지션 (반대 시그널용)">
        {exchangeKeys.length === 0 ? (
          <p className="text-sm text-zinc-500">등록된 거래소 API Key 없음</p>
        ) : (
          <div className="space-y-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-200">
                  <th className="pb-1 pr-2">Exchange</th>
                  <th className="pb-1">UID</th>
                </tr>
              </thead>
              <tbody>
                {exchangeKeys.map((k, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="py-1 pr-2 text-zinc-700">{k.exchange_name}</td>
                    <td className="py-1 text-zinc-700 font-mono">{k.uid || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center gap-2 mt-2">
              <h4 className="text-xs font-semibold text-zinc-600">
                현재 보유 포지션 (Redis coin:position)
              </h4>
              <button
                onClick={refreshPositions}
                disabled={posLoading}
                className={`px-2 py-0.5 text-xs rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-100 ${posLoading ? "opacity-50" : ""}`}
              >
                {posLoading ? "조회 중..." : "새로고침"}
              </button>
            </div>
            {positions.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-1">
                {positions.map((p, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      p.direction === "long"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {p.symbol} {p.direction.toUpperCase()}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 mt-1">
                워치리스트 코인에 대한 포지션 없음
              </p>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ─── Sub Components ─── */

function VerdictCard({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      className={`rounded-lg p-3 border ${
        ok
          ? "border-green-300 bg-green-50"
          : "border-red-300 bg-red-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-lg font-bold ${ok ? "text-green-600" : "text-red-600"}`}>
          {ok ? "O" : "X"}
        </span>
        <span className={`text-xs font-medium ${ok ? "text-green-700" : "text-red-700"}`}>
          {ok ? "수신 가능" : "수신 불가"}
        </span>
      </div>
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}

function CheckRow({
  id,
  label,
  ok,
  detail,
  selected,
  onSelect,
}: {
  id: CheckId;
  label: string;
  ok: boolean;
  detail: string;
  selected: boolean;
  onSelect: (id: CheckId | null) => void;
}) {
  return (
    <tr
      className={`border-b border-zinc-100 cursor-pointer hover:bg-zinc-50 ${selected ? "bg-blue-50" : ""}`}
      onClick={() => onSelect(selected ? null : id)}
    >
      <td className="py-1.5 pr-3 w-8">
        <span className={`font-bold ${ok ? "text-green-600" : "text-red-600"}`}>
          {ok ? "O" : "X"}
        </span>
      </td>
      <td className="py-1.5 pr-3 text-zinc-800">{label}</td>
      <td className="py-1.5 text-zinc-500 font-mono text-xs">{detail}</td>
    </tr>
  );
}

function RecordView({
  data,
  boldKeys,
  index,
}: {
  data: Record<string, unknown>;
  boldKeys: string[];
  index?: number;
}) {
  return (
    <div>
      {index !== undefined && (
        <p className="text-xs text-zinc-400 mb-1">#{index + 1}</p>
      )}
      <table className="w-full text-xs">
        <tbody>
          {Object.entries(data)
            .filter(([k]) => !k.startsWith("_"))
            .map(([key, value]) => {
              const isBold = boldKeys.includes(key);
              return (
                <tr key={key} className="border-b border-zinc-100">
                  <td className={`py-1 pr-3 whitespace-nowrap ${isBold ? "font-bold text-zinc-900" : "text-zinc-500"}`}>
                    {key}
                  </td>
                  <td className={`py-1 font-mono break-all ${isBold ? "font-bold text-blue-700" : "text-zinc-700"}`}>
                    {String(value ?? "null")}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
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

function formatDt(dt: string) {
  return new Date(dt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
