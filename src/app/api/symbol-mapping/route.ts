import mysql from "mysql2/promise";
import { NextRequest, NextResponse } from "next/server";

type DbEnv = "production" | "staging" | "dev" | "local";

function getDbConfig(env: DbEnv) {
  switch (env) {
    case "dev":
      return {
        host: process.env.MYSQL_HOST_DEV || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT_DEV || 3306),
        user: process.env.MYSQL_USER_DEV || "root",
        password: process.env.MYSQL_PASSWORD_DEV || "",
        database: process.env.MYSQL_DATABASE_DEV || "pnl_db",
      };
    case "staging":
      return {
        host: process.env.MYSQL_HOST_STAGING || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT_STAGING || 3306),
        user: process.env.MYSQL_USER_STAGING || "root",
        password: process.env.MYSQL_PASSWORD_STAGING || "",
        database: process.env.MYSQL_DATABASE_STAGING || "pnl_db",
      };
    default:
      return {
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || "pnl_db",
      };
  }
}

// GET: 전체 조회
export async function GET(req: NextRequest) {
  const env = (req.nextUrl.searchParams.get("env") || "production") as DbEnv;
  let conn;
  try {
    conn = await mysql.createConnection(getDbConfig(env));
    const [rows] = await conn.query(
      "SELECT mapping_no, ym_symbol, exchange_name, exchange_symbol, created_at FROM t_ym_symbol_mapping ORDER BY ym_symbol, exchange_name",
    );
    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}

// POST: 추가
export async function POST(req: NextRequest) {
  const env = (req.nextUrl.searchParams.get("env") || "production") as DbEnv;
  const { ym_symbol, exchange_name, exchange_symbol } = await req.json();
  if (!ym_symbol || !exchange_name || !exchange_symbol) {
    return NextResponse.json({ error: "ym_symbol, exchange_name, exchange_symbol 필수" }, { status: 400 });
  }
  let conn;
  try {
    conn = await mysql.createConnection(getDbConfig(env));
    const [result] = await conn.query(
      "INSERT INTO t_ym_symbol_mapping (ym_symbol, exchange_name, exchange_symbol) VALUES (?, ?, ?)",
      [ym_symbol, exchange_name, exchange_symbol],
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}

// PUT: 수정
export async function PUT(req: NextRequest) {
  const env = (req.nextUrl.searchParams.get("env") || "production") as DbEnv;
  const { mapping_no, ym_symbol, exchange_name, exchange_symbol } = await req.json();
  if (!mapping_no || !ym_symbol || !exchange_name || !exchange_symbol) {
    return NextResponse.json({ error: "mapping_no, ym_symbol, exchange_name, exchange_symbol 필수" }, { status: 400 });
  }
  let conn;
  try {
    conn = await mysql.createConnection(getDbConfig(env));
    const [result] = await conn.query(
      "UPDATE t_ym_symbol_mapping SET ym_symbol = ?, exchange_name = ?, exchange_symbol = ? WHERE mapping_no = ?",
      [ym_symbol, exchange_name, exchange_symbol, mapping_no],
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}

// DELETE: 삭제
export async function DELETE(req: NextRequest) {
  const env = (req.nextUrl.searchParams.get("env") || "production") as DbEnv;
  const { mapping_no } = await req.json();
  if (!mapping_no) {
    return NextResponse.json({ error: "mapping_no 필수" }, { status: 400 });
  }
  let conn;
  try {
    conn = await mysql.createConnection(getDbConfig(env));
    const [result] = await conn.query(
      "DELETE FROM t_ym_symbol_mapping WHERE mapping_no = ?",
      [mapping_no],
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
