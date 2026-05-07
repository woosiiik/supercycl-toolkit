"use client";

import { useState } from "react";

interface ExportRow {
  address: string;
  exLinked: boolean;
  exAccountId: string;
  okxLinked: boolean;
  signupRoute: string;
  createdAt: string;
  affiliateNo: number | null;
}


export default function UserExport() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [ymOnly, setYmOnly] = useState(true);

  const filteredRows = ymOnly ? rows.filter((r) => r.affiliateNo === 1) : rows;

  async function handleFetch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/user-export");
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: ExportRow[] = await res.json();
      setRows(data);
      setFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  function handleExportCsv() {
    const header =
      "Supercycl Account,EX 연동 유무,EX 계정 ID,OKX 연동 유무,Supercycl 최초 가입 경로,Supercycl 가입 시기 (UTC)";
    const lines = [header];
    for (const r of filteredRows) {
      lines.push(
        `${r.address},${r.exLinked ? "O" : "X"},${r.exAccountId},${r.okxLinked ? "O" : "X"},${r.signupRoute},${r.createdAt}`,
      );
    }
    const csv = lines.join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    a.download = `user-export-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cellBase = "px-3 py-2 text-sm";
  const borderR = "border-r border-zinc-200 dark:border-zinc-700";
  const thClass = `${borderR} px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleFetch}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "🔍 DB 조회"}
        </button>

        {fetched && rows.length > 0 && (
          <button
            onClick={handleExportCsv}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            📥 CSV 다운로드 ({filteredRows.length}건)
          </button>
        )}

        <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={ymOnly}
            onChange={(e) => setYmOnly(e.target.checked)}
            className="rounded"
          />
          Youthmeta User Only
        </label>

        {fetched && (
          <span className="text-xs text-zinc-400">
            {filteredRows.length}명{ymOnly ? ` (전체 ${rows.length}명)` : ""}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
          <br />
          <span className="text-xs">
            ⚠️ localhost에서 VPN 연결 후 사용하세요.
          </span>
        </div>
      )}

      {fetched && filteredRows.length > 0 && (
        <div className="max-h-[600px] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table
            className="w-full text-sm"
            style={{ borderCollapse: "collapse" }}
          >
            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Supercycl Account</th>
                <th className={thClass}>EX 연동</th>
                <th className={thClass}>EX 계정 ID</th>
                <th className={thClass}>OKX 연동</th>
                <th className={thClass}>가입 경로</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  가입 시기 (UTC)
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => (
                <tr
                  key={r.address}
                  className="border-t border-zinc-200 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
                >
                  <td
                    className={`${borderR} ${cellBase} tabular-nums text-zinc-400`}
                  >
                    {i + 1}
                  </td>
                  <td className={`${borderR} ${cellBase} font-mono text-xs`}>
                    {r.address}
                  </td>
                  <td className={`${borderR} ${cellBase} text-center`}>
                    <span
                      className={
                        r.exLinked ? "text-green-600" : "text-zinc-400"
                      }
                    >
                      {r.exLinked ? "O" : "X"}
                    </span>
                  </td>
                  <td className={`${borderR} ${cellBase}`}>{r.exAccountId}</td>
                  <td className={`${borderR} ${cellBase} text-center`}>
                    <span
                      className={
                        r.okxLinked ? "text-green-600" : "text-zinc-400"
                      }
                    >
                      {r.okxLinked ? "O" : "X"}
                    </span>
                  </td>
                  <td className={`${borderR} ${cellBase}`}>
                    <span
                      className={
                        r.signupRoute === "Mobile"
                          ? "text-purple-600 dark:text-purple-400"
                          : ""
                      }
                    >
                      {r.signupRoute}
                    </span>
                  </td>
                  <td className={`${cellBase} tabular-nums`}>{r.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fetched && filteredRows.length === 0 && !error && (
        <div className="rounded-md border border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          데이터가 없습니다.
        </div>
      )}
    </div>
  );
}
