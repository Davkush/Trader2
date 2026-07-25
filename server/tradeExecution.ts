import express from 'express';
import { TradeExecuteRequestSchema } from '../src/types';

export function registerTradeExecutionRoutes(app: express.Express, authMiddleware: express.RequestHandler) {
  // Global Risk Management & Execution Interceptor (Phase 2)
  app.post("/api/trade/execute", authMiddleware, (req, res) => {
    try {
      const result = TradeExecuteRequestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues.map(e => e.message).join(', ') });
      }

      const { symbol, direction, quantity, price, type, balance, currentDrawdown } = result.data;
      
      const parsedPrice = price;
      const parsedQty = quantity;
      const parsedBalance = balance;
      const parsedDrawdown = currentDrawdown;
      
      const positionValue = parsedPrice * parsedQty;
      const maxAllowedSize = parsedBalance * 0.15; // Max 15% of capital per single trade size
      
      // Drawdown Circuit Breaker: Intercept and block order if global account drawdown exceeds 12%
      if (parsedDrawdown > 12) {
        return res.json({
          approved: false,
          reason: `CRITICAL CIRCUIT BREAKER TRIPPED: Max global drawdown limit reached (${parsedDrawdown.toFixed(2)}% > 12.00%). Automated Risk Interception mode active. Orders frozen.`
        });
      }
      
      // Position Size Circuit Breaker: Intercept and block order if single trade size is over 15% of capital
      if (positionValue > maxAllowedSize) {
        return res.json({
          approved: false,
          reason: `RISK INTERCEPT: Order size exceeds maximum single-position allocation guidelines ($${positionValue.toFixed(2)} exceeds 15% threshold limit of $${maxAllowedSize.toFixed(2)}).`
        });
      }
      
      // Calculate realistic trading fees:
      // Maker fee: 0.02% (for limit-like orders or TWAP/VWAP)
      // Taker fee: 0.05% (for market orders, stop-loss orders)
      const isMaker = ['LIMIT', 'TWAP', 'VWAP'].includes(type);
      const feePct = isMaker ? 0.0002 : 0.0005;
      const fee = positionValue * feePct;
      
      // Simulate realistic slippage (0.01% - 0.06% for market orders, 0.005% for TWAP/VWAP)
      let slippagePct = 0;
      if (type === 'MARKET') {
        slippagePct = 0.0001 + Math.random() * 0.0005;
      } else if (['TWAP', 'VWAP'].includes(type)) {
        slippagePct = 0.00005;
      }
      
      const slippage = positionValue * slippagePct;
      const slipFactor = direction === 'BUY' ? (1 + slippagePct) : (1 - slippagePct);
      const executedPrice = parsedPrice * slipFactor;
      
      res.json({
        approved: true,
        executedPrice: parseFloat(executedPrice.toFixed(4)),
        fee: parseFloat(fee.toFixed(2)),
        slippage: parseFloat(slippage.toFixed(2)),
        orderId: `ORD-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        timestamp: Math.floor(Date.now() / 1000)
      });
    } catch (err: any) {
      console.error("/api/trade/execute Error:", err);
      res.status(500).json({ error: "Failed to process trading execution limits." });
    }
  });
}
