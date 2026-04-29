"use client";

import { useState } from "react";

const SALT_SIZE = 16;
const IV_SIZE = 16;
const ITERATIONS = 1000;
const KEY_BITS = 256;

async function deriveKey(
  password: string,
  salt: Uint8Array,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-512" },
    keyMaterial,
    { name: "AES-CBC", length: KEY_BITS },
    false,
    usage,
  );
}

async function jasyptEncrypt(
  plaintext: string,
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
  const key = await deriveKey(password, salt, ["encrypt"]);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const result = new Uint8Array(
    SALT_SIZE + IV_SIZE + ciphertext.byteLength,
  );
  result.set(salt, 0);
  result.set(iv, SALT_SIZE);
  result.set(new Uint8Array(ciphertext), SALT_SIZE + IV_SIZE);

  return btoa(String.fromCharCode(...result));
}

async function jasyptDecrypt(
  base64Input: string,
  password: string,
): Promise<string> {
  const data = Uint8Array.from(atob(base64Input), (c) => c.charCodeAt(0));

  const salt = data.slice(0, SALT_SIZE);
  const iv = data.slice(SALT_SIZE, SALT_SIZE + IV_SIZE);
  const ciphertext = data.slice(SALT_SIZE + IV_SIZE);

  const key = await deriveKey(password, salt, ["decrypt"]);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

interface ResultRow {
  input: string;
  output: string;
  error?: string;
}

export default function JasyptCrypto() {
  const [password, setPassword] = useState("123456789a");
  const [showPassword, setShowPassword] = useState(false);
  const [encryptInput, setEncryptInput] = useState("");
  const [encryptResults, setEncryptResults] = useState<ResultRow[]>([]);
  const [decryptInput, setDecryptInput] = useState("");
  const [decryptResults, setDecryptResults] = useState<ResultRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseLines(text: string): string[] {
    return text.split("\n").map((l) => l.trim()).filter(Boolean);
  }

  async function handleEncrypt() {
    setError(null);
    setEncryptResults([]);
    const lines = parseLines(encryptInput);
    if (!password || lines.length === 0) {
      setError("Password와 암호화할 텍스트를 입력하세요.");
      return;
    }
    setProcessing(true);
    try {
      const results: ResultRow[] = [];
      for (const line of lines) {
        try {
          const output = await jasyptEncrypt(line, password);
          results.push({ input: line, output });
        } catch (err) {
          results.push({ input: line, output: "", error: err instanceof Error ? err.message : String(err) });
        }
      }
      setEncryptResults(results);
    } finally {
      setProcessing(false);
    }
  }

  async function handleDecrypt() {
    setError(null);
    setDecryptResults([]);
    const lines = parseLines(decryptInput);
    if (!password || lines.length === 0) {
      setError("Password와 복호화할 텍스트를 입력하세요.");
      return;
    }
    setProcessing(true);
    try {
      const results: ResultRow[] = [];
      for (const line of lines) {
        try {
          const output = await jasyptDecrypt(line, password);
          results.push({ input: line, output });
        } catch (err) {
          results.push({ input: line, output: "", error: err instanceof Error ? err.message : String(err) });
        }
      }
      setDecryptResults(results);
    } finally {
      setProcessing(false);
    }
  }

  function copyAll(results: ResultRow[]) {
    const text = results.map((r) => r.error ? `ERROR: ${r.error}` : r.output).join("\n");
    navigator.clipboard.writeText(text);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  const inputCls =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500";
  const btnCls =
    "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
  const copyBtnCls =
    "rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700";
  const tdCls = "px-3 py-2 text-xs font-mono break-all";
  const borderR = "border-r border-zinc-200 dark:border-zinc-700";

  function ResultTable({ results, outputLabel }: { results: ResultRow[]; outputLabel: string }) {
    if (results.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">{results.length}건 처리 완료</span>
          <button onClick={() => copyAll(results)} className={copyBtnCls}>
            결과 전체 복사
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className={`px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 ${borderR} w-8`}>#</th>
                <th className={`px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 ${borderR}`}>입력</th>
                <th className={`px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 ${borderR}`}>{outputLabel}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-zinc-200 dark:border-zinc-700">
                  <td className={`${tdCls} ${borderR} tabular-nums text-zinc-400`}>{i + 1}</td>
                  <td className={`${tdCls} ${borderR} max-w-[300px]`}>{r.input}</td>
                  <td className={`${tdCls} ${borderR} max-w-[400px]`}>
                    {r.error ? (
                      <span className="text-red-500">{r.error}</span>
                    ) : (
                      <span className="text-zinc-900 dark:text-zinc-100">{r.output}</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {!r.error && (
                      <button onClick={() => copyToClipboard(r.output)} className={copyBtnCls}>
                        복사
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Password */}
      <div className="max-w-md">
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          JASYPT_ENCRYPTOR_PASSWORD
        </label>
        <div className="flex gap-2">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="암복호화에 사용할 비밀번호"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            {showPassword ? "숨기기" : "보기"}
          </button>
        </div>
      </div>

      {/* Encrypt */}
      <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          암호화 (Encrypt) — 한 줄에 하나씩
        </h3>
        <div className="flex flex-col gap-3">
          <textarea
            value={encryptInput}
            onChange={(e) => setEncryptInput(e.target.value)}
            placeholder={"0x1234abcd...\n0x5678efgh...\nplaintext3"}
            rows={5}
            className={inputCls}
          />
          <button onClick={handleEncrypt} disabled={processing} className={btnCls}>
            {processing ? "처리 중..." : `암호화 (${parseLines(encryptInput).length}건)`}
          </button>
          <ResultTable results={encryptResults} outputLabel="암호화 결과 (base64)" />
        </div>
      </div>

      {/* Decrypt */}
      <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          복호화 (Decrypt) — 한 줄에 하나씩
        </h3>
        <div className="flex flex-col gap-3">
          <textarea
            value={decryptInput}
            onChange={(e) => setDecryptInput(e.target.value)}
            placeholder={"DtdnER8GWeHU1i6L...\nF9WW......DL9Ow\nbase64text3"}
            rows={5}
            className={inputCls}
          />
          <button onClick={handleDecrypt} disabled={processing} className={btnCls}>
            {processing ? "처리 중..." : `복호화 (${parseLines(decryptInput).length}건)`}
          </button>
          <ResultTable results={decryptResults} outputLabel="복호화 결과" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
