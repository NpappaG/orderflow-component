"use client";

import { useEffect, useRef, useCallback } from "react";
import { OrderEvent, OrderSide } from "./types";
import {
  getHyperliquidWebSocket,
  HyperliquidTrade,
} from "./hyperliquid-websocket";

type UseHyperliquidArgs = {
  symbol?: string;
  enabled?: boolean;
  onOrderReceived?: (order: OrderEvent) => void;
};

/**
 * Minimal Hyperliquid trades stream adapter (browser WebSocket).
 * Subscribes to trades for a single symbol and emits OrderEvent.
 * No persistence/backfill; dedups by last seen id/ts.
 */
export function useHyperliquidStream({
  symbol = "BTC",
  enabled = true,
  onOrderReceived,
}: UseHyperliquidArgs) {
  const wsRef = useRef<ReturnType<typeof getHyperliquidWebSocket> | null>(null);
  const subKeyRef = useRef<string | null>(null);
  const lastSeenIdsRef = useRef<Set<string>>(new Set());
  const onOrderReceivedRef = useRef<typeof onOrderReceived | null>(null);

  useEffect(() => {
    onOrderReceivedRef.current = onOrderReceived;
  }, [onOrderReceived]);

  const subscribe = useCallback(async () => {
    const ws = getHyperliquidWebSocket();
    wsRef.current = ws;
    try {
      await ws.connect();
      const key = ws.subscribeToTrades(symbol, (trade: HyperliquidTrade) => {
        const id =
          trade.tid ??
          `${trade.coin}-${trade.time}-${Math.random()
            .toString(36)
            .slice(2, 7)}`;
        const idStr = String(id);
        if (lastSeenIdsRef.current.has(idStr)) return;
        // lightweight recent-id cap
        lastSeenIdsRef.current.add(idStr);
        if (lastSeenIdsRef.current.size > 500) {
          // drop oldest by recreating set from last 400 entries
          const trimmed = Array.from(lastSeenIdsRef.current).slice(-400);
          lastSeenIdsRef.current = new Set(trimmed);
        }
        const normSide =
          typeof trade.side === "string"
            ? trade.side.toLowerCase()
            : ("" as string);
        const side: OrderSide = normSide.startsWith("b") ? "buy" : "sell";
        const size = Number(trade.sz);
        const px = Number(trade.px);
        const notional =
          !Number.isNaN(size) && !Number.isNaN(px) ? size * px : size;
        const volume = Math.max(0, notional);
        const order: OrderEvent = {
          id: String(id),
          side,
          volume,
          timestamp: trade.time,
        };
        onOrderReceivedRef.current?.(order);
      });
      subKeyRef.current = key;
    } catch (err) {
      console.error("hyperliquid ws connect/subscribe error", err);
    }
  }, [symbol]);

  useEffect(() => {
    if (enabled) {
      subscribe();
    }
    return () => {
      if (subKeyRef.current && wsRef.current) {
        wsRef.current.unsubscribe(subKeyRef.current);
        subKeyRef.current = null;
      }
    };
  }, [enabled, subscribe]);

  return {
    pauseStream: () => {
      if (subKeyRef.current && wsRef.current) {
        wsRef.current.unsubscribe(subKeyRef.current);
        subKeyRef.current = null;
      }
    },
    resumeStream: () => {
      if (!enabled) return;
      if (!subKeyRef.current) {
        subscribe();
      }
    },
  };
}
