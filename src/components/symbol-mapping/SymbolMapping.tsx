"use client";

import { useState, useEffect, useCallback } from "react";

interface Mapping {
  mapping_no: number;
  ym_symbol: string;
  exchange_name: string;
  exchange_symbol: string;
  created_at: string;
}

const EXCHANGES = ["Bitget", "Bybit", "Gateio", "Hyperliquid", "OKX"] as const;

const DB_ENVS = [
  { label: "Local", value: "local" },
  { label: "Dev", value: "dev" },
  { label: "Staging", value: "staging" },
  { label: "Production", value: "production" },
] as const;

const inputCls =
  "p-2 bg-white border border-zinc-300 rounded text-zinc-900 text-sm";
const btnCls =
  "rounded-md px-3 py-1.5 text-sm font-medium text-white";

export default function SymbolMapping() {
  const [env, setEnv] = useState("local");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 추가 폼
  const [newYmSymbol, setNewYmSymbol] = useState("");
  const [newExchange, setNewExchange] = useState<string>(EXCHANGES[0]);
  const [newExSymbol, setNewExSymbol] = useState("");

  // 수정 중인 행
  const [editingNo, setEditingNo] = useState<number | null>(null);
  const [editYmSymbol, setEditYmSymbol] = useState("");
  const [editExchange, setEditExchange] = useState("");
  const [editExSymbol, setEditExSymbol] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/symbol-mapping?env=${env}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setMappings(json.data || []);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [env]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAdd() {
    if (!newYmSymbol || !newExSymbol) return;
    try {
      const res = await fetch(`/api/symbol-mapping?env=${env}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ym_symbol: newYmSymbol.trim(),
          exchange_name: newExchange,
          exchange_symbol: newExSymbol.trim(),
        }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setNewYmSymbol("");
        setNewExSymbol("");
        fetchData();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  function startEdit(m: Mapping) {
    setEditingNo(m.mapping_no);
    setEditYmSymbol(m.ym_symbol);
    setEditExchange(m.exchange_name);
    setEditExSymbol(m.exchange_symbol);
  }

  async function handleUpdate() {
    if (!editingNo) return;
    try {
      const res = await fetch(`/api/symbol-mapping?env=${env}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping_no: editingNo,
          ym_symbol: editYmSymbol.trim(),
          exchange_name: editExchange,
          exchange_symbol: editExSymbol.trim(),
        }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setEditingNo(null);
        fetchData();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(mappingNo: number) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/symbol-mapping?env=${env}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping_no: mappingNo }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        fetchData();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  // ym_symbol 기준으로 그룹핑
  const grouped = new Map<string, Mapping[]>();
  for (const m of mappings) {
    const list = grouped.get(m.ym_symbol) || [];
    list.push(m);
    grouped.set(m.ym_symbol, list);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 환경 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">DB 환경:</span>
        {DB_ENVS.map((e) => (
          <button
            key={e.value}
            onClick={() => setEnv(e.value)}
            className={`px-3 py-1.5 text-sm rounded-md border ${
              env === e.value
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-zinc-300 text-zinc-500 hover:border-zinc-400"
            }`}
          >
            {e.label}
          </button>
        ))}
        <button
          onClick={fetchData}
          className={`${btnCls} bg-zinc-200 hover:bg-zinc-300 text-zinc-700 ml-2`}
        >
          새로고침
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-600 hover:text-red-800">✕</button>
        </div>
      )}

      {/* 추가 폼 */}
      <div className="border border-zinc-200 rounded-lg p-4 bg-white">
        <h3 className="text-sm font-semibold text-zinc-900 mb-3">매핑 추가</h3>
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">YM 심볼</label>
            <input
              className={inputCls}
              value={newYmSymbol}
              onChange={(e) => setNewYmSymbol(e.target.value)}
              placeholder="BTC"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">거래소</label>
            <select
              className={`${inputCls} min-w-[140px]`}
              value={newExchange}
              onChange={(e) => setNewExchange(e.target.value)}
            >
              {EXCHANGES.map((ex) => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">거래소 심볼</label>
            <input
              className={inputCls}
              value={newExSymbol}
              onChange={(e) => setNewExSymbol(e.target.value)}
              placeholder="BTCUSDT"
            />
          </div>
          <button
            onClick={handleAdd}
            className={`${btnCls} bg-blue-600 hover:bg-blue-700`}
          >
            추가
          </button>
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <p className="text-zinc-500 text-sm">로딩 중...</p>
      ) : mappings.length === 0 ? (
        <p className="text-zinc-500 text-sm">데이터가 없습니다.</p>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 text-zinc-500 text-left">
                <th className="px-4 py-3 font-medium">YM 심볼</th>
                <th className="px-4 py-3 font-medium">거래소</th>
                <th className="px-4 py-3 font-medium">거래소 심볼</th>
                <th className="px-4 py-3 font-medium w-32">작업</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([ymSymbol, items]) =>
                items.map((m, idx) => (
                  <tr
                    key={m.mapping_no}
                    className={`border-t border-zinc-200 ${
                      idx === 0 && "border-t-zinc-300"
                    } hover:bg-zinc-50`}
                  >
                    {/* YM 심볼: 그룹 첫 행에만 표시 */}
                    {idx === 0 ? (
                      <td
                        className="px-4 py-2 font-mono font-semibold text-yellow-600 align-top"
                        rowSpan={items.length}
                      >
                        {ymSymbol}
                      </td>
                    ) : null}

                    {editingNo === m.mapping_no ? (
                      <>
                        <td className="px-4 py-2">
                          <select
                            className={`${inputCls} w-full`}
                            value={editExchange}
                            onChange={(e) => setEditExchange(e.target.value)}
                          >
                            {EXCHANGES.map((ex) => (
                              <option key={ex} value={ex}>{ex}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            className={`${inputCls} w-full`}
                            value={editExSymbol}
                            onChange={(e) => setEditExSymbol(e.target.value)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={handleUpdate}
                              className={`${btnCls} bg-green-600 hover:bg-green-700`}
                            >
                              저장
                            </button>
                            <button
                              onClick={() => setEditingNo(null)}
                              className={`${btnCls} bg-zinc-200 hover:bg-zinc-300 text-zinc-700`}
                            >
                              취소
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-zinc-700">{m.exchange_name}</td>
                        <td className="px-4 py-2 font-mono text-zinc-700">{m.exchange_symbol}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(m)}
                              className={`${btnCls} bg-zinc-200 hover:bg-zinc-300 text-zinc-700`}
                            >
                              수정
                            </button>
                            <button
                              onClick={() => handleDelete(m.mapping_no)}
                              className={`${btnCls} bg-red-600 hover:bg-red-700`}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-600">
        총 {mappings.length}건 · {grouped.size}개 YM 심볼
      </p>
    </div>
  );
}
