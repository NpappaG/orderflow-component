"use client";

import { useEffect, useRef } from "react";
import {
  BehaviorSubject,
  Subject,
  EMPTY,
  timer,
  startWith,
  switchMap,
  tap,
  mergeMap,
} from "rxjs";
import { OrderEvent, OrderSide } from "./types";

const generateOrder = (): OrderEvent => {
  const rand = Math.random();
  let volume: number;
  if (rand < 0.6) {
    volume = Math.floor(Math.random() * 100) + 10; // 10-110
  } else if (rand < 0.85) {
    volume = Math.floor(Math.random() * 500) + 100; // 100-600
  } else {
    volume = Math.floor(Math.random() * 2000) + 500; // 500-2500
  }

  const side: OrderSide = Math.random() > 0.5 ? "buy" : "sell";

  return {
    id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    side,
    volume,
    timestamp: Date.now(),
  };
};

type UseOrderStreamArgs = {
  onOrderReceived?: (order: OrderEvent) => void;
  enabled?: boolean;
};

/**
 * Synthetic order stream modeled after the provided helper in the brief.
 * Emits randomized order events at weighted intervals. Supports pause/resume.
 */
export const useOrderStream = ({
  onOrderReceived,
  enabled = true,
}: UseOrderStreamArgs) => {
  const streamControl = useRef(new BehaviorSubject<boolean>(enabled));
  const orderEvents = useRef(new Subject<OrderEvent>());
  const onOrderReceivedRef = useRef<typeof onOrderReceived | null>(null);

  useEffect(() => {
    onOrderReceivedRef.current = onOrderReceived ?? null;

    const subscription = streamControl.current
      .pipe(
        startWith(streamControl.current.getValue()),
        switchMap((streaming) => {
          if (!streaming) return EMPTY;

          const scheduleNext = (): ReturnType<typeof timer> =>
            timer(50 + Math.pow(1 - Math.random(), 3) * 2000).pipe(
              tap(() => {
                const order = generateOrder();
                onOrderReceivedRef.current?.(order);
                orderEvents.current.next(order);
              }),
              mergeMap(scheduleNext)
            );

          return scheduleNext();
        })
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [onOrderReceived]);

  return {
    pauseStream: () => streamControl.current.next(false),
    resumeStream: () => streamControl.current.next(true),
  };
};
