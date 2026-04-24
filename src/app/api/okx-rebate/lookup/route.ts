import mysql from "mysql2/promise";
import { NextResponse } from "next/server";
import { DB_BATCH_SIZE } from "@/lib/okx-rebate/constants";

function getDbConfig() {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "pnl_db",
  };
}

export async function POST(request: Request) {
  let conn;
  try {
    const body = await request.json();
    const { orderIds } = body as { orderIds: string[] };

    conn = await mysql.createConnection(getDbConfig());

    // order_id → trade 목록 (같은 order_id에 여러 trade 가능)
    const trades: Array<{
      orderId: string;
      tradeId: string;
      address: string | null;
      exchangeUid: string | null;
      symbol: string;
      direction: string;
      price: string;
      quantity: string;
      fee: string;
      tradedAt: string | null;
    }> = [];
    const mappedOrderIds = new Set<string>();

    for (let i = 0; i < orderIds.length; i += DB_BATCH_SIZE) {
      const batch = orderIds.slice(i, i + DB_BATCH_SIZE);
      const placeholders = batch.map(() => "?").join(",");
      const [rows] = await conn.query(
        `SELECT order_id, trade_id, address, exchange_uid, symbol, direction, price, quantity, fee, traded_at
         FROM t_trade_history
         WHERE order_id IN (${placeholders}) AND exchange_uid LIKE 'OKX\\_%'`,
        batch,
      );

      for (const r of rows as Array<{
        order_id: string; trade_id: string; address: string;
        exchange_uid: string; symbol: string; direction: string;
        price: string; quantity: string; fee: string; traded_at: string | null;
      }>) {
        trades.push({
          orderId: r.order_id,
          tradeId: r.trade_id,
          address: r.address || null,
          exchangeUid: r.exchange_uid || null,
          symbol: r.symbol,
          direction: r.direction,
          price: r.price,
          quantity: r.quantity,
          fee: r.fee,
          tradedAt: r.traded_at,
        });
        mappedOrderIds.add(r.order_id);
      }
    }

    // 미매핑 order_id 목록
    const unmappedOrderIds: string[] = [];
    for (const oid of orderIds) {
      if (!mappedOrderIds.has(oid)) {
        unmappedOrderIds.push(oid);
      }
    }

    // affiliate_no = 1인 사용자 목록
    const [affRows] = await conn.query(
      "SELECT address FROM t_user WHERE affiliate_no = 1",
    );
    const affiliateUsers: string[] = (affRows as Array<{ address: string }>).map(
      (r) => r.address,
    );

    return NextResponse.json({ trades, unmappedOrderIds, affiliateUsers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
