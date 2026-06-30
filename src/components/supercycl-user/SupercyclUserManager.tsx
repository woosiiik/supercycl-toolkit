"use client";

import { useState } from "react";

type DbEnv = "dev" | "staging" | "prod";

interface TableInfo {
  table: string;
  keyColumn: string;
  count: number;
  rows: Record<string, unknown>[];
  truncated: boolean;
}

interface LookupResult {
  env: DbEnv;
  address: string;
  ymUids: Array<string | number>;
  found: boolean;
  totalRows: number;
  tables: TableInfo[];
}

const ENV_OPTIONS: { value: DbEnv; label: string }[] = [
  { value: "dev", label: "Dev" },
  { value: "staging", label: "Staging" },
  { value: "prod", label: "Production" },
];

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// SQL 리터럴로 안전하게 변환 (숫자는 그대로, 그 외는 따옴표 + escape)
function sqlLiteral(v: string | number): string {
  if (typeof v === "number") return String(v);
  if (/^\d+$/.test(v)) return v; // 순수 숫자 문자열(ym_uid 등)은 숫자로
  return `'${v.replace(/'/g, "''")}'`;
}

// 조회 결과를 바탕으로 삭제 SQL 스크립트 생성
function buildDeleteSql(result: LookupResult): string {
  const addr = result.address;
  const lines: string[] = [];

  lines.push(
    `-- =============================================================`,
    `-- [${result.env.toUpperCase()}] 유저 삭제 SQL`,
    `-- address: ${addr}`,
  );
  if (result.ymUids.length > 0) {
    lines.push(`-- ym_uid: ${result.ymUids.join(", ")}`);
  }
  lines.push(
    `-- 대상: ${result.tables.length}개 테이블, 총 ${result.totalRows}행`,
    `-- ⚠️ 실행 전 반드시 환경/대상 확인. 되돌릴 수 없습니다.`,
    `-- =============================================================`,
    `SET FOREIGN_KEY_CHECKS = 0;`,
    `START TRANSACTION;`,
    ``,
  );

  // t_user는 다른 테이블이 참조할 수 있으므로 마지막에 삭제
  const ordered = [...result.tables].sort((a, b) => {
    if (a.table === "t_user") return 1;
    if (b.table === "t_user") return -1;
    return 0;
  });

  for (const t of ordered) {
    let where: string;
    if (t.keyColumn === "ym_uid") {
      const list = result.ymUids.map(sqlLiteral).join(", ");
      where = `\`ym_uid\` IN (${list})`;
    } else {
      where = `\`${t.keyColumn}\` = ${sqlLiteral(addr)}`;
    }
    lines.push(`DELETE FROM \`${t.table}\` WHERE ${where};  -- ${t.count}행`);
  }

  lines.push(``, `COMMIT;`, `SET FOREIGN_KEY_CHECKS = 1;`);

  return lines.join("\n");
}

