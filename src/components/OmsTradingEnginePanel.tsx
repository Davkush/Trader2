import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layers, Zap, Cpu, BarChart3, ArrowUpRight, ArrowDownRight, RefreshCw, 
  CheckCircle2, AlertCircle, Clock, Percent, DollarSign, Activity, 
  Play, Square, PlayCircle, Settings, ShieldAlert, Sliders, ChevronRight,
  TrendingUp, TrendingDown, ArrowRightLeft, Database, Target, Gauge, PieChart,
  X, Filter, Check, ListFilter, Plus, Trash2, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChartPaneState, CandleData, Position } from '../types';

interface OmsTradingEnginePanelProps {
  pane: ChartPaneState;
  candles: CandleData[];
  balance: number;
  positions: Position[];
  closedTrades: Position[];
  onExecuteTrade?: (trade: any) => void;
  isLight?: boolean;
}

export interface OMSOrder {
  id: string;
  timestamp: string;
  symbol: string;
  type: 'LIMIT' | 'MARKET' | 'STOP_LIMIT' | 'ICEBERG' | 'TWAP' | 'PEGGED' | 'OCO';
  side: 'BUY' | 'SELL';
  quantity: number;
  filledQuantity: number;
  price: number;
  stopPrice?: number;
  icebergDisplayQty?: number;
  twapDurationMin?: number;
  status: 'PENDING' | 'SUBMITTED' | 'ROUTING' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  route: 'HYPERLIQUID' | 'BINANCE_FUTURES' | 'COINBASE_PRO' | 'DARK_POOL_INTERNAL' | 'DMA_DIRECT';
  latencyMs: number;
  avgFillPrice: number;
  slippageBps: number;
  vwapPerformanceBps: number;
  implementationShortfallUsd: number;
}

export interface ArbitrageOpportunity {
  id: string;
  type: 'SPOT_FUTURES' | 'TRIANGULAR' | 'FUNDING_RATE';
  title: string;
  pairs: string[];
  exchangeA: string;
  exchangeB: string;
  spreadPercent: number;
  netApyPercent: number;
  estFeesUsd: number;
  executionWindowMs: number;
  status: 'ACTIVE' | 'EXECUTING' | 'FILLED' | 'EXPIRED';
}

