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

    // address가 없는 trade의 exchange_uid로 t_exchange_account.main_address 유추
    const exchangeUidToAddress: Record<string, string> = {};
    const noAddrUids = new Set<string>();
    for (const t of trades) {
      if (!t.address && t.exchangeUid) noAddrUids.add(t.exchangeUid);
    }
    if (noAddrUids.size > 0) {
      const uidList = Array.from(noAddrUids);
      for (let i = 0; i < uidList.length; i += DB_BATCH_SIZE) {
        const batch = uidList.slice(i, i + DB_BATCH_SIZE);
        const ph = batch.map(() => "?").join(",");
        const [rows] = await conn.query(
          `SELECT exchange_uid, main_address FROM t_exchange_account
           WHERE exchange_uid IN (${ph}) AND main_address != ''`,
          batch,
        );
        for (const r of rows as Array<{ exchange_uid: string; main_address: string }>) {
          exchangeUidToAddress[r.exchange_uid] = r.main_address;
        }
      }
    }

    // 매핑된 주소 목록 수집 (유추된 주소 포함)
    const addressSet = new Set<string>();
    for (const t of trades) {
      const addr = t.address || (t.exchangeUid ? exchangeUidToAddress[t.exchangeUid] : null);
      if (addr) addressSet.add(addr);
    }
    const addresses = Array.from(addressSet);

    // t_partner_youthmeta_user → address → ym_userid 매핑
    const exAccountIdMap: Record<string, string> = {};
    if (addresses.length > 0) {
      for (let i = 0; i < addresses.length; i += DB_BATCH_SIZE) {
        const batch = addresses.slice(i, i + DB_BATCH_SIZE);
        const ph = batch.map(() => "?").join(",");
        const [rows] = await conn.query(
          `SELECT address, ym_userid, status FROM t_partner_youthmeta_user
           WHERE address IN (${ph})
           ORDER BY FIELD(status, 'ACTIVE', 'UNLINKED')`,
          batch,
        );
        for (const r of rows as Array<{ address: string; ym_userid: string; status: string }>) {
          if (!exAccountIdMap[r.address]) exAccountIdMap[r.address] = r.ym_userid;
        }
      }
    }

    // t_user → address → created (가입일자) 매핑
    const registeredDateMap: Record<string, string> = {};
    if (addresses.length > 0) {
      for (let i = 0; i < addresses.length; i += DB_BATCH_SIZE) {
        const batch = addresses.slice(i, i + DB_BATCH_SIZE);
        const ph = batch.map(() => "?").join(",");
        const [rows] = await conn.query(
          `SELECT address, DATE_FORMAT(created_at, '%Y-%m-%d') AS reg_date FROM t_user
           WHERE address IN (${ph})`,
          batch,
        );
        for (const r of rows as Array<{ address: string; reg_date: string }>) {
          registeredDateMap[r.address] = r.reg_date;
        }
      }
    }

    return NextResponse.json({ trades, unmappedOrderIds, affiliateUsers, exAccountIdMap, registeredDateMap, exchangeUidToAddress });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
