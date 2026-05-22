import mysql from "mysql2/promise";
import { NextRequest, NextResponse } from "next/server";

type DbEnv = "local" | "dev";

function getDbConfig(env: DbEnv) {
  if (env === "dev") {
    return {
      host: process.env.MYSQL_HOST_DEV || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT_DEV || 3306),
      user: process.env.MYSQL_USER_DEV || "root",
      password: process.env.MYSQL_PASSWORD_DEV || "",
      database: process.env.MYSQL_DATABASE_DEV || "pnl_db",
      timezone: "+00:00",
    };
  }
  return {
    host: "127.0.0.1",
    port: 3307,
    user: "pnl",
    password: "password",
    database: "pnl_db",
    timezone: "+00:00",
  };
}

export async function GET(req: NextRequest) {
  const env = (req.nextUrl.searchParams.get("env") || "local") as DbEnv;
  const type = req.nextUrl.searchParams.get("type") || "coins";
  const symbol = req.nextUrl.searchParams.get("symbol") || "";

  let conn;
  try {
    conn = await mysql.createConnection(getDbConfig(env));

    if (type === "coins") {
      // t_ym_coin에서 코인 목록 + 최신 유효 시그널 (CANCELED 제외, 없으면 CANCELED 이전 것)
      const [rows] = await conn.query(`
        SELECT c.symbol, h.position, h.signal_type, h.timestamp
        FROM t_ym_coin c
        LEFT JOIN (
          SELECT h1.symbol, h1.position, h1.signal_type, h1.timestamp
          FROM t_ym_coin_signal_history h1
          INNER JOIN (
            SELECT symbol, MAX(signal_no) AS max_no
            FROM t_ym_coin_signal_history
            WHERE signal_type != 'CANCELED'
            GROUP BY symbol
          ) h2 ON h1.symbol = h2.symbol AND h1.signal_no = h2.max_no
        ) h ON c.symbol = h.symbol
        ORDER BY c.symbol
      `);
      return NextResponse.json({ data: rows });
    }

    if (type === "history" && symbol) {
      const limit = Number(req.nextUrl.searchParams.get("limit") || 200);
      const [rows] = await conn.query(
        `SELECT signal_no, symbol, position, signal_type, timestamp, created_at
         FROM t_ym_coin_signal_history
         WHERE symbol = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
        [symbol, limit],
      );
      return NextResponse.json({ data: rows });
    }

    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
