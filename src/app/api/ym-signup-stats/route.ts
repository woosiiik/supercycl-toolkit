import mysql from "mysql2/promise";
import { NextResponse } from "next/server";

function getDbConfig() {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "pnl_db",
  };
}

export async function GET() {
  let conn;
  try {
    conn = await mysql.createConnection(getDbConfig());

    // 일일 가입자 수 (affiliate_no = 1, 2026-04-11부터)
    const [signupRows] = await conn.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS dt, COUNT(*) AS cnt
       FROM t_user
       WHERE affiliate_no = 1 AND created_at >= '2026-04-11'
       GROUP BY dt
       ORDER BY dt`,
    );

    // 일일 EX 연동자 수 (ym_platform = 'ex', 2026-04-11부터)
    const [exRows] = await conn.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS dt, COUNT(*) AS cnt
       FROM t_partner_youthmeta_user
       WHERE ym_platform = 'ex' AND created_at >= '2026-04-11'
       GROUP BY dt
       ORDER BY dt`,
    );

    return NextResponse.json({
      signups: signupRows as Array<{ dt: string; cnt: number }>,
      exLinks: exRows as Array<{ dt: string; cnt: number }>,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