export default function SupercyclUserManager() {
  const [env, setEnv] = useState<DbEnv>("dev");
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 생성된 삭제 SQL (앱은 직접 삭제하지 않고 쿼리문만 출력)
  const [deleteSql, setDeleteSql] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // production은 SQL 생성 전 모달로 한 번 더 확인
  const [showProdModal, setShowProdModal] = useState(false);

  async function handleLookup() {
    const addr = address.trim();
    if (!addr) {
      setError("address를 입력하세요");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setDeleteSql(null);
    setCopied(false);
    try {
      const res = await fetch(
        `/api/supercycl-user?env=${env}&address=${encodeURIComponent(addr)}`,
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setResult(body as LookupResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  function doGenerateSql() {
    if (!result?.found) return;
    setDeleteSql(buildDeleteSql(result));
    setCopied(false);
    setShowProdModal(false);
  }

  function handleGenerateSql() {
    if (!result?.found) return;
    if (env === "prod") {
      // production은 모달로 한 번 더 확인 후 SQL 생성
      setShowProdModal(true);
      return;
    }
    doGenerateSql();
  }

  async function handleCopySql() {
    if (!deleteSql) return;
    try {
      await navigator.clipboard.writeText(deleteSql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 권한 없으면 무시 (사용자가 직접 선택/복사)
    }
  }

  const cellBase = "px-3 py-1.5 text-xs whitespace-nowrap";
  const thClass =
    "px-3 py-1.5 text-left text-[11px] font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap";

  return (
    <div className="flex flex-col gap-4">
      {/* 환경 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          환경
        </span>
        <div className="flex gap-1 rounded-md border border-zinc-300 p-0.5 dark:border-zinc-600">
          {ENV_OPTIONS.map((opt) => {
            const active = env === opt.value;
            const isProd = opt.value === "prod";
            return (
              <button
                key={opt.value}
                onClick={() => setEnv(opt.value)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  active
                    ? isProd
                      ? "bg-red-600 text-white"
                      : "bg-blue-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {env === "prod" && (
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">
            ⚠️ 프로덕션 환경입니다
          </span>
        )}
      </div>

      {/* 주소 입력 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleLookup();
          }}
          placeholder="유저 address (0x...)"
          className="w-[28rem] max-w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-800"
        />
        <button
          onClick={handleLookup}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "🔍 조회"}
        </button>
        {result?.found && (
          <button
            onClick={handleGenerateSql}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            🗑 유저삭제 SQL 생성
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
          <br />
          <span className="text-xs">
            ⚠️ DB 접속 권한 및 VPN 연결을 확인하세요. (조회는 읽기 권한이면 충분)
          </span>
        </div>
      )}

      {/* 생성된 삭제 SQL */}
      {deleteSql && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40">
          <div className="flex items-center justify-between border-b border-red-200 px-3 py-2 dark:border-red-800">
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">
              삭제 SQL (앱에서 실행하지 않음 — 직접 검토 후 실행하세요)
            </span>
            <button
              onClick={handleCopySql}
              className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-zinc-800"
            >
              {copied ? "✅ 복사됨" : "📋 복사"}
            </button>
          </div>
          <textarea
            readOnly
            value={deleteSql}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
            className="block h-72 w-full resize-y bg-transparent p-3 font-mono text-xs text-zinc-800 outline-none dark:text-zinc-200"
          />
        </div>
      )}

      {/* 조회 결과 */}
      {result && !result.found && (
        <div className="rounded-md border border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          [{result.env.toUpperCase()}] 해당 address의 데이터가 없습니다.
        </div>
      )}

      {result?.found && (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold">[{result.env.toUpperCase()}]</span>{" "}
            <span className="font-mono">{result.address}</span> — {result.tables.length}개
            테이블, 총 {result.totalRows}행
            {result.ymUids.length > 0 && (
              <span className="ml-1">
                · ym_uid: {result.ymUids.join(", ")}
              </span>
            )}
          </div>

          {result.tables.map((t) => {
            const columns =
              t.rows.length > 0 ? Object.keys(t.rows[0]) : [];
            return (
              <div
                key={t.table}
                className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
              >
                <div className="flex items-center justify-between bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  <span className="font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {t.table}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    key: {t.keyColumn} · {t.count}행
                    {t.truncated && ` (상위 ${t.rows.length}행 표시)`}
                  </span>
                </div>
                <div className="max-h-[400px] overflow-auto">
                  <table
                    className="w-full text-xs"
                    style={{ borderCollapse: "collapse" }}
                  >
                    <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
                      <tr>
                        {columns.map((c) => (
                          <th key={c} className={thClass}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-t border-zinc-200 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
                        >
                          {columns.map((c) => (
                            <td key={c} className={`${cellBase} font-mono`}>
                              {formatCell(row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Production 확인 모달 (SQL 생성 전) */}
      {showProdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-red-300 bg-white p-6 shadow-xl dark:border-red-700 dark:bg-zinc-900">
            <h2 className="mb-2 text-lg font-bold text-red-600 dark:text-red-400">
              ⚠️ 프로덕션(PRODUCTION) 환경입니다
            </h2>
            <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
              <strong className="text-red-600">PRODUCTION</strong> DB 기준으로
              아래 유저를 삭제하는 SQL을 생성합니다. 생성된 쿼리는 직접 검토 후
              책임지고 실행하세요.
            </p>
            <div className="mb-4 break-all rounded-md bg-zinc-100 p-2 font-mono text-xs dark:bg-zinc-800">
              {address.trim()}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowProdModal(false)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                onClick={doGenerateSql}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                프로덕션 삭제 SQL 생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
