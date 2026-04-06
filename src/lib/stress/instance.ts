import {
  WalletClient,
  EventClient,
  PublicClient,
  WebSocketTransport,
  HttpTransport,
} from '@nktkas/hyperliquid';
import type { Subscription } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import type { CoinInfo, InstanceState, InstanceStatus, LogEntry } from '@/types/stress';
import { fetchAllMids, pickRandomCoin, calculateLimitPrice, calculateOrderSize } from './coins';
import {
  TESTNET_WS_URL,
  TESTNET_HTTP_URL,
  LOOP_INTERVAL_MS,
  GET_INTERVAL_MS,
  LEVERAGE_MIN,
  LEVERAGE_MAX,
  MIN_ORDER_USD,
} from './constants';

/** Open order info stored from webData2 subscription */
interface StoredOpenOrder {
  coin: string;
  oid: number;
}

export class StressInstance {
  readonly id: number;
  private wsTransport: WebSocketTransport | null = null;
  private eventClient: EventClient | null = null;
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private coins: CoinInfo[];
  private walletAddress: string;
  private enableWs: boolean;

  private subscriptions: Subscription[] = [];
  private leverageInterval: ReturnType<typeof setInterval> | null = null;
  private leverageTimeout: ReturnType<typeof setTimeout> | null = null;
  private orderInterval: ReturnType<typeof setInterval> | null = null;
  private orderLoopTimeout: ReturnType<typeof setTimeout> | null = null;
  private getInterval: ReturnType<typeof setInterval> | null = null;
  private getTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  private openOrders: StoredOpenOrder[] = [];
  private state: InstanceState;

  private onMetric: (key: string) => void;
  private onLog: (entry: LogEntry) => void;
  private onStateChange: (state: InstanceState) => void;

  constructor(
    id: number,
    privateKey: string,
    publicClient: PublicClient,
    coins: CoinInfo[],
    onMetric: (key: string) => void,
    onLog: (entry: LogEntry) => void,
    onStateChange: (state: InstanceState) => void,
    walletAddress?: string,
    enableWs?: boolean,
  ) {
    this.id = id;
    this.publicClient = publicClient;
    this.coins = coins;
    this.onMetric = onMetric;
    this.onLog = onLog;
    this.onStateChange = onStateChange;
    this.enableWs = enableWs !== false; // default true

    // Create WebSocketTransport + EventClient only if WS enabled
    if (this.enableWs) {
      this.wsTransport = new WebSocketTransport({ url: TESTNET_WS_URL });
      this.eventClient = new EventClient({ transport: this.wsTransport });
    }

    // Create wallet from private key
    const wallet = privateKeyToAccount(privateKey as `0x${string}`);
    this.walletAddress = walletAddress ?? wallet.address;

    // Create WalletClient with HTTP transport for exchange operations
    const httpTransport = new HttpTransport({ url: TESTNET_HTTP_URL });
    this.walletClient = new WalletClient({
      transport: httpTransport,
      wallet,
      isTestnet: true,
    });

    // Initialize state
    this.state = {
      id,
      status: 'idle',
      wsConnected: false,
      channelCount: 0,
      errors: 0,
    };
  }

  /** Subscribe to webData2, orderUpdates, and l2Book channels */
  private async subscribeChannels(): Promise<void> {
    if (!this.eventClient) {
      this.log('subscribe', 'success', 'WS disabled — skipping subscriptions');
      return;
    }

    try {
      // webData2: open orders + position info
      const sub1 = await this.eventClient.webData2(
        { user: this.walletAddress as `0x${string}` },
        (data) => {
          // Store open orders from the callback
          this.openOrders = (data.openOrders ?? []).map((o) => ({
            coin: o.coin,
            oid: o.oid,
          }));
        },
      );
      this.subscriptions.push(sub1);
      this.onMetric('channelSubscriptions');
      this.log('subscribe', 'success', 'webData2 subscribed');
    } catch (err) {
      this.log('subscribe', 'fail', `webData2 failed: ${errorMessage(err)}`);
      this.setState('error');
      throw err;
    }

    try {
      // orderUpdates: order status changes
      const sub2 = await this.eventClient.orderUpdates(
        { user: this.walletAddress as `0x${string}` },
        () => {
          // No-op listener — we rely on webData2 for open order tracking
        },
      );
      this.subscriptions.push(sub2);
      this.onMetric('channelSubscriptions');
      this.log('subscribe', 'success', 'orderUpdates subscribed');
    } catch (err) {
      this.log('subscribe', 'fail', `orderUpdates failed: ${errorMessage(err)}`);
      this.setState('error');
      throw err;
    }

    try {
      // l2Book: BTC order book
      const sub3 = await this.eventClient.l2Book(
        { coin: 'BTC', nSigFigs: 5 },
        () => {
          // No-op listener — just maintaining the subscription for stress
        },
      );
      this.subscriptions.push(sub3);
      this.onMetric('channelSubscriptions');
      this.log('subscribe', 'success', 'l2Book(BTC) subscribed');
    } catch (err) {
      this.log('subscribe', 'fail', `l2Book failed: ${errorMessage(err)}`);
      this.setState('error');
      throw err;
    }
  }