export const OmsTradingEnginePanel: React.FC<OmsTradingEnginePanelProps> = ({
  pane,
  candles,
  balance,
  positions,
  closedTrades,
  onExecuteTrade,
  isLight = false,
}) => {
  const [activeTab, setActiveTab] = useState<'oms' | 'algo' | 'analytics'>('oms');
  const [selectedAlgoTab, setSelectedAlgoTab] = useState<'market_making' | 'arbitrage'>('market_making');

  // ---------------------------------------------------------------------------
  // 1. ORDER MANAGEMENT SYSTEM (OMS) STATE
  // ---------------------------------------------------------------------------
  const [orders, setOrders] = useState<OMSOrder[]>([
    {
      id: 'ORD-9821',
      timestamp: new Date(Date.now() - 1000 * 45).toLocaleTimeString(),
      symbol: pane.symbol || 'BTC',
      type: 'LIMIT',
      side: 'BUY',
      quantity: 0.5,
      filledQuantity: 0.5,
      price: (candles[candles.length - 1]?.close || 65000) * 0.998,
      status: 'FILLED',
      route: 'HYPERLIQUID',
      latencyMs: 12,
      avgFillPrice: (candles[candles.length - 1]?.close || 65000) * 0.9981,
      slippageBps: 0.1,
      vwapPerformanceBps: 1.4,
      implementationShortfallUsd: 1.20,
    },
    {
      id: 'ORD-9822',
      timestamp: new Date(Date.now() - 1000 * 120).toLocaleTimeString(),
      symbol: pane.symbol || 'BTC',
      type: 'TWAP',
      side: 'SELL',
      quantity: 1.2,
      filledQuantity: 0.8,
      price: (candles[candles.length - 1]?.close || 65000) * 1.002,
      twapDurationMin: 15,
      status: 'PARTIAL',
      route: 'DARK_POOL_INTERNAL',
      latencyMs: 8,
      avgFillPrice: (candles[candles.length - 1]?.close || 65000) * 1.0019,
      slippageBps: -0.2,
      vwapPerformanceBps: 2.1,
      implementationShortfallUsd: 2.80,
    },
    {
      id: 'ORD-9823',
      timestamp: new Date(Date.now() - 1000 * 10).toLocaleTimeString(),
      symbol: pane.symbol || 'BTC',
      type: 'ICEBERG',
      side: 'BUY',
      quantity: 5.0,
      filledQuantity: 0.0,
      icebergDisplayQty: 0.5,
      price: (candles[candles.length - 1]?.close || 65000) * 0.995,
      status: 'SUBMITTED',
      route: 'BINANCE_FUTURES',
      latencyMs: 16,
      avgFillPrice: 0,
      slippageBps: 0,
      vwapPerformanceBps: 0,
      implementationShortfallUsd: 0,
    },
  ]);

  // OMS Order Creation Inputs
  const [orderType, setOrderType] = useState<OMSOrder['type']>('LIMIT');
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderQty, setOrderQty] = useState<number>(0.25);
  const [orderPrice, setOrderPrice] = useState<number>(
    candles[candles.length - 1]?.close || 65000
  );
  const [stopPrice, setStopPrice] = useState<number>(
    (candles[candles.length - 1]?.close || 65000) * 0.98
  );
  const [icebergDisplayQty, setIcebergDisplayQty] = useState<number>(0.05);
  const [twapDuration, setTwapDuration] = useState<number>(10);
  const [orderRoute, setOrderRoute] = useState<OMSOrder['route']>('HYPERLIQUID');

  // Update orderPrice when candles shift
  useEffect(() => {
    if (candles.length > 0) {
      setOrderPrice(candles[candles.length - 1].close);
    }
  }, [pane.symbol, candles]);

  // OMS Metrics calculation
  const omsMetrics = useMemo(() => {
    const filledOrders = orders.filter(o => o.status === 'FILLED' || o.status === 'PARTIAL');
    if (filledOrders.length === 0) {
      return {
        fillRatePercent: 100,
        avgLatencyMs: 12,
        avgSlippageBps: 0.15,
        avgVwapPerfBps: 1.8,
        totalShortfallUsd: 4.00,
      };
    }
    const totalFilled = orders.reduce((sum, o) => sum + o.filledQuantity, 0);
    const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0);
    const fillRatePercent = totalQty > 0 ? (totalFilled / totalQty) * 100 : 100;
    const avgLatencyMs = Math.round(filledOrders.reduce((sum, o) => sum + o.latencyMs, 0) / filledOrders.length);
    const avgSlippageBps = Number((filledOrders.reduce((sum, o) => sum + o.slippageBps, 0) / filledOrders.length).toFixed(2));
    const avgVwapPerfBps = Number((filledOrders.reduce((sum, o) => sum + o.vwapPerformanceBps, 0) / filledOrders.length).toFixed(2));
    const totalShortfallUsd = Number(filledOrders.reduce((sum, o) => sum + o.implementationShortfallUsd, 0).toFixed(2));

    return {
      fillRatePercent,
      avgLatencyMs,
      avgSlippageBps,
      avgVwapPerfBps,
      totalShortfallUsd,
    };
  }, [orders]);

  const handleCreateOrder = () => {
    const newOrd: OMSOrder = {
      id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toLocaleTimeString(),
      symbol: pane.symbol || 'BTC',
      type: orderType,
      side: orderSide,
      quantity: orderQty,
      filledQuantity: orderType === 'MARKET' ? orderQty : 0,
      price: orderPrice,
      stopPrice: orderType === 'STOP_LIMIT' ? stopPrice : undefined,
      icebergDisplayQty: orderType === 'ICEBERG' ? icebergDisplayQty : undefined,
      twapDurationMin: orderType === 'TWAP' ? twapDuration : undefined,
      status: orderType === 'MARKET' ? 'FILLED' : 'SUBMITTED',
      route: orderRoute,
      latencyMs: Math.floor(8 + Math.random() * 15),
      avgFillPrice: orderType === 'MARKET' ? orderPrice * (orderSide === 'BUY' ? 1.0002 : 0.9998) : (orderType === 'LIMIT' ? orderPrice : 0),
      slippageBps: orderType === 'MARKET' ? 0.2 : 0,
      vwapPerformanceBps: 1.2,
      implementationShortfallUsd: orderQty * orderPrice * 0.0001,
    };

    setOrders(prev => [newOrd, ...prev]);

    // Also notify trade execution if needed
    if (onExecuteTrade && (orderType === 'MARKET' || orderType === 'LIMIT')) {
      onExecuteTrade({
        paneId: pane.id,
        symbol: pane.symbol,
        side: orderSide,
        size: orderQty,
        entryPrice: newOrd.avgFillPrice || orderPrice,
        tp: 0,
        sl: 0,
      });
    }
  };

  const handleCancelOrder = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'CANCELLED' } : o));
  };

  const handleBatchCancel = (filter?: 'BUY' | 'SELL') => {
    setOrders(prev => prev.map(o => {
      if (o.status === 'SUBMITTED' || o.status === 'PENDING' || o.status === 'PARTIAL') {
        if (!filter || o.side === filter) {
          return { ...o, status: 'CANCELLED' };
        }
      }
      return o;
    }));
  };

  // ---------------------------------------------------------------------------
  // 2. ALGORITHMIC TRADING STRATEGIES STATE (MARKET MAKING & ARBITRAGE)
  // ---------------------------------------------------------------------------
  // Market Making Avellaneda-Stoikov parameters
  const [mmActive, setMmActive] = useState<boolean>(false);
  const [riskAversionGamma, setRiskAversionGamma] = useState<number>(0.1);
  const [volatilitySigma, setVolatilitySigma] = useState<number>(0.02);
  const [halfSpreadBps, setHalfSpreadBps] = useState<number>(5.0);
  const [inventoryLimit, setInventoryLimit] = useState<number>(2.0);
  const [currentInventory, setCurrentInventory] = useState<number>(0.15); // in base asset
  const [mmPnl, setMmPnl] = useState<number>(142.50);

  // Live MM Quote Ladder calculation
  const midPrice = candles[candles.length - 1]?.close || 65000;
  const mmReservationPrice = useMemo(() => {
    // Avellaneda-Stoikov Reservation Price formula: r(s, q, t) = s - q * gamma * sigma^2
    return midPrice - (currentInventory * riskAversionGamma * Math.pow(volatilitySigma, 2) * midPrice);
  }, [midPrice, currentInventory, riskAversionGamma, volatilitySigma]);

  const mmBidQuote = mmReservationPrice * (1 - halfSpreadBps / 10000);
  const mmAskQuote = mmReservationPrice * (1 + halfSpreadBps / 10000);

  // Simulation loop for MM active state
  useEffect(() => {
    if (!mmActive) return;
    const interval = setInterval(() => {
      // Simulate random micro order fills
      const fillEvent = Math.random();
      if (fillEvent < 0.3) {
        // Filled Bid
        setCurrentInventory(prev => Math.min(inventoryLimit, prev + 0.05));
        setMmPnl(prev => prev + (midPrice * 0.0005));
      } else if (fillEvent > 0.7) {
        // Filled Ask
        setCurrentInventory(prev => Math.max(-inventoryLimit, prev - 0.05));
        setMmPnl(prev => prev + (midPrice * 0.0005));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [mmActive, inventoryLimit, midPrice]);

  // Arbitrage Scanner State
  const [arbAutoExecute, setArbAutoExecute] = useState<boolean>(false);
  const [arbitrageOpportunities, setArbitrageOpportunities] = useState<ArbitrageOpportunity[]>([
    {
      id: 'ARB-101',
      type: 'SPOT_FUTURES',
      title: `${pane.symbol}/USDT Spot-Futures Basis`,
      pairs: [`${pane.symbol}/USDT Spot`, `${pane.symbol}/USDT Perp`],
      exchangeA: 'Hyperliquid',
      exchangeB: 'Binance',
      spreadPercent: 0.38,
      netApyPercent: 18.4,
      estFeesUsd: 1.20,
      executionWindowMs: 450,
      status: 'ACTIVE',
    },
    {
      id: 'ARB-102',
      type: 'TRIANGULAR',
      title: `Triangular Loop: BTC -> ETH -> USDT`,
      pairs: ['BTC/USDT', 'ETH/BTC', 'ETH/USDT'],
      exchangeA: 'Binance',
      exchangeB: 'Binance',
      spreadPercent: 0.14,
      netApyPercent: 12.1,
      estFeesUsd: 0.85,
      executionWindowMs: 180,
      status: 'ACTIVE',
    },
    {
      id: 'ARB-103',
      type: 'FUNDING_RATE',
      title: `${pane.symbol} Funding Rate Carry Trade`,
      pairs: [`${pane.symbol} Spot Long`, `${pane.symbol} Perp Short`],
      exchangeA: 'Coinbase Pro',
      exchangeB: 'Hyperliquid',
      spreadPercent: 0.82,
      netApyPercent: 29.5,
      estFeesUsd: 3.40,
      executionWindowMs: 2500,
      status: 'ACTIVE',
    },
  ]);

  const handleExecuteArbitrage = (id: string) => {
    setArbitrageOpportunities(prev => prev.map(a => a.id === id ? { ...a, status: 'EXECUTING' } : a));
    setTimeout(() => {
      setArbitrageOpportunities(prev => prev.map(a => a.id === id ? { ...a, status: 'FILLED' } : a));
      setMmPnl(prev => prev + 25.0);
    }, 800);
  };

  // ---------------------------------------------------------------------------
  // 3. EXECUTION ANALYTICS STATE & DATA
  // ---------------------------------------------------------------------------
  const slippageBins = [
    { range: '< -1.0 bps', count: 1, type: 'positive' },
    { range: '-1.0 to -0.5 bps', count: 4, type: 'positive' },
    { range: '-0.5 to 0.0 bps', count: 12, type: 'positive' },
    { range: '0.0 to 0.5 bps', count: 24, type: 'neutral' },
    { range: '0.5 to 1.0 bps', count: 8, type: 'negative' },
    { range: '> 1.0 bps', count: 2, type: 'negative' },
  ];

  return (
    <div className={`flex flex-col h-full ${isLight ? 'bg-slate-50 text-slate-800' : 'bg-[#0e1117] text-gray-200'} text-xs font-sans select-none overflow-hidden`}>
      {/* Top Engine Header Tabs */}
      <div className={`flex items-center justify-between border-b px-3 py-2 shrink-0 ${isLight ? 'border-slate-200 bg-white' : 'border-[#1e222e] bg-[#121620]'}`}>
        <div className="flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-blue-500 animate-pulse" />
          <span className="font-bold tracking-tight text-xs uppercase text-blue-400">Trading Engine & OMS</span>
        </div>

        <div className="flex items-center gap-1 bg-[#181d28] p-0.5 rounded-lg border border-gray-800">
          <button
            onClick={() => setActiveTab('oms')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'oms'
                ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <ListFilter className="w-3 h-3" />
            <span>OMS</span>
          </button>
          <button
            onClick={() => setActiveTab('algo')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'algo'
                ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Cpu className="w-3 h-3" />
            <span>Algos</span>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'analytics'
                ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            <span>Analytics</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {/* =================================================================== */}
        {/* TAB 1: ORDER MANAGEMENT SYSTEM (OMS) */}
        {/* =================================================================== */}
        {activeTab === 'oms' && (
          <div className="space-y-3">
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                <div className="text-[9px] text-gray-400 uppercase font-mono flex items-center justify-between">
                  <span>Fill Rate</span>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                </div>
                <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                  {omsMetrics.fillRatePercent.toFixed(1)}%
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5">Order Fulfillment</div>
              </div>

              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                <div className="text-[9px] text-gray-400 uppercase font-mono flex items-center justify-between">
                  <span>Avg Latency</span>
                  <Clock className="w-3 h-3 text-blue-400" />
                </div>
                <div className="text-sm font-bold font-mono text-blue-400 mt-0.5">
                  {omsMetrics.avgLatencyMs} ms
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5">Direct Route Latency</div>
              </div>

              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                <div className="text-[9px] text-gray-400 uppercase font-mono flex items-center justify-between">
                  <span>Avg Slippage</span>
                  <Percent className="w-3 h-3 text-amber-400" />
                </div>
                <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">
                  {omsMetrics.avgSlippageBps > 0 ? `+${omsMetrics.avgSlippageBps}` : omsMetrics.avgSlippageBps} bps
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5">Implementation Delta</div>
              </div>

              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                <div className="text-[9px] text-gray-400 uppercase font-mono flex items-center justify-between">
                  <span>VWAP Alpha</span>
                  <TrendingUp className="w-3 h-3 text-violet-400" />
                </div>
                <div className="text-sm font-bold font-mono text-violet-400 mt-0.5">
                  +{omsMetrics.avgVwapPerfBps} bps
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5">vs Benchmark VWAP</div>
              </div>
            </div>

            {/* Order Entry Form */}
            <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs text-gray-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-blue-400" />
                  Smart Order Entry
                </span>
                <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  Symbol: {pane.symbol}
                </span>
              </div>

              {/* Order Type & Side Selectors */}
              <div className="grid grid-cols-2 gap-2 mb-2.5">
                <div className="flex bg-[#0c0e14] p-0.5 rounded border border-gray-800">
                  <button
                    onClick={() => setOrderSide('BUY')}
                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                      orderSide === 'BUY'
                        ? 'bg-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    BUY / LONG
                  </button>
                  <button
                    onClick={() => setOrderSide('SELL')}
                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                      orderSide === 'SELL'
                        ? 'bg-rose-600 text-white shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    SELL / SHORT
                  </button>
                </div>

                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as OMSOrder['type'])}
                  className="bg-[#0c0e14] border border-gray-800 text-gray-200 text-[10px] rounded px-2 py-1 font-mono cursor-pointer hover:border-gray-700 focus:outline-none"
                >
                  <option value="LIMIT">LIMIT ORDER</option>
                  <option value="MARKET">MARKET ORDER</option>
                  <option value="STOP_LIMIT">STOP LIMIT</option>
                  <option value="ICEBERG">ICEBERG (HIDDEN QTY)</option>
                  <option value="TWAP">TWAP ALGO</option>
                  <option value="PEGGED">PEGGED (MID-MARKET)</option>
                  <option value="OCO">OCO (ONE-CANCELS-OTHER)</option>
                </select>
              </div>

              {/* Dynamic Inputs based on Order Type */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2.5">
                <div>
                  <label className="text-[9px] text-gray-400 uppercase font-mono block mb-1">Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderQty}
                    onChange={(e) => setOrderQty(Math.max(0.001, parseFloat(e.target.value) || 0))}
                    className="w-full bg-[#0c0e14] border border-gray-800 text-gray-200 text-xs rounded px-2 py-1 font-mono"
                  />
                </div>

                {orderType !== 'MARKET' && (
                  <div>
                    <label className="text-[9px] text-gray-400 uppercase font-mono block mb-1">Limit Price</label>
                    <input
                      type="number"
                      step="0.1"
                      value={orderPrice}
                      onChange={(e) => setOrderPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#0c0e14] border border-gray-800 text-gray-200 text-xs rounded px-2 py-1 font-mono"
                    />
                  </div>
                )}

                {orderType === 'STOP_LIMIT' && (
                  <div>
                    <label className="text-[9px] text-gray-400 uppercase font-mono block mb-1">Stop Price</label>
                    <input
                      type="number"
                      step="0.1"
                      value={stopPrice}
                      onChange={(e) => setStopPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#0c0e14] border border-gray-800 text-gray-200 text-xs rounded px-2 py-1 font-mono text-amber-400"
                    />
                  </div>
                )}

                {orderType === 'ICEBERG' && (
                  <div>
                    <label className="text-[9px] text-gray-400 uppercase font-mono block mb-1">Display Slice Qty</label>
                    <input
                      type="number"
                      step="0.01"
                      value={icebergDisplayQty}
                      onChange={(e) => setIcebergDisplayQty(parseFloat(e.target.value) || 0.01)}
                      className="w-full bg-[#0c0e14] border border-gray-800 text-gray-200 text-xs rounded px-2 py-1 font-mono text-cyan-400"
                    />
                  </div>
                )}

                {orderType === 'TWAP' && (
                  <div>
                    <label className="text-[9px] text-gray-400 uppercase font-mono block mb-1">TWAP Duration (min)</label>
                    <input
                      type="number"
                      value={twapDuration}
                      onChange={(e) => setTwapDuration(parseInt(e.target.value) || 5)}
                      className="w-full bg-[#0c0e14] border border-gray-800 text-gray-200 text-xs rounded px-2 py-1 font-mono text-violet-400"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[9px] text-gray-400 uppercase font-mono block mb-1">Smart Route</label>
                  <select
                    value={orderRoute}
                    onChange={(e) => setOrderRoute(e.target.value as OMSOrder['route'])}
                    className="w-full bg-[#0c0e14] border border-gray-800 text-gray-200 text-[10px] rounded px-2 py-1 font-mono cursor-pointer"
                  >
                    <option value="HYPERLIQUID">Hyperliquid L1 (Low Latency)</option>
                    <option value="BINANCE_FUTURES">Binance Futures DMA</option>
                    <option value="COINBASE_PRO">Coinbase Pro DMA</option>
                    <option value="DARK_POOL_INTERNAL">Internal Dark Pool</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleCreateOrder}
                className={`w-full py-2 rounded-lg font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-2 ${
                  orderSide === 'BUY'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Submit {orderSide} Order via {orderRoute.replace('_', ' ')}
              </button>
            </div>

            {/* Active & Historical Orders Table */}
            <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs text-gray-300 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  Order Book & OMS Audit Trail
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleBatchCancel('BUY')}
                    className="px-2 py-0.5 rounded text-[9px] font-mono bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                  >
                    Cancel Bids
                  </button>
                  <button
                    onClick={() => handleBatchCancel('SELL')}
                    className="px-2 py-0.5 rounded text-[9px] font-mono bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                  >
                    Cancel Asks
                  </button>
                  <button
                    onClick={() => handleBatchCancel()}
                    className="px-2 py-0.5 rounded text-[9px] font-mono bg-rose-600 text-white hover:bg-rose-500 cursor-pointer"
                  >
                    Batch Cancel All
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[9px] font-mono uppercase text-gray-400">
                      <th className="py-1.5 px-2">ID / Time</th>
                      <th className="py-1.5 px-2">Type / Route</th>
                      <th className="py-1.5 px-2">Side</th>
                      <th className="py-1.5 px-2 text-right">Qty / Fill</th>
                      <th className="py-1.5 px-2 text-right">Price</th>
                      <th className="py-1.5 px-2 text-center">Status</th>
                      <th className="py-1.5 px-2 text-right">Latency / Slip</th>
                      <th className="py-1.5 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50 text-[10px] font-mono">
                    {orders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-[#181d28]/60 transition-colors">
                        <td className="py-2 px-2">
                          <div className="font-bold text-gray-200">{ord.id}</div>
                          <div className="text-[8px] text-gray-500">{ord.timestamp}</div>
                        </td>
                        <td className="py-2 px-2">
                          <span className="text-blue-400 font-semibold">{ord.type}</span>
                          <div className="text-[8px] text-gray-500">{ord.route}</div>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            ord.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {ord.side}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div>{ord.quantity}</div>
                          <div className="text-[8px] text-gray-400">{((ord.filledQuantity / ord.quantity) * 100).toFixed(0)}% filled</div>
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-gray-200">
                          ${ord.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            ord.status === 'FILLED' ? 'bg-emerald-500/10 text-emerald-400' :
                            ord.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400' :
                            ord.status === 'SUBMITTED' ? 'bg-blue-500/10 text-blue-400 animate-pulse' :
                            'bg-gray-800 text-gray-400'
                          }`}>
                            {ord.status}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="text-blue-400">{ord.latencyMs} ms</div>
                          <div className="text-[8px] text-amber-400">{ord.slippageBps > 0 ? `+${ord.slippageBps}` : ord.slippageBps} bps</div>
                        </td>
                        <td className="py-2 px-2 text-right">
                          {(ord.status === 'SUBMITTED' || ord.status === 'PENDING' || ord.status === 'PARTIAL') ? (
                            <button
                              onClick={() => handleCancelOrder(ord.id)}
                              className="p-1 rounded text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                              title="Cancel Order"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: ALGORITHMIC TRADING STRATEGIES */}
        {/* =================================================================== */}
        {activeTab === 'algo' && (
          <div className="space-y-3">
            {/* Sub-selector for Market Making vs Arbitrage */}
            <div className="flex bg-[#141822] p-1 rounded-lg border border-[#1e222e]">
              <button
                onClick={() => setSelectedAlgoTab('market_making')}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                  selectedAlgoTab === 'market_making'
                    ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                Avellaneda-Stoikov Market Maker
              </button>
              <button
                onClick={() => setSelectedAlgoTab('arbitrage')}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                  selectedAlgoTab === 'arbitrage'
                    ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Multi-Asset Arbitrage Scanner
              </button>
            </div>

            {/* MARKET MAKING PANEL */}
            {selectedAlgoTab === 'market_making' && (
              <div className="space-y-3">
                <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-bold text-sm text-gray-200 flex items-center gap-2">
                        <span>Avellaneda-Stoikov Market Maker</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono ${mmActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse' : 'bg-gray-800 text-gray-400'}`}>
                          {mmActive ? 'QUOTING ACTIVE' : 'PAUSED'}
                        </span>
                      </h4>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        High-frequency automated bid-ask spread quotes with dynamic inventory risk skewing.
                      </p>
                    </div>

                    <button
                      onClick={() => setMmActive(!mmActive)}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5 ${
                        mmActive
                          ? 'bg-rose-600 hover:bg-rose-500 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                      }`}
                    >
                      {mmActive ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {mmActive ? 'Stop Quoting' : 'Start MM Engine'}
                    </button>
                  </div>

                  {/* Quantitative Parameters Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-2.5 rounded-lg bg-[#0c0e14] border border-gray-800 mb-3">
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-1">
                        <span>Risk Aversion ($\gamma$)</span>
                        <span className="text-blue-400 font-bold">{riskAversionGamma}</span>
                      </div>
                      <input
                        type="range"
                        min="0.01"
                        max="0.5"
                        step="0.01"
                        value={riskAversionGamma}
                        onChange={(e) => setRiskAversionGamma(parseFloat(e.target.value))}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-1">
                        <span>Volatility Est. ($\sigma$)</span>
                        <span className="text-blue-400 font-bold">{(volatilitySigma * 100).toFixed(1)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.005"
                        max="0.1"
                        step="0.005"
                        value={volatilitySigma}
                        onChange={(e) => setVolatilitySigma(parseFloat(e.target.value))}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-1">
                        <span>Half-Spread</span>
                        <span className="text-blue-400 font-bold">{halfSpreadBps} bps</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="0.5"
                        value={halfSpreadBps}
                        onChange={(e) => setHalfSpreadBps(parseFloat(e.target.value))}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-1">
                        <span>Inventory Limit</span>
                        <span className="text-blue-400 font-bold">{inventoryLimit} {pane.symbol}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="10"
                        step="0.5"
                        value={inventoryLimit}
                        onChange={(e) => setInventoryLimit(parseFloat(e.target.value))}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Active Quote Ladder Display */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <div className="text-[10px] text-emerald-400 font-mono font-semibold uppercase flex items-center justify-between">
                        <span>Active Bid Quote</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                        ${mmBidQuote.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[9px] text-gray-400 mt-0.5">
                        Distance: -{(((midPrice - mmBidQuote) / midPrice) * 100).toFixed(2)}%
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <div className="text-[10px] text-blue-400 font-mono font-semibold uppercase flex items-center justify-between">
                        <span>Reservation Price</span>
                        <Target className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-base font-bold font-mono text-blue-400 mt-1">
                        ${mmReservationPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[9px] text-gray-400 mt-0.5">
                        Mid Price: ${midPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/20">
                      <div className="text-[10px] text-rose-400 font-mono font-semibold uppercase flex items-center justify-between">
                        <span>Active Ask Quote</span>
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-base font-bold font-mono text-rose-400 mt-1">
                        ${mmAskQuote.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[9px] text-gray-400 mt-0.5">
                        Distance: +{(((mmAskQuote - midPrice) / midPrice) * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Inventory Skew Bar */}
                  <div className="mt-3 p-2.5 rounded-lg bg-[#0c0e14] border border-gray-800">
                    <div className="flex items-center justify-between text-[10px] font-mono text-gray-300 mb-1">
                      <span>Inventory Skew</span>
                      <span className="font-bold text-amber-400">
                        {currentInventory > 0 ? `+${currentInventory.toFixed(2)}` : currentInventory.toFixed(2)} {pane.symbol}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300"
                        style={{ width: `${Math.max(0, Math.min(100, 50 + (currentInventory / inventoryLimit) * 50))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[8px] font-mono text-gray-500 mt-1">
                      <span>Short Limit (-{inventoryLimit})</span>
                      <span>Neutral (0.0)</span>
                      <span>Long Limit (+{inventoryLimit})</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ARBITRAGE SCANNER PANEL */}
            {selectedAlgoTab === 'arbitrage' && (
              <div className="space-y-3">
                <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-bold text-sm text-gray-200 flex items-center gap-2">
                        <span>Cross-Asset & Triangular Arbitrage Scanner</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/30">
                          SCANNING 14 EXCHANGES
                        </span>
                      </h4>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Real-time spread detection across spot-futures basis, triangular loops, and funding rate differentials.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setArbAutoExecute(!arbAutoExecute)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-all border ${
                          arbAutoExecute
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        Auto-Execution: {arbAutoExecute ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>

                  {/* Opportunities List */}
                  <div className="space-y-2">
                    {arbitrageOpportunities.map((arb) => (
                      <div
                        key={arb.id}
                        className="p-3 rounded-lg bg-[#0c0e14] border border-gray-800 hover:border-gray-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-gray-200">{arb.title}</span>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-blue-500/10 text-blue-400">
                              {arb.type.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-3">
                            <span>Exchanges: <strong className="text-gray-200">{arb.exchangeA} ↔ {arb.exchangeB}</strong></span>
                            <span>Exec Window: <strong className="text-blue-400">{arb.executionWindowMs} ms</strong></span>
                            <span>Est. Fees: <strong className="text-amber-400">${arb.estFeesUsd.toFixed(2)}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-right">
                            <div className="text-xs font-bold font-mono text-emerald-400">
                              +{arb.spreadPercent}% Spread
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">
                              {arb.netApyPercent}% Net APY
                            </div>
                          </div>

                          <button
                            disabled={arb.status !== 'ACTIVE'}
                            onClick={() => handleExecuteArbitrage(arb.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              arb.status === 'FILLED'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : arb.status === 'EXECUTING'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)]'
                            }`}
                          >
                            {arb.status === 'FILLED' ? 'Arbitrage Captured' : arb.status === 'EXECUTING' ? 'Executing...' : 'Execute Arbitrage'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: TRADE EXECUTION ANALYTICS DASHBOARD */}
        {/* =================================================================== */}
        {activeTab === 'analytics' && (
          <div className="space-y-3">
            {/* Slippage Distribution Chart */}
            <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
              <h4 className="font-bold text-xs text-gray-300 mb-2 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                Slippage Distribution & Execution Quality
              </h4>

              <div className="space-y-1.5">
                {slippageBins.map((bin, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-[10px] font-mono">
                    <span className="w-32 text-gray-400 truncate">{bin.range}</span>
                    <div className="flex-1 h-3 bg-gray-800 rounded overflow-hidden flex">
                      <div
                        className={`h-full ${
                          bin.type === 'positive' ? 'bg-emerald-500' :
                          bin.type === 'neutral' ? 'bg-blue-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${(bin.count / 24) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-bold text-gray-300">{bin.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Execution Cost Breakdown & Benchmarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                <h4 className="font-bold text-xs text-gray-300 mb-2 flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-violet-400" />
                  Execution Cost Decomposition
                </h4>

                <div className="space-y-2 text-[10px] font-mono">
                  <div className="flex justify-between items-center pb-1 border-b border-gray-800">
                    <span className="text-gray-400">Bid-Ask Spread Drag:</span>
                    <span className="text-gray-200 font-bold">$1.20 (0.2 bps)</span>
                  </div>
                  <div className="flex justify-between items-center pb-1 border-b border-gray-800">
                    <span className="text-gray-400">Market Impact Cost:</span>
                    <span className="text-gray-200 font-bold">$0.85 (0.1 bps)</span>
                  </div>
                  <div className="flex justify-between items-center pb-1 border-b border-gray-800">
                    <span className="text-gray-400">Exchange Route Fee:</span>
                    <span className="text-gray-200 font-bold">$1.50 (0.25 bps)</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-emerald-400">
                    <span>Implementation Shortfall:</span>
                    <span>$3.55 Total Drag</span>
                  </div>
                </div>
              </div>

              <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                <h4 className="font-bold text-xs text-gray-300 mb-2 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  Benchmark Execution Performance
                </h4>

                <div className="space-y-2 text-[10px] font-mono">
                  <div className="flex justify-between items-center pb-1 border-b border-gray-800">
                    <span className="text-gray-400">Arrival Price Benchmark:</span>
                    <span className="text-gray-200 font-bold">$65,000.00</span>
                  </div>
                  <div className="flex justify-between items-center pb-1 border-b border-gray-800">
                    <span className="text-gray-400">TWAP Benchmark:</span>
                    <span className="text-gray-200 font-bold">$65,012.40</span>
                  </div>
                  <div className="flex justify-between items-center pb-1 border-b border-gray-800">
                    <span className="text-gray-400">VWAP Benchmark:</span>
                    <span className="text-gray-200 font-bold">$65,018.10</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-blue-400">
                    <span>Final Executed Avg Price:</span>
                    <span>$64,992.50 (+3.9 bps Alpha)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
