export type McpToolName = string;

export interface Ticker {
  symbol: string;
  lastPrice: number;
  raw: unknown;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
}

export interface PlaceOrderRequest {
  product: "SPOT";
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity?: number;
  quoteOrderQty?: number;
  limit_price?: number;
  clientIntentId: string;
}

export interface PlaceOrderResult {
  ok: boolean;
  toolName: McpToolName;
  raw: unknown;
  orderId?: string;
  status?: string;
  error?: string;
}

export interface BinancePort {
  getTicker(symbol: string): Promise<Ticker>;
  getTickers(symbols: string[]): Promise<Ticker[]>;
  getBalances(): Promise<Balance[]>;
  placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResult>;
  disconnectAgent?(): Promise<unknown>;
  emergencyStop?(): Promise<unknown>;
}
