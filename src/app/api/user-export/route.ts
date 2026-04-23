import mysql from "mysql2/promise";
import { NextResponse } from "next/server";

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "supercycl",
};

export async function GET() {
  let conn;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);

    const [users] = (await conn.query(
      "SELECT address, signup_memo, affiliate_no, DATE_FORMAT(DATE_ADD(created_at, INTERVAL 9 HOUR), '%Y-%m-%d %H:%i:%s') as created_at FROM t_user ORDER BY created_at DESC",
    )) as any;

    const [ymRows] = (await conn.query(
      "SELECT address, ym_userid FROM t_partner_youthmeta_user",
    )) as any;
    const ymMap = new Map<string, string>();
    for (const r of ymRows) ymMap.set(r.address, r.ym_userid);

    const [okxRows] = (await conn.query(
      "SELECT main_address FROM t_exchange_account WHERE exchange_uid LIKE 'OKX\\_%'",
    )) as any;
    const okxSet = new Set<string>();
    for (const r of okxRows) okxSet.add(r.main_address);

    const rows = (users as any[]).map((u: any) => ({
      address: u.address,
      exLinked: ymMap.has(u.address),
      exAccountId: ymMap.get(u.address) || "",
      okxLinked: okxSet.has(u.address),
      signupRoute:
        u.signup_memo === "Youthmeta-event-20260411" ? "Mobile" : "PC",
      createdAt: u.created_at,
      affiliateNo: u.affiliate_no,
    }));

    return NextResponse.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