  /** Periodically change leverage on a random coin every LOOP_INTERVAL_MS */
  private startLeverageLoop(): void {
    // 30초 이내 랜덤 시작
    const offset = Math.floor(Math.random() * LOOP_INTERVAL_MS);
    this.leverageTimeout = setTimeout(() => {
      if (this.stopped) return;
      this.doLeverage();
      this.leverageInterval = setInterval(() => {
        if (this.stopped) return;
        this.doLeverage();
      }, LOOP_INTERVAL_MS);
    }, offset);
  }

  private async doLeverage(): Promise<void> {
    try {
      const coin = pickRandomCoin(this.coins);
      const maxLev = Math.min(LEVERAGE_MAX, coin.maxLeverage);
      const leverage = Math.floor(Math.random() * (maxLev - LEVERAGE_MIN + 1)) + LEVERAGE_MIN;

      await this.walletClient.updateLeverage({
        asset: coin.index,
        isCross: false,
        leverage,
      });

      this.onMetric('postRequests');
      this.log('leverage', 'success', `${coin.name} leverage → ${leverage}`);
    } catch (err) {
      this.onMetric('errors');
      this.incrementErrors();
      this.handleRateLimit(err);
      this.log('leverage', 'fail', errorMessage(err));
    }
  }

  /** Periodically place limit orders on a random coin, offset from leverage loop */
  private startOrderLoop(): void {
    // 30초 이내 랜덤 시작
    const offset = Math.floor(Math.random() * LOOP_INTERVAL_MS);
    this.orderLoopTimeout = setTimeout(() => {
      if (this.stopped) return;
      this.doOrder();
      this.orderInterval = setInterval(() => {
        if (this.stopped) return;
        this.doOrder();
      }, LOOP_INTERVAL_MS);
    }, offset);
  }

  /** Periodically make GET requests (allMids, meta, etc.) every GET_INTERVAL_MS */
  private startGetLoop(): void {
    // 5초 이내 랜덤 시작
    const offset = Math.floor(Math.random() * GET_INTERVAL_MS);
    this.getTimeout = setTimeout(() => {
      if (this.stopped) return;
      this.doGet();
      this.getInterval = setInterval(() => {
        if (this.stopped) return;
        this.doGet();
      }, GET_INTERVAL_MS);
    }, offset);
  }

  private async doGet(): Promise<void> {
    try {
      // 랜덤으로 GET 요청 종류 선택
      const choice = Math.random();
      if (choice < 0.5) {
        await fetchAllMids(this.publicClient);
        this.onMetric('getRequests');
        this.log('subscribe', 'success', 'GET allMids');
      } else {
        await this.publicClient.meta();
        this.onMetric('getRequests');
        this.log('subscribe', 'success', 'GET meta');
      }
    } catch (err) {
      this.onMetric('errors');
      this.incrementErrors();
      this.handleRateLimit(err);
      this.log('error', 'fail', `GET failed: ${errorMessage(err)}`);
    }
  }

  private async doOrder(): Promise<void> {
    try {
      const coin = pickRandomCoin(this.coins);

      // Fetch current mid prices
      const allMids = await fetchAllMids(this.publicClient);
      this.onMetric('getRequests');

      const midPrice = allMids[coin.name];
      if (!midPrice) {
        this.log('order', 'fail', `No mid price for ${coin.name}`);
        return;
      }

      const limitPrice = calculateLimitPrice(midPrice);
      const orderSize = calculateOrderSize(MIN_ORDER_USD, limitPrice, coin.szDecimals);

      // REST API로 open order 조회 후 한번에 전부 취소
      try {
        const orders = await this.publicClient.openOrders({ user: this.walletAddress as `0x${string}` });
        this.onMetric('getRequests');
        if (orders.length > 0) {
          const cancels = orders.map((o) => {
            const c = this.coins.find((c) => c.name === o.coin);
            return { a: c?.index ?? 0, o: o.oid };
          });
          try {
            await this.walletClient.cancel({ cancels });
            this.onMetric('postRequests');
            this.log('cancel', 'success', `Cancelled ${cancels.length} open orders`);
          } catch {
            // 이미 취소되었을 수 있음
          }
        }
      } catch {
        // open order 조회 실패 — 그냥 주문 시도
      }

      // Place new limit order
      await this.walletClient.order({
        orders: [{
          a: coin.index,
          b: true,
          p: limitPrice,
          s: orderSize,
          r: false,
          t: { limit: { tif: 'Gtc' } },
        }],
        grouping: 'na',
      });
      this.onMetric('postRequests');
      this.log('order', 'success', `${coin.name} buy ${orderSize} @ ${limitPrice}`);
    } catch (err) {
      this.onMetric('errors');
          this.incrementErrors();
          this.handleRateLimit(err);
          this.log('order', 'fail', errorMessage(err));
    }
  }

