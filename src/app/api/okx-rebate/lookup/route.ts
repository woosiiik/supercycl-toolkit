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

function getDevDbConfig() {
  return {
    host: process.env.MYSQL_HOST_DEV || "",
    port: Number(process.env.MYSQL_PORT_DEV || 3306),
    user: process.env.MYSQL_USER_DEV || "",
    password: process.env.MYSQL_PASSWORD_DEV || "",
    database: process.env.MYSQL_DATABASE_DEV || "pnl_db",
  };
}

function getStagingDbConfig() {
  return {
    host: process.env.MYSQL_HOST_STAGING || "",
    port: Number(process.env.MYSQL_PORT_STAGING || 3306),
    user: process.env.MYSQL_USER_STAGING || "",
    password: process.env.MYSQL_PASSWORD_STAGING || "",
    database: process.env.MYSQL_DATABASE_STAGING || "pnl_db",
  };
}

/** 특정 DB에서 order_id 존재 여부를 배치 조회 */
async function checkOrderIds(
  conn: mysql.Connection,
  table: string,
  orderIds: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < orderIds.length; i += DB_BATCH_SIZE) {
    const batch = orderIds.slice(i, i + DB_BATCH_SIZE);
    const ph = batch.map(() => "?").join(",");
    const [rows] = await conn.query(
      `SELECT DISTINCT order_id FROM ${table} WHERE order_id IN (${ph})`,
      batch,
    );
    for (const r of rows as Array<{ order_id: string }>) {
      found.add(r.order_id);
    }
  }
  return found;
}

/** 특정 DB 테이블에서 order_id별 address, exchange_uid 조회 */
async function lookupOrderDetails(
  conn: mysql.Connection,
  table: string,
  orderIds: string[],
): Promise<Map<string, { address: string | null; exchangeUid: string | null }>> {
  const result = new Map<string, { address: string | null; exchangeUid: string | null }>();
  for (let i = 0; i < orderIds.length; i += DB_BATCH_SIZE) {
    const batch = orderIds.slice(i, i + DB_BATCH_SIZE);
    const ph = batch.map(() => "?").join(",");
    const [rows] = await conn.query(
      `SELECT order_id, address, exchange_uid FROM ${table} WHERE order_id IN (${ph})`,
      batch,
    );
    for (const r of rows as Array<{ order_id: string; address: string | null; exchange_uid: string | null }>) {
      if (!result.has(r.order_id)) {
        result.set(r.order_id, { address: r.address || null, exchangeUid: r.exchange_uid || null });
      }
    }
  }
  return result;
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

    // 전체 order_id에 대한 cross-env check
    type CrossEntry = {
      mainnetOrder: boolean;
      mainnetTrade: boolean;
      devnetOrder: boolean;
      devnetTrade: boolean;
      stagingOrder: boolean;
      stagingTrade: boolean;
      resolvedAddress: string | null;
      resolvedExchangeUid: string | null;
      resolvedSource: string | null;
    };
    const crossCheckMap: Record<string, CrossEntry> = {};

    // Mainnet t_order_history
    const mainnetOrderSet = await checkOrderIds(conn, "t_order_history", orderIds);
    // 미매핑 order에 대해 상세 조회 (우선순위별)
    const mainnetOrderDetails = await lookupOrderDetails(conn, "t_order_history", unmappedOrderIds);

    // Dev DB
    let devOrderSet = new Set<string>();
    let devTradeSet = new Set<string>();
    let devOrderDetails = new Map<string, { address: string | null; exchangeUid: string | null }>();
    let devTradeDetails = new Map<string, { address: string | null; exchangeUid: string | null }>();
    const devCfg = getDevDbConfig();
    if (devCfg.host) {
      let devConn;
      try {
        devConn = await mysql.createConnection(devCfg);
        [devOrderSet, devTradeSet, devOrderDetails, devTradeDetails] = await Promise.all([
          checkOrderIds(devConn, "t_order_history", orderIds),
          checkOrderIds(devConn, "t_trade_history", orderIds),
          lookupOrderDetails(devConn, "t_order_history", unmappedOrderIds),
          lookupOrderDetails(devConn, "t_trade_history", unmappedOrderIds),
        ]);
      } catch { /* dev DB 접속 실패 무시 */ } finally {
        if (devConn) await devConn.end();
      }
    }

    // Staging DB
    let stagingOrderSet = new Set<string>();
    let stagingTradeSet = new Set<string>();
    let stagingOrderDetails = new Map<string, { address: string | null; exchangeUid: string | null }>();
    let stagingTradeDetails = new Map<string, { address: string | null; exchangeUid: string | null }>();
    const stagingCfg = getStagingDbConfig();
    if (stagingCfg.host) {
      let stagingConn;
      try {
        stagingConn = await mysql.createConnection(stagingCfg);
        [stagingOrderSet, stagingTradeSet, stagingOrderDetails, stagingTradeDetails] = await Promise.all([
          checkOrderIds(stagingConn, "t_order_history", orderIds),
          checkOrderIds(stagingConn, "t_trade_history", orderIds),
          lookupOrderDetails(stagingConn, "t_order_history", unmappedOrderIds),
          lookupOrderDetails(stagingConn, "t_trade_history", unmappedOrderIds),
        ]);
      } catch { /* staging DB 접속 실패 무시 */ } finally {
        if (stagingConn) await stagingConn.end();
      }
    }

    // 우선순위: main order > dev order > dev trade > staging order > staging trade
    const detailSources: Array<{ details: Map<string, { address: string | null; exchangeUid: string | null }>; label: string }> = [
      { details: mainnetOrderDetails, label: "Main Order" },
      { details: devOrderDetails, label: "Dev Order" },
      { details: devTradeDetails, label: "Dev Trade" },
      { details: stagingOrderDetails, label: "Stg Order" },
      { details: stagingTradeDetails, label: "Stg Trade" },
    ];

    for (const oid of orderIds) {
      let resolvedAddress: string | null = null;
      let resolvedExchangeUid: string | null = null;
      let resolvedSource: string | null = null;

      if (!mappedOrderIds.has(oid)) {
        for (const src of detailSources) {
          const d = src.details.get(oid);
          if (d && (d.address || d.exchangeUid)) {
            resolvedAddress = d.address;
            resolvedExchangeUid = d.exchangeUid;
            resolvedSource = src.label;
            break;
          }
        }
      }

      crossCheckMap[oid] = {
        mainnetOrder: mainnetOrderSet.has(oid),
        mainnetTrade: mappedOrderIds.has(oid),
        devnetOrder: devOrderSet.has(oid),
        devnetTrade: devTradeSet.has(oid),
        stagingOrder: stagingOrderSet.has(oid),
        stagingTrade: stagingTradeSet.has(oid),
        resolvedAddress,
        resolvedExchangeUid,
        resolvedSource,
      };
    }

    return NextResponse.json({ trades, unmappedOrderIds, affiliateUsers, exAccountIdMap, registeredDateMap, exchangeUidToAddress, crossCheckMap });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
