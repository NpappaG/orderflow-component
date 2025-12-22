This is a verbatim example of the problem we're tackling.

## FE Challenge: Orderflow Component

### Overview

You are designing a component to visualise order flow and bifurication for a real-time trading interface, with inspiration from a sankey diagram, the ambition being efficiently display market direction through proportional volumes and frequency of buy and sell orders.

There is also a temporal aspect to it where orderflow can be displayed over–time through a slider to index historic series data proportonal to new orders.

### Diserdata

- Present the visualisation in an JSX enviroment
- Do not use any charting libraries; use raw canvas or a library like p5js
- Free to use mathemical libraries for curve calculation
- The visualisation must be real-time, where orders directly impact the canvas
- Timespan toggling is a nice-to-have not a requirement
- Order animations when flowing from left to right
- Order animation when funneled into the associated category

### Helpers

The following is a implementation for the card stream modelled in rxjs presented as a hook for easy usage.

```
import { useEffect, useRef } from 'react';
import { BehaviorSubject, Subject, EMPTY, timer, startWith, switchMap, tap, mergeMap } from 'rxjs';

const generateOrder = () => {
// Realistic volume distribution - most orders small, few large
const rand = Math.random();
let volume;
if (rand < 0.6) {
volume = Math.floor(Math.random() _ 100) + 10; // 10-110
} else if (rand < 0.85) {
volume = Math.floor(Math.random() _ 500) + 100; // 100-600
 } else {
volume = Math.floor(Math.random() \* 2000) + 500; // 500-2500
}

return {
id: `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
side: Math.random() > 0.5 ? 'buy' : 'sell',
volume,
timestamp: Date.now(),
animationState: 'entering',
progress: 0
};
};

export const useOrderStream = ({ onOrderReceived, enabled = true }) => {
const streamControl = useRef(new BehaviorSubject(enabled));
const orderEvents = useRef(new Subject());
const onOrderReceivedRef = useRef(null);

useEffect(() => {
if (!onOrderReceivedRef?.current) return;

    const subscription = streamControl.current.pipe(
      startWith(streamControl.current.getValue()),
      switchMap((streaming) => {
        if (!streaming) return EMPTY;

        const scheduleNext = () =>
          timer(50 + Math.pow(1 - Math.random(), 3) * 2000).pipe( // 50ms to 2050ms, heavily weighted toward shorter intervals
            tap(() => {
              const order = generateOrder();
              onOrderReceivedRef.current?.(order);
              orderEvents.current.next(order);
            }),
            mergeMap(scheduleNext)
          );

        return scheduleNext();
      })
    ).subscribe();

    return () => subscription.unsubscribe();

}, [onOrderReceived]);

// Keep the latest callback in ref to avoid closure issues
useEffect(() => {
if (onOrderReceived) {
onOrderReceivedRef.current = onOrderReceived;
}
}, [onOrderReceived]);

return {
stream: orderEvents.current.asObservable(),
isStreaming: streamControl.current.getValue(),
pauseStream: () => streamControl.current.next(false),
resumeStream: () => streamControl.current.next(true)
};
};

```
