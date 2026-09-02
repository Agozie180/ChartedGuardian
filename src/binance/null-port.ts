import type { BinancePort, PlaceOrderResult } from "./port.ts";

export const nullPort: BinancePort = {
  async getTicker() {
    throw new Error("nullPort: no market data (EXECUTION_MODE=off)");
  },
  async getTickers() {
    throw new Error("nullPort: no market data (EXECUTION_MODE=off)");
  },
  async getBalances() {
    throw new Error("nullPort: no account data (EXECUTION_MODE=off)");
  },
  async placeOrder(): Promise<PlaceOrderResult> {
    throw new Error("nullPort: placeOrder is disabled (EXECUTION_MODE=off)");
  },
};
