export type OrderSide = "buy" | "sell";

export type OrderEvent = {
  id: string;
  side: OrderSide;
  volume: number;
  timestamp: number;
};

export type OrderflowStats = {
  buyShare: number;
  sellShare: number;
  buyVolume?: number;
  sellVolume?: number;
  buyCount?: number;
  sellCount?: number;
};