  /** Cancel all open orders via REST API query */
  private async cleanupOrders(): Promise<void> {
    try {
      const orders = await this.publicClient.openOrders({ user: this.walletAddress as `0x${string}` });
      if (orders.length === 0) return;

      const cancels = orders.map((o) => {
        const c = this.coins.find((c) => c.name === o.coin);
        return { a: c?.index ?? 0, o: o.oid };
      });
      await this.walletClient.cancel({ cancels });
      this.onMetric('postRequests');
      this.log('cancel', 'success', `Cleanup: cancelled ${cancels.length} open orders`);
    } catch {
      // ignore cleanup errors
    }
  }

  /** Stop the instance: clear intervals, cancel orders, close WS */
  async stop(): Promise<void> {
    this.stopped = true;

    // Clear all timers
    if (this.leverageTimeout !== null) {
      clearTimeout(this.leverageTimeout);
      this.leverageTimeout = null;
    }
    if (this.leverageInterval !== null) {
      clearInterval(this.leverageInterval);
      this.leverageInterval = null;
    }
    if (this.orderLoopTimeout !== null) {
      clearTimeout(this.orderLoopTimeout);
      this.orderLoopTimeout = null;
    }
    if (this.orderInterval !== null) {
      clearInterval(this.orderInterval);
      this.orderInterval = null;
    }
    if (this.getTimeout !== null) {
      clearTimeout(this.getTimeout);
      this.getTimeout = null;
    }
    if (this.getInterval !== null) {
      clearInterval(this.getInterval);
      this.getInterval = null;
    }

    // Cancel all open orders
    await this.cleanupOrders();

    // Unsubscribe from all channels
    for (const sub of this.subscriptions) {
      try {
        await sub.unsubscribe();
      } catch {
        // Ignore unsubscribe errors during shutdown
      }
    }
    this.subscriptions = [];

    // Close WebSocket transport
    if (this.wsTransport) {
      try {
        await this.wsTransport.close();
      } catch {
        // Ignore close errors
      }
    }

    // Decrement metrics
    if (this.enableWs) {
      this.onMetric('-wsConnections');
      this.onMetric('-channelSubscriptions');
      this.onMetric('-channelSubscriptions');
      this.onMetric('-channelSubscriptions');
    }

    this.setState('stopped');
  }

  /** Start the instance: connect WS, subscribe channels, start loops */
  async start(): Promise<void> {
    try {
      this.setState('connecting');

      await this.subscribeChannels();

      this.startLeverageLoop();
      this.startOrderLoop();
      this.startGetLoop();

      this.setState('running');
      if (this.enableWs) {
        this.onMetric('wsConnections');
      }
      this.log('connect', 'success', `Instance started${this.enableWs ? '' : ' (WS off)'}`);
    } catch (err) {
      this.setState('error');
      this.log('connect', 'fail', `Start failed: ${errorMessage(err)}`);
    }
  }

  /** Get current instance state */
  getState(): InstanceState {
    return { ...this.state };
  }

  // --- Private helpers ---

  private setState(status: InstanceStatus): void {
    this.state = {
      ...this.state,
      status,
      wsConnected: status === 'running' || status === 'connecting',
      channelCount: this.subscriptions.length,
      lastAction: `State → ${status}`,
    };
    this.onStateChange(this.state);
  }

  private incrementErrors(): void {
    this.state = { ...this.state, errors: this.state.errors + 1 };
  }

  private handleRateLimit(err: unknown): void {
    const msg = errorMessage(err);
    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      this.onMetric('rateLimits');
      this.log('error', 'fail', `Rate limited: ${msg}`);
    }
  }

  private log(action: LogEntry['action'], result: LogEntry['result'], detail?: string): void {
    this.onLog({
      timestamp: new Date().toISOString(),
      instanceId: this.id,
      action,
      result,
      detail,
    });
  }
}

/** Safely extract error message from unknown error */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
