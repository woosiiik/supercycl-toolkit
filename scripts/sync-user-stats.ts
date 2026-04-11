/**
 * MySQL 원본 데이터를 Supabase에 동기화하는 스크립트.
 * PC에서 VPN 연결 후 실행.
 *
 * 환경변수 (.env 파일):
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * 실행: npx tsx scripts/sync-user-stats.ts
 * 주기적 실행: npx tsx scripts/sync-user-stats.ts --loop (10초 간격)
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://crliioegbtkgdlrypnap.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "supercycl",
};

const BATCH_SIZE = 500;

// ── Supabase upsert helper ──

async function upsertToSupabase(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  if (rows.length === 0) return;

  // 배치 단위로 upsert
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(batch),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase upsert ${table} failed: ${res.status} ${text}`);
    }
  }
}

// ── MySQL → Supabase sync functions ──

async function syncUsers(conn: mysql.Connection | mysql.PoolConnection) {
  const [rows] = (await conn.query(
    "SELECT address, affiliate_no, signup_memo, created_at FROM t_user",
  )) as any;
  const mapped = (rows as any[]).map((r: any) => ({
    address: r.address,
    affiliate_no: r.affiliate_no,
    signup_memo: r.signup_memo,
    created_at: r.created_at,
  }));
  await upsertToSupabase("users", mapped, "address");
  return mapped.length;
}

async function syncYmUsers(conn: mysql.Connection | mysql.PoolConnection) {
  const [rows] = (await conn.query(
    "SELECT mapping_no, address, ym_platform, ym_uid, ym_userid, created_at FROM t_partner_youthmeta_user",
  )) as any;
  const mapped = (rows as any[]).map((r: any) => ({
    mapping_no: r.mapping_no,
    address: r.address,
    ym_platform: r.ym_platform,
    ym_uid: r.ym_uid,
    ym_userid: r.ym_userid,
    created_at: r.created_at,
  }));
  await upsertToSupabase("ym_users", mapped, "mapping_no");
  return mapped.length;
}

async function syncOkxUsers(conn: mysql.Connection | mysql.PoolConnection) {
  const [rows] = (await conn.query(
    "SELECT exchange_uid, main_address, created_at FROM t_exchange_account WHERE exchange_uid LIKE 'OKX\\_%'",
  )) as any;
  const mapped = (rows as any[]).map((r: any) => ({
    exchange_uid: r.exchange_uid,
    main_address: r.main_address,
    created_at: r.created_at,
  }));
  await upsertToSupabase("okx_users", mapped, "exchange_uid");
  return mapped.length;
}

// ── Main ──

const LOOP_INTERVAL = 10_000; // 10초

async function syncAll(conn: mysql.Connection | mysql.PoolConnection) {
  const userCount = await syncUsers(conn);
  const ymCount = await syncYmUsers(conn);
  const okxCount = await syncOkxUsers(conn);
  const now = new Date().toLocaleTimeString();
  console.log(
    `[${now}] synced: users=${userCount} ym=${ymCount} okx=${okxCount}`,
  );
}

async function runOnce() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    await syncAll(conn);
  } finally {
    await conn.end();
  }
}

async function runLoop() {
  console.log("🔄 Loop mode: 10초 간격으로 동기화 시작");
  const pool = mysql.createPool({ ...MYSQL_CONFIG, connectionLimit: 2 });

  while (true) {
    try {
      const conn = await pool.getConnection();
      try {
        await syncAll(conn);
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error(
        `[${new Date().toLocaleTimeString()}] Error:`,
        err instanceof Error ? err.message : err,
      );
    }
    await new Promise((r) => setTimeout(r, LOOP_INTERVAL));
  }
}

const isLoop = process.argv.includes("--loop");

if (isLoop) {
  runLoop().catch((err) => {
    console.error("Fatal loop error:", err);
    process.exit(1);
  });
} else {
  runOnce()
    .then(() => {
      console.log("✅ Done");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal:", err);
      process.exit(1);
    });
}
