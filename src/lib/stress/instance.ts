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
  private wsTransport: WebSocketTransport;
  private eventClient: EventClient;
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private coins: CoinInfo[];
  private walletAddress: string;

  private subscriptions: Subscription[] = [];
  private leverageInterval: ReturnType<typeof setInterval> | null = null;
  private orderInterval: ReturnType<typeof setInterval> | null = null;
  private orderLoopTimeout: ReturnType<typeof setTimeout> | null = null;

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
  ) {
    this.id = id;
    this.publicClient = publicClient;
    this.coins = coins;
    this.onMetric = onMetric;
    this.onLog = onLog;
    this.onStateChange = onStateChange;

    // Create WebSocketTransport for subscriptions
    this.wsTransport = new WebSocketTransport({ url: TESTNET_WS_URL });

    // Create EventClient with the WS transport
    this.eventClient = new EventClient({ transport: this.wsTransport });

    // Create wallet from private key
    const wallet = privateKeyToAccount(privateKey as `0x${string}`);
    this.walletAddress = wallet.address;

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
    // 인스턴스별 시간차: id * (LOOP_INTERVAL_MS / totalInstances) 만큼 오프셋
    const offset = this.id * 1000; // 인스턴스당 1초 오프셋
    setTimeout(() => {
      this.doLeverage(); // 첫 실행
      this.leverageInterval = setInterval(() => this.doLeverage(), LOOP_INTERVAL_MS);
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
    // 레버리지 루프와 5초 차이 + 인스턴스별 1초 오프셋
    const offset = this.id * 1000 + 5000;
    this.orderLoopTimeout = setTimeout(() => {
      this.doOrder(); // 첫 실행
      this.orderInterval = setInterval(() => this.doOrder(), LOOP_INTERVAL_MS);
    }, offset);
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

          // Calculate size to ensure order value >= $10
          const orderSize = calculateOrderSize(MIN_ORDER_USD, limitPrice, coin.szDecimals);

          // Check for existing open orders on this coin and cancel if found
          const existingOrder = this.openOrders.find((o) => o.coin === coin.name);
          if (existingOrder) {
            try {
              await this.walletClient.cancel({
                cancels: [{ a: coin.index, o: existingOrder.oid }],
              });
              this.onMetric('postRequests');
              this.log('cancel', 'success', `Cancelled ${coin.name} oid=${existingOrder.oid}`);
            } catch (cancelErr) {
              this.onMetric('errors');
              this.incrementErrors();
              this.handleRateLimit(cancelErr);
              this.log('cancel', 'fail', `Cancel ${coin.name} failed: ${errorMessage(cancelErr)}`);
            }
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

  /** Cancel all open orders from stored webData2 data */
  private async cleanupOrders(): Promise<void> {
    if (this.openOrders.length === 0) return;

    // Cancel each order individually, ignoring already-cancelled errors
    let cancelled = 0;
    for (const o of this.openOrders) {
      const coin = this.coins.find((c) => c.name === o.coin);
      try {
        await this.walletClient.cancel({ cancels: [{ a: coin?.index ?? 0, o: o.oid }] });
        cancelled++;
      } catch {
        // Ignore — order may already be cancelled or filled
      }
    }
    this.onMetric('postRequests');
    this.log('cancel', 'success', `Cleanup: cancelled ${cancelled}/${this.openOrders.length} orders`);
  }

  /** Stop the instance: clear intervals, cancel orders, close WS */
  async stop(): Promise<void> {
    // Clear intervals
    if (this.leverageInterval !== null) {
      clearInterval(this.leverageInterval);
      this.leverageInterval = null;
    }
    if (this.orderInterval !== null) {
      clearInterval(this.orderInterval);
      this.orderInterval = null;
    }
    if (this.orderLoopTimeout !== null) {
      clearTimeout(this.orderLoopTimeout);
      this.orderLoopTimeout = null;
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
    try {
      await this.wsTransport.close();
    } catch {
      // Ignore close errors
    }

    // Decrement metrics
    this.onMetric('-wsConnections');
    this.onMetric('-channelSubscriptions');
    this.onMetric('-channelSubscriptions');
    this.onMetric('-channelSubscriptions');

    this.setState('stopped');
  }

  /** Start the instance: connect WS, subscribe channels, start loops */
  async start(): Promise<void> {
    try {
      this.setState('connecting');

      await this.subscribeChannels();

      this.startLeverageLoop();
      this.startOrderLoop();

      this.setState('running');
      this.onMetric('wsConnections');
      this.log('connect', 'success', 'Instance started');
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
