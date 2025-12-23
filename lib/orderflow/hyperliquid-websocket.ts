"use client";

export type HyperliquidWebSocketStatus =
  | "connecting"
  | "connected"
  | "degraded"
  | "offline";
type StatusListener = (status: {
  status: HyperliquidWebSocketStatus;
  error?: string | null;
}) => void;

type SubscriptionPayload = {
  method: "subscribe";
  subscription: {
    type: string;
    user?: string;
    coin?: string;
    interval?: string;
  };
};

type SubscriptionRecord = {
  key: string;
  payload: SubscriptionPayload;
  callback: (data: unknown) => void;
};

export type HyperliquidTrade = {
  coin: string;
  side: "B" | "S" | "A" | "buy" | "sell";
  px: number;
  sz: number;
  time: number;
  tid?: string | number;
};

type WsTrade = {
  coin: string;
  side: string;
  px: string;
  sz: string;
  hash: string;
  time: number;
  tid: number;
  users: [string, string];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// WebSocket implementation adapted from hyperliquid-turnkey
const HYPERLIQUID_WSS_URL = "wss://api.hyperliquid.xyz/ws";
let dropNoticeCount = 0;
const MAX_DROP_LOGS = 5;

export class HyperliquidWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private subscriptions = new Map<string, SubscriptionRecord>();
  private isConnected = false;
  private connectPromise: Promise<void> | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private manualDisconnect = false;
  private statusListeners: Set<StatusListener> = new Set();

  constructor() {}

  private notifyStatus(
    status: HyperliquidWebSocketStatus,
    error?: string | null
  ) {
    for (const listener of this.statusListeners) {
      listener({ status, error: error ?? null });
    }
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener({
      status: this.isConnected ? "connected" : "offline",
      error: null,
    });
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const url = HYPERLIQUID_WSS_URL;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.error("WebSocket connection timeout");
          reject(new Error("WebSocket connection timeout"));
        }
      }, 15000);

      console.log("Attempting WebSocket connection to:", url);
      this.notifyStatus("connecting");
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        console.log("Hyperliquid WebSocket connected to:", url);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyStatus("connected");
        this.startHeartbeat();
        this.resubscribeAll();
        this.connectPromise = null;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      this.ws.onclose = (event) => {
        console.warn(
          "Hyperliquid WebSocket disconnected",
          event.code,
          event.reason || ""
        );
        const wasManual = this.manualDisconnect;
        this.isConnected = false;
        this.stopHeartbeat();
        this.notifyStatus(
          wasManual ? "offline" : "degraded",
          event.reason || null
        );
        if (!wasManual) {
          this.reconnectAttempts += 1;
        }
        const shouldReconnect = !wasManual;
        this.manualDisconnect = false;
        this.connectPromise = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(event.reason || "WebSocket closed before open"));
          return;
        }
        if (shouldReconnect) {
          this.handleReconnect();
        }
      };

      this.ws.onerror = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        console.warn("Hyperliquid WebSocket error for URL:", url);
        this.isConnected = false;
        this.notifyStatus("degraded", "socket error");
        this.connectPromise = null;
        reject(new Error("WebSocket error"));
      };
    });
    return this.connectPromise;
  }

  private handleMessage(data: unknown) {
    if (!data || typeof data !== "object") {
      return;
    }

    const rawType =
      (data as { type?: string }).type ??
      (data as { channel?: string }).channel ??
      (isRecord((data as { data?: unknown }).data)
        ? (data as { data?: { type?: string; channel?: string } }).data?.type ??
          (data as { data?: { type?: string; channel?: string } }).data?.channel
        : null);

    if (typeof rawType !== "string" || rawType.length === 0) {
      return;
    }

    const mapType = (value: string) => {
      const compact = value.replace(/_/g, "").toLowerCase();
      if (compact === "mids") {
        return "allmids";
      }
      if (compact === "l2book") {
        return "l2book";
      }
      return compact;
    };

    const extractSymbol = (node: unknown): string | null => {
      if (!isRecord(node)) {
        return null;
      }
      const raw =
        (typeof node.coin === "string" && node.coin.length > 0
          ? node.coin
          : null) ??
        (typeof node.s === "string" && node.s.length > 0 ? node.s : null);
      if (raw) {
        const upper = raw.toUpperCase();
        return upper.endsWith("-PERP") || upper.endsWith("-SPOT")
          ? upper.slice(0, -5)
          : upper;
      }
      const inner = node.data;
      if (inner && typeof inner === "object") {
        return extractSymbol(inner);
      }
      if (Array.isArray(inner) && inner.length > 0) {
        for (const entry of inner) {
          const extracted = extractSymbol(entry);
          if (extracted) return extracted;
        }
      }
      return null;
    };

    const extractInterval = (node: unknown): string | null => {
      if (!isRecord(node)) {
        return null;
      }
      const raw =
        (typeof node.interval === "string" && node.interval.length > 0
          ? node.interval
          : null) ??
        (typeof (node as { i?: string }).i === "string" &&
        (node as { i?: string }).i!.length > 0
          ? (node as { i?: string }).i
          : null);
      if (raw) {
        return raw;
      }
      const inner = node.data;
      if (inner && typeof inner === "object") {
        return extractInterval(inner);
      }
      if (Array.isArray(inner) && inner.length > 0) {
        for (const entry of inner) {
          const extracted = extractInterval(entry);
          if (extracted) return extracted;
        }
      }
      return null;
    };

    const normalizedType = mapType(rawType);

    const matchesSubscription = (
      node: unknown,
      expectedCoin?: string | null,
      expectedInterval?: string | null
    ): boolean => {
      const normCoin = (value: string | null | undefined) => {
        if (!value) return null;
        const upper = value.toUpperCase();
        return upper.endsWith("-PERP") || upper.endsWith("-SPOT")
          ? upper.slice(0, -5)
          : upper;
      };
      const targetCoin = normCoin(expectedCoin ?? null);
      const targetInterval = expectedInterval ?? null;

      const visit = (value: unknown): boolean => {
        if (Array.isArray(value)) {
          return value.some((entry) => visit(entry));
        }
        if (!isRecord(value)) {
          return false;
        }

        const coinCandidate = normCoin(
          (typeof value.coin === "string" && value.coin) ||
            (typeof value.s === "string" && value.s) ||
            (typeof value.symbol === "string" && value.symbol) ||
            null
        );
        const intervalCandidate =
          (typeof value.interval === "string" && value.interval) ||
          (typeof (value as { i?: string }).i === "string" &&
            (value as { i?: string }).i) ||
          null;

        // If this node declares a coin/interval, they must match.
        if (coinCandidate && targetCoin && coinCandidate !== targetCoin) {
          return false;
        }
        if (
          intervalCandidate &&
          targetInterval &&
          intervalCandidate !== targetInterval
        ) {
          return false;
        }

        // If both match (or are absent) and there are no children, accept.
        const hasChildren = Array.isArray(value.data) || isRecord(value.data);
        if (!hasChildren) {
          const coinSatisfied = !targetCoin || coinCandidate === targetCoin;
          const intervalSatisfied =
            !targetInterval || intervalCandidate === targetInterval;
          return coinSatisfied && intervalSatisfied;
        }

        // Otherwise, continue searching nested data.
        return visit((value as { data?: unknown }).data);
      };

      if (!targetCoin && !targetInterval) {
        return true;
      }
      return visit(node);
    };

    for (const subscription of this.subscriptions.values()) {
      const subscriptionType = subscription.payload.subscription.type;
      if (typeof subscriptionType !== "string") {
        continue;
      }
      if (mapType(subscriptionType) !== normalizedType) continue;

      const subscriptionUser = subscription.payload.subscription.user;
      const messageUser = (data as { user?: string }).user;
      if (subscriptionUser && messageUser && subscriptionUser !== messageUser)
        continue;

      const subscriptionCoin = subscription.payload.subscription.coin;
      if (subscriptionCoin) {
        const messageCoin = extractSymbol(data);
        if (messageCoin) {
          const normalize = (value: string) => {
            const upper = value.toUpperCase();
            if (upper.endsWith("-PERP") || upper.endsWith("-SPOT")) {
              return upper.slice(0, -5);
            }
            return upper;
          };
          const normalizedMessage = normalize(messageCoin);
          const normalizedSubscription = normalize(subscriptionCoin);
          if (normalizedMessage !== normalizedSubscription) {
            continue;
          }
        }
      }

      const subscriptionInterval = subscription.payload.subscription.interval;
      if (subscriptionInterval) {
        const messageInterval =
          extractInterval(data) ??
          (data as { interval?: string }).interval ??
          (data as { data?: { interval?: string } }).data?.interval ??
          null;
        if (messageInterval && messageInterval !== subscriptionInterval) {
          continue;
        }
      }

      if (!matchesSubscription(data, subscriptionCoin, subscriptionInterval)) {
        if (dropNoticeCount < MAX_DROP_LOGS) {
          dropNoticeCount += 1;
          console.debug("[HyperliquidWS][drop]", {
            subscription: subscription.payload.subscription,
            message: {
              channel: rawType,
              coin: extractSymbol(data),
              interval: extractInterval(data),
              hasData: Boolean((data as { data?: unknown }).data),
            },
          });
        }
        continue;
      }

      subscription.callback(data);
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: "ping" }));
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleReconnect() {
    const attempt = Math.max(1, this.reconnectAttempts);
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, attempt - 1),
      this.maxReconnectDelay
    );

    console.warn(`Reconnecting in ${delay}ms (attempt ${attempt})`);

    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  // Subscribe to user fills for real-time updates
  subscribeToUserFills(userAddress: string, callback: (data: unknown) => void) {
    const subscriptionKey = `userFills:${userAddress}`;
    this.addSubscription(
      subscriptionKey,
      {
        method: "subscribe",
        subscription: { type: "userFills", user: userAddress },
      },
      callback
    );
  }

  // Subscribe to L2 order book updates for a specific coin
  subscribeToL2Book(coin: string, callback: (data: unknown) => void) {
    const subscriptionKey = `l2Book:${coin}`;
    this.addSubscription(
      subscriptionKey,
      { method: "subscribe", subscription: { type: "l2Book", coin } },
      callback
    );
  }

  // Subscribe to candle updates for a specific coin and interval
  subscribeToCandle(
    coin: string,
    interval: string,
    callback: (data: unknown) => void
  ) {
    const subscriptionKey = `candle:${coin}:${interval}`;
    this.addSubscription(
      subscriptionKey,
      { method: "subscribe", subscription: { type: "candle", coin, interval } },
      callback
    );
  }

  // Subscribe to all mids for price updates
  subscribeToAllMids(callback: (data: unknown) => void) {
    this.addSubscription(
      "allMids",
      { method: "subscribe", subscription: { type: "allMids" } },
      callback
    );
  }

  // Subscribe to trades for a specific coin
  subscribeToTrades(
    coin: string,
    callback: (trade: HyperliquidTrade) => void
  ): string {
    const subscriptionKey = `trades:${coin}`;
    this.addSubscription(
      subscriptionKey,
      { method: "subscribe", subscription: { type: "trades", coin } },
      (data) => {
        const payload = (data as { data?: unknown }).data ?? data;
        const handleTrade = (trade: WsTrade) => {
          if (!trade || typeof trade !== "object") return;
          const rawSide = typeof trade.side === "string" ? trade.side : "";
          const norm = rawSide.trim().toLowerCase();
          const finalSide =
            norm.startsWith("b") ||
            (trade as { isBuy?: boolean }).isBuy === true
              ? "B"
              : "S";
          const px = Number(trade.px);
          const sz = Number(trade.sz);
          const time =
            typeof trade.time === "number" && trade.time > 0
              ? trade.time
              : Date.now();
          if (Number.isNaN(px) || Number.isNaN(sz)) {
            console.debug("[HL][drop-trade]", { trade });
            return;
          }
          const parsed: HyperliquidTrade = {
            coin: trade.coin || coin,
            side: finalSide as "B" | "S",
            px,
            sz,
            time,
            tid: trade.tid ?? trade.hash,
          };
          console.log("[HL][trade]", parsed);
          callback(parsed);
        };

        if (Array.isArray(payload)) {
          payload.forEach((entry) => handleTrade(entry as WsTrade));
        } else {
          handleTrade(payload as WsTrade);
        }
      }
    );
    return subscriptionKey;
  }

  // Subscribe to user orders for real-time order updates
  subscribeToUserOrders(
    userAddress: string,
    callback: (data: unknown) => void
  ) {
    const subscriptionKey = `userOrders:${userAddress}`;
    this.addSubscription(
      subscriptionKey,
      {
        method: "subscribe",
        subscription: { type: "userOrders", user: userAddress },
      },
      callback
    );
  }

  // Subscribe to user events for fills/position changes
  subscribeToUserEvents(
    userAddress: string,
    callback: (data: unknown) => void
  ) {
    const subscriptionKey = `userEvents:${userAddress}`;
    this.addSubscription(
      subscriptionKey,
      {
        method: "subscribe",
        subscription: { type: "userEvents", user: userAddress },
      },
      callback
    );
  }

  // Subscribe to clearinghouse state for position updates
  subscribeToClearinghouseState(
    userAddress: string,
    callback: (data: unknown) => void
  ) {
    const subscriptionKey = `clearinghouseState:${userAddress}`;
    this.addSubscription(
      subscriptionKey,
      {
        method: "subscribe",
        subscription: { type: "clearinghouseState", user: userAddress },
      },
      callback
    );
  }

  // Subscribe to aggregate frontend-friendly account data
  subscribeToWebData2(userAddress: string, callback: (data: unknown) => void) {
    const subscriptionKey = `webData2:${userAddress}`;
    this.addSubscription(
      subscriptionKey,
      {
        method: "subscribe",
        subscription: { type: "webData2", user: userAddress },
      },
      callback
    );
  }

  // Unsubscribe from a specific subscription
  unsubscribe(subscriptionKey: string) {
    const existing = this.subscriptions.get(subscriptionKey);
    if (existing && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          method: "unsubscribe",
          subscription: existing.payload.subscription,
        })
      );
    }
    this.subscriptions.delete(subscriptionKey);
  }

  disconnect() {
    this.stopHeartbeat();
    this.manualDisconnect = true;
    this.subscriptions.clear();
    this.connectPromise = null;
    this.notifyStatus("offline");
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    this.isConnected = false;
  }

  private addSubscription(
    key: string,
    payload: SubscriptionPayload,
    callback: (data: unknown) => void
  ) {
    this.subscriptions.set(key, { key, payload, callback });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private resubscribeAll() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    for (const subscription of this.subscriptions.values()) {
      this.ws.send(JSON.stringify(subscription.payload));
    }
  }

  get connected() {
    return this.isConnected;
  }
}

// Global WebSocket instance
let globalWebSocket: HyperliquidWebSocket | null = null;

export function getHyperliquidWebSocket(): HyperliquidWebSocket {
  if (!globalWebSocket) {
    globalWebSocket = new HyperliquidWebSocket(); // Uses environment-derived testnet setting
  }
  return globalWebSocket;
}

// Diagnostic function to test WebSocket connectivity
export async function testWebSocketConnection(): Promise<boolean> {
  const url = HYPERLIQUID_WSS_URL;
  return new Promise((resolve) => {
    console.log("Testing WebSocket URL:", url);
    const testWs = new WebSocket(url);

    const timeout = setTimeout(() => {
      testWs.close();
      resolve(false);
    }, 3000);

    testWs.onopen = () => {
      clearTimeout(timeout);
      testWs.close();
      console.log("WebSocket test successful for:", url);
      resolve(true);
    };

    testWs.onerror = () => {
      clearTimeout(timeout);
      console.log("WebSocket test failed for:", url);
      resolve(false);
    };
  });
}
