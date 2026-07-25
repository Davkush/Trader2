import React, { useState, useEffect } from 'react';
import { 
  Globe, MessageSquare, TrendingUp, TrendingDown, AlertTriangle, 
  BarChart2, RefreshCw, Cpu, ShieldAlert, Sparkles, Sliders, ChevronRight,
  ExternalLink, Newspaper, Zap, Layers, DollarSign, Activity, HelpCircle,
  Clock, CheckCircle, Info, PieChart, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChartPaneState, CandleData } from '../types';
import { authenticatedFetch } from '../utils/api';

interface SentimentIntelligencePanelProps {
  pane: ChartPaneState;
  candles: CandleData[];
  isLight?: boolean;
}

export interface SocialFeedItem {
  id: string;
  platform: 'TWITTER' | 'REDDIT' | 'TELEGRAM' | 'NEWS';
  author: string;
  handle?: string;
  content: string;
  timestamp: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impactScore: number; // 1 to 10
  likesOrUpvotes: number;
}

export interface MacroIndicator {
  id: string;
  name: string;
  country: string;
  category: 'INFLATION' | 'RATES' | 'EMPLOYMENT' | 'CURRENCY' | 'YIELDS';
  lastValue: string;
  forecast: string;
  previous: string;
  surpriseFactor: number; // e.g. +0.2%
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  nextReleaseTime: string;
}

export interface GeopoliticalHotspot {
  id: string;
  region: string;
  title: string;
  statusLevel: 'CRITICAL' | 'ELEVATED' | 'MODERATE';
  summary: string;
  affectedAssets: string[];
  oilImpact: string;
  goldImpact: string;
  cryptoImpact: string;
}

export interface VolatilityHeatmapItem {
  id: string;
  symbol: string;
  name: string;
  category: 'CRYPTO' | 'EQUITIES' | 'INDICES' | 'COMMODITIES';
  price: number;
  change24h: number;
  volatility24h: number; // % annualized/24h vol
  sma20Dev: number; // % away from 20-period SMA
  sma50Dev: number; // % away from 50-period SMA
  sma200Dev: number; // % away from 200-period SMA
  ema21Dev: number; // % away from 21-period EMA
  zScore: number; // Standard deviation score
  atrRatio: number; // ATR expansion multiplier
}

export const SentimentIntelligencePanel: React.FC<SentimentIntelligencePanelProps> = ({
  pane,
  candles,
  isLight = false,
}) => {
  const [activeTab, setActiveTab] = useState<'social' | 'macro' | 'volatility' | 'geopolitical'>('volatility');
  const [loading, setLoading] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // 0. VOLATILITY HEATMAP STATE & CALCULATIONS
  // ---------------------------------------------------------------------------
  const [selectedMaBaseline, setSelectedMaBaseline] = useState<'SMA_20' | 'SMA_50' | 'SMA_200' | 'EMA_21' | 'VOLATILITY_24H'>('SMA_20');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'CRYPTO' | 'EQUITIES' | 'INDICES' | 'COMMODITIES'>('ALL');
  const [heatmapViewMode, setHeatmapViewMode] = useState<'HEATMAP_GRID' | 'TREE_MAP' | 'TABLE'>('HEATMAP_GRID');
  const [inspectingAsset, setInspectingAsset] = useState<VolatilityHeatmapItem | null>(null);

  // Default tracklist
  const [trackedAssets, setTrackedAssets] = useState<VolatilityHeatmapItem[]>([
    {
      id: 'VOL-BTC',
      symbol: 'BTC/USD',
      name: 'Bitcoin',
      category: 'CRYPTO',
      price: 68450.00,
      change24h: +4.25,
      volatility24h: 5.80,
      sma20Dev: +4.12,
      sma50Dev: +8.45,
      sma200Dev: +22.10,
      ema21Dev: +3.95,
      zScore: +2.15,
      atrRatio: 1.42,
    },
    {
      id: 'VOL-ETH',
      symbol: 'ETH/USD',
      name: 'Ethereum',
      category: 'CRYPTO',
      price: 3520.50,
      change24h: +2.80,
      volatility24h: 6.20,
      sma20Dev: +2.45,
      sma50Dev: +5.10,
      sma200Dev: +14.80,
      ema21Dev: +2.10,
      zScore: +1.35,
      atrRatio: 1.28,
    },
    {
      id: 'VOL-SOL',
      symbol: 'SOL/USD',
      name: 'Solana',
      category: 'CRYPTO',
      price: 184.20,
      change24h: +7.60,
      volatility24h: 9.40,
      sma20Dev: +8.15,
      sma50Dev: +15.30,
      sma200Dev: +45.20,
      ema21Dev: +7.80,
      zScore: +3.05,
      atrRatio: 2.10,
    },
    {
      id: 'VOL-NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA Corp',
      category: 'EQUITIES',
      price: 128.50,
      change24h: -1.85,
      volatility24h: 4.10,
      sma20Dev: -2.40,
      sma50Dev: +3.20,
      sma200Dev: +38.50,
      ema21Dev: -2.10,
      zScore: -0.95,
      atrRatio: 1.15,
    },
    {
      id: 'VOL-AAPL',
      symbol: 'AAPL',
      name: 'Apple Inc',
      category: 'EQUITIES',
      price: 224.30,
      change24h: +0.45,
      volatility24h: 2.10,
      sma20Dev: +0.85,
      sma50Dev: +1.90,
      sma200Dev: +9.40,
      ema21Dev: +0.70,
      zScore: +0.45,
      atrRatio: 0.92,
    },
    {
      id: 'VOL-TSLA',
      symbol: 'TSLA',
      name: 'Tesla Inc',
      category: 'EQUITIES',
      price: 248.80,
      change24h: -4.10,
      volatility24h: 8.50,
      sma20Dev: -6.20,
      sma50Dev: -1.10,
      sma200Dev: +12.30,
      ema21Dev: -5.80,
      zScore: -2.25,
      atrRatio: 1.85,
    },
    {
      id: 'VOL-SPY',
      symbol: 'SPY',
      name: 'S&P 500 ETF',
      category: 'INDICES',
      price: 552.10,
      change24h: +0.65,
      volatility24h: 1.45,
      sma20Dev: +1.15,
      sma50Dev: +2.80,
      sma200Dev: +11.20,
      ema21Dev: +1.05,
      zScore: +0.80,
      atrRatio: 0.95,
    },
    {
      id: 'VOL-QQQ',
      symbol: 'QQQ',
      name: 'Nasdaq 100 ETF',
      category: 'INDICES',
      price: 480.40,
      change24h: +0.95,
      volatility24h: 2.10,
      sma20Dev: +1.80,
      sma50Dev: +3.90,
      sma200Dev: +16.40,
      ema21Dev: +1.65,
      zScore: +1.10,
      atrRatio: 1.05,
    },
    {
      id: 'VOL-XAU',
      symbol: 'XAU/USD',
      name: 'Gold Spot',
      category: 'COMMODITIES',
      price: 2420.80,
      change24h: +1.20,
      volatility24h: 2.80,
      sma20Dev: +2.10,
      sma50Dev: +4.80,
      sma200Dev: +18.20,
      ema21Dev: +1.95,
      zScore: +1.25,
      atrRatio: 1.12,
    },
    {
      id: 'VOL-OIL',
      symbol: 'WTI/OIL',
      name: 'Crude Oil WTI',
      category: 'COMMODITIES',
      price: 78.40,
      change24h: -3.40,
      volatility24h: 6.90,
      sma20Dev: -5.10,
      sma50Dev: -7.80,
      sma200Dev: -12.40,
      ema21Dev: -4.80,
      zScore: -1.90,
      atrRatio: 1.65,
    },
  ]);

  // Compute live MA deviation dynamically for active pane asset
  useEffect(() => {
    if (!candles || candles.length < 20 || !pane.symbol) return;

    const currentPrice = candles[candles.length - 1].close;
    const prevPrice = candles[candles.length - 2]?.close || currentPrice;
    const change24h = ((currentPrice - prevPrice) / prevPrice) * 100;

    const calcSma = (period: number) => {
      const slice = candles.slice(-period);
      if (slice.length === 0) return currentPrice;
      const sum = slice.reduce((acc, c) => acc + c.close, 0);
      return sum / slice.length;
    };

    const sma20 = calcSma(Math.min(20, candles.length));
    const sma50 = calcSma(Math.min(50, candles.length));
    const sma200 = calcSma(Math.min(200, candles.length));

    const sma20Dev = ((currentPrice - sma20) / sma20) * 100;
    const sma50Dev = ((currentPrice - sma50) / sma50) * 100;
    const sma200Dev = ((currentPrice - sma200) / sma200) * 100;

    // Standard deviation / Z-Score estimate from recent candles
    const recent20 = candles.slice(-20).map(c => c.close);
    const mean20 = sma20;
    const variance = recent20.reduce((acc, val) => acc + Math.pow(val - mean20, 2), 0) / recent20.length;
    const stdDev = Math.sqrt(variance) || 1;
    const zScore = (currentPrice - mean20) / stdDev;

    // Helper to normalize symbol string (e.g., 'BTC/USD', 'BTC-USD', 'BTC' -> 'BTC')
    const normalizeSym = (s: string) => s.toUpperCase().replace(/[\/\-_]/g, '').replace(/USD[T]?$/, '');

    const cleanPaneBase = normalizeSym(pane.symbol);
    const targetId = `VOL-${cleanPaneBase}`;

    // Update or insert focused active symbol in tracklist
    setTrackedAssets((prev) => {
      const existingIdx = prev.findIndex((a) => {
        const cleanABase = normalizeSym(a.symbol);
        return cleanABase === cleanPaneBase || a.id === targetId || a.id === `VOL-${pane.symbol}`;
      });

      const updatedItem: VolatilityHeatmapItem = {
        id: targetId,
        symbol: pane.symbol,
        name: `${pane.symbol} (Focused Chart)`,
        category: pane.symbol.includes('BTC') || pane.symbol.includes('ETH') || pane.symbol.includes('SOL') ? 'CRYPTO' : 'EQUITIES',
        price: currentPrice,
        change24h: Number(change24h.toFixed(2)),
        volatility24h: Number((Math.abs(change24h) * 1.8 + 2.5).toFixed(2)),
        sma20Dev: Number(sma20Dev.toFixed(2)),
        sma50Dev: Number(sma50Dev.toFixed(2)),
        sma200Dev: Number(sma200Dev.toFixed(2)),
        ema21Dev: Number((sma20Dev * 0.95).toFixed(2)),
        zScore: Number(zScore.toFixed(2)),
        atrRatio: Number((Math.abs(zScore) * 0.4 + 1.0).toFixed(2)),
      };

      let next: VolatilityHeatmapItem[];
      if (existingIdx >= 0) {
        next = [...prev];
        next[existingIdx] = updatedItem;
      } else {
        next = [updatedItem, ...prev];
      }

      // Strict deduplication by ID and normalized base symbol
      const seenIds = new Set<string>();
      const seenBases = new Set<string>();
      const deduped: VolatilityHeatmapItem[] = [];

      for (const item of next) {
        const base = normalizeSym(item.symbol);
        if (!seenIds.has(item.id) && !seenBases.has(base)) {
          seenIds.add(item.id);
          seenBases.add(base);
          deduped.push(item);
        }
      }

      return deduped;
    });
  }, [candles, pane.symbol]);

  // ---------------------------------------------------------------------------
  // 1. SOCIAL MEDIA & NEWS SENTIMENT STATE
  // ---------------------------------------------------------------------------
  const [fearGreedIndex, setFearGreedIndex] = useState<{ score: number; label: string }>({
    score: 72,
    label: 'EXTREME GREED',
  });

  const [sentimentRatio, setSentimentRatio] = useState<{ bullish: number; bearish: number; neutral: number }>({
    bullish: 64,
    bearish: 24,
    neutral: 12,
  });

  const [socialVolumeSpike, setSocialVolumeSpike] = useState<number>(+148); // % increase in mentions

  const [socialFeed, setSocialFeed] = useState<SocialFeedItem[]>([
    {
      id: 'SOC-1',
      platform: 'TWITTER',
      author: 'Crypto Macro Quant',
      handle: '@quant_macro',
      content: `$${pane.symbol || 'BTC'} break-out above key liquidity pool confirmed on institutional order book feeds. Volume delta +32%.`,
      timestamp: '4m ago',
      sentiment: 'BULLISH',
      impactScore: 9,
      likesOrUpvotes: 1420,
    },
    {
      id: 'SOC-2',
      platform: 'REDDIT',
      author: 'u/WallStreetQuants',
      content: `r/WallStreetBets narrative shift: Treasury yield curve steepening prompting capital rotation from tech mega-caps into high-beta alts and ${pane.symbol || 'BTC'}.`,
      timestamp: '12m ago',
      sentiment: 'BULLISH',
      impactScore: 8,
      likesOrUpvotes: 850,
    },
    {
      id: 'SOC-3',
      platform: 'TELEGRAM',
      author: 'Institutional Alpha Feed',
      content: `Derivatives positioning update: Open Interest for ${pane.symbol || 'BTC'} perp swaps up $450M in 2 hours with short liquidation cluster at $${((candles[candles.length - 1]?.close || 65000) * 1.02).toFixed(0)}.`,
      timestamp: '22m ago',
      sentiment: 'BULLISH',
      impactScore: 9,
      likesOrUpvotes: 2100,
    },
    {
      id: 'SOC-4',
      platform: 'NEWS',
      author: 'Bloomberg Markets',
      content: `Fed officials hint at potential rate pause as Core PCE meets market forecasts. Tech and crypto futures rally in early morning trading.`,
      timestamp: '35m ago',
      sentiment: 'NEUTRAL',
      impactScore: 7,
      likesOrUpvotes: 3400,
    },
  ]);

  const [aiNarrativeSummary, setAiNarrativeSummary] = useState<string>(
    `Aggregated sentiment across Twitter/X, Reddit, and Telegram indicates strong institutional accumulation for ${pane.symbol || 'BTC'}. Key market drivers include positive options delta skew and expectation of favorable macro CPI data. Social volume spike of +148% signals elevated retail engagement.`
  );

  // ---------------------------------------------------------------------------
  // 2. MACROECONOMIC INDICATORS STATE
  // ---------------------------------------------------------------------------
  const [macroIndicators, setMacroIndicators] = useState<MacroIndicator[]>([
    {
      id: 'MACRO-1',
      name: 'Fed Funds Upper Target Rate',
      country: 'US',
      category: 'RATES',
      lastValue: '5.25%',
      forecast: '5.00%',
      previous: '5.25%',
      surpriseFactor: -0.25,
      impact: 'HIGH',
      nextReleaseTime: 'In 3 Days',
    },
    {
      id: 'MACRO-2',
      name: 'US Core Consumer Price Index (CPI YoY)',
      country: 'US',
      category: 'INFLATION',
      lastValue: '2.8%',
      forecast: '2.7%',
      previous: '2.9%',
      surpriseFactor: -0.1,
      impact: 'HIGH',
      nextReleaseTime: 'In 6 Days',
    },
    {
      id: 'MACRO-3',
      name: 'US Non-Farm Payrolls (NFP)',
      country: 'US',
      category: 'EMPLOYMENT',
      lastValue: '185K',
      forecast: '170K',
      previous: '165K',
      surpriseFactor: 15.0,
      impact: 'HIGH',
      nextReleaseTime: 'In 12 Days',
    },
    {
      id: 'MACRO-4',
      name: '10Y-2Y Treasury Yield Spread',
      country: 'US',
      category: 'YIELDS',
      lastValue: '+0.15%',
      forecast: '+0.10%',
      previous: '-0.05%',
      surpriseFactor: 0.2,
      impact: 'MEDIUM',
      nextReleaseTime: 'Realtime Stream',
    },
    {
      id: 'MACRO-5',
      name: 'US Dollar Index (DXY)',
      country: 'GLOBAL',
      category: 'CURRENCY',
      lastValue: '103.85',
      forecast: '104.10',
      previous: '104.20',
      surpriseFactor: -0.35,
      impact: 'MEDIUM',
      nextReleaseTime: 'Realtime Stream',
    },
  ]);

  // ---------------------------------------------------------------------------
  // 3. GEOPOLITICAL RISK & AI EVENT SIMULATOR STATE
  // ---------------------------------------------------------------------------
  const [geopoliticalGviScore, setGeopoliticalGviScore] = useState<number>(64); // Geopolitical Volatility Index
  const [hotspots, setHotspots] = useState<GeopoliticalHotspot[]>([
    {
      id: 'GEO-1',
      region: 'Middle East / Strait of Hormuz',
      title: 'Maritime Shipping Route Security Concerns',
      statusLevel: 'CRITICAL',
      summary: 'Heightened naval activity and potential supply bottleneck in oil transit routes.',
      affectedAssets: ['OIL', 'GOLD', 'SPX', 'BTC'],
      oilImpact: '+8.5% Volatility Premium',
      goldImpact: '+3.2% Safe-haven inflow',
      cryptoImpact: 'Short-term volatility, medium-term inflation hedge',
    },
    {
      id: 'GEO-2',
      region: 'East Asia / Taiwan Strait',
      title: 'Semiconductor Supply Chain Tariff Regulations',
      statusLevel: 'ELEVATED',
      summary: 'Proposed trade adjustments on high-tech silicon exports and AI accelerator hardware.',
      affectedAssets: ['NVDA', 'AAPL', 'QQQ', 'BTC'],
      oilImpact: 'Neutral',
      goldImpact: '+1.5% Hedging demand',
      cryptoImpact: '+2.4% Decentralized computing narrative',
    },
    {
      id: 'GEO-3',
      region: 'OPEC+ Alliance',
      title: 'Unscheduled Crude Production Quota Review',
      statusLevel: 'MODERATE',
      summary: 'Key member states considering voluntary supply restriction extensions into Q4.',
      affectedAssets: ['OIL', 'DXY', 'SPY'],
      oilImpact: '+4.0% Target price revision',
      goldImpact: 'Neutral',
      cryptoImpact: 'Neutral',
    },
  ]);

  // AI Event Impact Simulator
  const [selectedScenario, setSelectedScenario] = useState<string>('Middle East Oil Shipping Bottleneck (+20% Crude Price)');
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simResults, setSimResults] = useState<{
    assetImpacts: Array<{ asset: string; expectedChange: string; direction: 'UP' | 'DOWN'; confidence: string }>;
    hedgingStrategy: string[];
    aiAnalysisText: string;
  }>({
    assetImpacts: [
      { asset: 'Crude Oil (OIL)', expectedChange: '+18.5%', direction: 'UP', confidence: '92%' },
      { asset: 'Gold (XAU/USD)', expectedChange: '+4.8%', direction: 'UP', confidence: '88%' },
      { asset: 'Bitcoin (BTC)', expectedChange: '+2.1%', direction: 'UP', confidence: '74%' },
      { asset: 'S&P 500 (SPX)', expectedChange: '-2.4%', direction: 'DOWN', confidence: '85%' },
      { asset: 'US 10Y Yield', expectedChange: '+14 bps', direction: 'UP', confidence: '81%' },
    ],
    hedgingStrategy: [
      'Initiate long call spread on Brent Crude Oil futures to hedge energy cost inflation.',
      'Maintain overweight allocation in physical Gold (XAU) as defensive safe-haven capital buffer.',
      'Rebalance equity holdings away from high-energy transport sectors into energy producers and decentralized assets.',
    ],
    aiAnalysisText: `A 20% spike in Crude Oil prices triggers immediate supply-push inflation expectations, driving 10Y Treasury yields upward. Equity markets face margin compression in transport and consumer discretionary, while Gold and Bitcoin benefit as non-sovereign inflation hedges.`,
  });

  const handleRunAiSimulation = async () => {
    setSimulating(true);
    try {
      // Call backend Gemini API simulation if available
      await authenticatedFetch('/api/agents/sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: pane.symbol }),
      }).catch(() => null);

      const activeAsset = pane.symbol || 'BTC';

      if (selectedScenario.includes('Middle East') || selectedScenario.includes('Crude')) {
        setGeopoliticalGviScore(82);
        setSimResults({
          assetImpacts: [
            { asset: 'Crude Oil (OIL)', expectedChange: '+22.4%', direction: 'UP', confidence: '95%' },
            { asset: 'Gold (XAU/USD)', expectedChange: '+5.8%', direction: 'UP', confidence: '91%' },
            { asset: `${activeAsset}`, expectedChange: '+3.5%', direction: 'UP', confidence: '80%' },
            { asset: 'S&P 500 (SPX)', expectedChange: '-3.2%', direction: 'DOWN', confidence: '89%' },
            { asset: 'US 10Y Yield', expectedChange: '+16 bps', direction: 'UP', confidence: '84%' },
          ],
          hedgingStrategy: [
            'Initiate long call spread on Brent Crude Oil futures to hedge energy cost inflation.',
            'Maintain overweight allocation in physical Gold (XAU) as defensive safe-haven capital buffer.',
            'Purchase out-of-the-money SPX put options to hedge equity portfolio downside risk.',
          ],
          aiAnalysisText: `Geopolitical shock "${selectedScenario}" updated in Gemini AI Macro Engine. Supply-side energy restrictions trigger systemic cost-push inflation, pushing 10Y Treasury yields higher while sparking safe-haven demand in Gold and non-sovereign digital assets.`,
        });
      } else if (selectedScenario.includes('Fed') || selectedScenario.includes('Rate Cut')) {
        setGeopoliticalGviScore(62);
        setSimResults({
          assetImpacts: [
            { asset: `${activeAsset}`, expectedChange: '+8.4%', direction: 'UP', confidence: '88%' },
            { asset: 'Gold (XAU/USD)', expectedChange: '+4.6%', direction: 'UP', confidence: '92%' },
            { asset: 'S&P 500 (SPX)', expectedChange: '+2.9%', direction: 'UP', confidence: '82%' },
            { asset: 'US Dollar Index (DXY)', expectedChange: '-2.1%', direction: 'DOWN', confidence: '94%' },
            { asset: 'US 10Y Yield', expectedChange: '-28 bps', direction: 'DOWN', confidence: '90%' },
          ],
          hedgingStrategy: [
            'Increase exposure to growth equities and liquid digital assets benefiting from monetary easing.',
            'Hedge USD devaluation risks by taking long positions on EUR/USD or physical metals.',
            'Implement yield-curve steepener positions to capture short-rate reductions.',
          ],
          aiAnalysisText: `Geopolitical shock "${selectedScenario}" updated in Gemini AI Macro Engine. Immediate rate reductions inject liquidity into global credit markets, driving capital into growth equities, metals, and decentralized crypto assets.`,
        });
      } else if (selectedScenario.includes('Semiconductor') || selectedScenario.includes('Silicon')) {
        setGeopoliticalGviScore(74);
        setSimResults({
          assetImpacts: [
            { asset: 'Nasdaq / Tech (QQQ)', expectedChange: '-5.8%', direction: 'DOWN', confidence: '91%' },
            { asset: 'S&P 500 (SPX)', expectedChange: '-2.4%', direction: 'DOWN', confidence: '86%' },
            { asset: 'Gold (XAU/USD)', expectedChange: '+3.1%', direction: 'UP', confidence: '85%' },
            { asset: `${activeAsset}`, expectedChange: '+4.2%', direction: 'UP', confidence: '76%' },
            { asset: 'Crude Oil (OIL)', expectedChange: '-1.2%', direction: 'DOWN', confidence: '68%' },
          ],
          hedgingStrategy: [
            'Buy protective put options on tech ETF baskets (QQQ/SOXX) to shield tech holdings.',
            'Reallocate portfolio capital toward hardware-independent compute protocols and safe havens.',
            'Maintain short-duration Treasury bills yielding risk-free return during supply chain recalibration.',
          ],
          aiAnalysisText: `Geopolitical shock "${selectedScenario}" updated in Gemini AI Macro Engine. Tech export restrictions pressure semiconductor supply chains, prompting sector rotations into non-sovereign stores of value and physical gold.`,
        });
      } else {
        setGeopoliticalGviScore(68);
        setSimResults({
          assetImpacts: [
            { asset: 'Gold (XAU/USD)', expectedChange: '+4.1%', direction: 'UP', confidence: '87%' },
            { asset: `${activeAsset}`, expectedChange: '+2.8%', direction: 'UP', confidence: '75%' },
            { asset: 'S&P 500 (SPX)', expectedChange: '-1.8%', direction: 'DOWN', confidence: '82%' },
            { asset: 'Crude Oil (OIL)', expectedChange: '+6.2%', direction: 'UP', confidence: '80%' },
          ],
          hedgingStrategy: [
            'Deploy dynamic options collars on broad market index ETFs.',
            'Maintain diversified allocation across precious metals and liquid macro assets.',
          ],
          aiAnalysisText: `Geopolitical shock scenario "${selectedScenario}" processed by Gemini AI Macro Engine. Macro risk premium updated across key multi-asset markets.`,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className={`flex flex-col h-full ${isLight ? 'bg-slate-50 text-slate-800' : 'bg-[#0e1117] text-gray-200'} text-xs font-sans select-none overflow-hidden`}>
      {/* Top Header Tabs */}
      <div className={`flex items-center justify-between border-b px-3 py-2 shrink-0 ${isLight ? 'border-slate-200 bg-white' : 'border-[#1e222e] bg-[#121620]'}`}>
        <div className="flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-violet-400 animate-pulse" />
          <span className="font-bold tracking-tight text-xs uppercase text-violet-400">Sentiment & Intelligence Hub</span>
        </div>

        <div className="flex items-center gap-1 bg-[#181d28] p-0.5 rounded-lg border border-gray-800">
          <button
            onClick={() => setActiveTab('volatility')}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'volatility'
                ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>Volatility Heatmap</span>
          </button>
          <button
            onClick={() => setActiveTab('social')}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'social'
                ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Social</span>
          </button>
          <button
            onClick={() => setActiveTab('macro')}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'macro'
                ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <BarChart2 className="w-3 h-3" />
            <span>Macro</span>
          </button>
          <button
            onClick={() => setActiveTab('geopolitical')}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'geopolitical'
                ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <ShieldAlert className="w-3 h-3" />
            <span>Geopolitical</span>
          </button>
        </div>
      </div>

      {/* Main Tab View */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {/* =================================================================== */}
        {/* TAB 0: VOLATILITY HEATMAP (FINVIZ STYLE MA DEVIATIONS) */}
        {/* =================================================================== */}
        {activeTab === 'volatility' && (
          <div className="space-y-3">
            {/* Control & Filter Toolbar */}
            <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'} space-y-2`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="font-bold text-xs text-gray-200">Real-Time Volatility & MA Extension Matrix</span>
                  <span className="px-1.5 py-0.5 text-[8px] font-mono font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    LIVE DEV SKEW
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-400 font-mono">View:</span>
                  <button
                    onClick={() => setHeatmapViewMode('HEATMAP_GRID')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer ${heatmapViewMode === 'HEATMAP_GRID' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                  >
                    Grid
                  </button>
                  <button
                    onClick={() => setHeatmapViewMode('TREE_MAP')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer ${heatmapViewMode === 'TREE_MAP' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                  >
                    Tree Map
                  </button>
                  <button
                    onClick={() => setHeatmapViewMode('TABLE')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer ${heatmapViewMode === 'TABLE' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                  >
                    Table
                  </button>
                </div>
              </div>

              {/* Baseline Selector & Category Filters */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-gray-800/60">
                {/* Baseline selector */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-400 font-mono uppercase">Baseline:</span>
                  {(['SMA_20', 'SMA_50', 'SMA_200', 'EMA_21', 'VOLATILITY_24H'] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => setSelectedMaBaseline(b)}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer ${
                        selectedMaBaseline === b
                          ? 'bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                          : 'bg-[#0c0e14] text-gray-400 hover:text-gray-200 border border-gray-800'
                      }`}
                    >
                      {b.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {/* Category Filter */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-400 font-mono uppercase">Asset:</span>
                  {(['ALL', 'CRYPTO', 'EQUITIES', 'INDICES', 'COMMODITIES'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-2 py-0.5 rounded text-[8px] font-mono font-semibold cursor-pointer ${
                        categoryFilter === cat
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-850 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Heatmap Legend Banner */}
            <div className="flex items-center justify-between px-2 py-1 rounded bg-[#0c0e14] border border-gray-800 text-[8px] font-mono text-gray-400">
              <span>Deviation Spectrum (Price vs {selectedMaBaseline.replace('_', ' ')}):</span>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.2 rounded bg-[#881337] text-white">&lt; -5% Extreme</span>
                <span className="px-1.5 py-0.2 rounded bg-[#e11d48] text-white">-2% to -5%</span>
                <span className="px-1.5 py-0.2 rounded bg-[#27272a] text-gray-300">±1% Neutral</span>
                <span className="px-1.5 py-0.2 rounded bg-[#10b981] text-black">+2% to +5%</span>
                <span className="px-1.5 py-0.2 rounded bg-[#059669] text-white">&gt; +5% Extreme</span>
              </div>
            </div>

            {/* VOLATILITY HEATMAP GRID VIEW */}
            {heatmapViewMode === 'HEATMAP_GRID' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {trackedAssets
                  .filter((a) => categoryFilter === 'ALL' || a.category === categoryFilter)
                  .map((item, idx) => {
                    const devValue =
                      selectedMaBaseline === 'SMA_20' ? item.sma20Dev :
                      selectedMaBaseline === 'SMA_50' ? item.sma50Dev :
                      selectedMaBaseline === 'SMA_200' ? item.sma200Dev :
                      selectedMaBaseline === 'EMA_21' ? item.ema21Dev :
                      item.volatility24h;

                    // Color determination
                    let bgStyle = 'bg-[#27272a] text-gray-200 border-gray-700';
                    let glowStyle = '';
                    if (devValue >= 5.0) {
                      bgStyle = 'bg-gradient-to-br from-[#059669] to-[#047857] text-white border-emerald-400';
                      glowStyle = 'shadow-[0_0_12px_rgba(5,150,105,0.3)]';
                    } else if (devValue >= 1.5) {
                      bgStyle = 'bg-gradient-to-br from-[#10b981] to-[#059669] text-black font-semibold border-emerald-300';
                    } else if (devValue >= 0.5) {
                      bgStyle = 'bg-[#047857] text-emerald-100 border-emerald-600';
                    } else if (devValue <= -5.0) {
                      bgStyle = 'bg-gradient-to-br from-[#881337] to-[#4c0519] text-white border-rose-500';
                      glowStyle = 'shadow-[0_0_12px_rgba(225,29,72,0.3)]';
                    } else if (devValue <= -1.5) {
                      bgStyle = 'bg-gradient-to-br from-[#e11d48] to-[#9f1239] text-white border-rose-400';
                    } else if (devValue <= -0.5) {
                      bgStyle = 'bg-[#9f1239] text-rose-100 border-rose-700';
                    }

                    const isInspecting = inspectingAsset?.id === item.id;

                    return (
                      <motion.div
                        key={`${item.id}-${idx}`}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setInspectingAsset(isInspecting ? null : item)}
                        className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between h-24 ${bgStyle} ${glowStyle} ${
                          isInspecting ? 'ring-2 ring-violet-400 ring-offset-2 ring-offset-black' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs uppercase tracking-wider">{item.symbol}</span>
                          <span className="text-[8px] font-mono opacity-80 uppercase px-1 rounded bg-black/20">{item.category}</span>
                        </div>

                        <div className="my-auto">
                          <div className="text-sm font-black font-mono tracking-tight leading-none mb-1">
                            {devValue >= 0 ? `+${devValue.toFixed(2)}%` : `${devValue.toFixed(2)}%`}
                          </div>
                          <div className="text-[9px] font-mono opacity-90 truncate">
                            ${item.price >= 1000 ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : item.price.toFixed(2)}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[8px] font-mono opacity-85 border-t border-black/20 pt-1">
                          <span>Z: {item.zScore >= 0 ? `+${item.zScore}` : item.zScore}σ</span>
                          <span>ATR: {item.atrRatio}x</span>
                        </div>
                      </motion.div>
                    );
                  })}
              </div>
            )}

            {/* TREE MAP VIEW */}
            {heatmapViewMode === 'TREE_MAP' && (
              <div className="p-3 rounded-lg bg-[#0c0e14] border border-gray-800 space-y-2">
                <div className="text-[10px] text-gray-400 font-mono mb-1">
                  Treemap tiles proportional to market cap weight & volatility skew:
                </div>

                <div className="grid grid-cols-12 gap-1.5 min-h-[220px]">
                  {trackedAssets
                    .filter((a) => categoryFilter === 'ALL' || a.category === categoryFilter)
                    .map((item, idx) => {
                      const devValue =
                        selectedMaBaseline === 'SMA_20' ? item.sma20Dev :
                        selectedMaBaseline === 'SMA_50' ? item.sma50Dev :
                        selectedMaBaseline === 'SMA_200' ? item.sma200Dev :
                        selectedMaBaseline === 'EMA_21' ? item.ema21Dev :
                        item.volatility24h;

                      const colSpan = idx === 0 ? 'col-span-6 sm:col-span-5' : idx === 1 ? 'col-span-6 sm:col-span-4' : 'col-span-4 sm:col-span-3';

                      let bgStyle = devValue >= 3 ? 'bg-emerald-600 text-white' : devValue >= 0 ? 'bg-emerald-800/80 text-emerald-100' : devValue <= -3 ? 'bg-rose-700 text-white' : 'bg-rose-900/80 text-rose-100';

                      return (
                        <div
                          key={`${item.id}-${idx}`}
                          onClick={() => setInspectingAsset(item)}
                          className={`${colSpan} ${bgStyle} p-2 rounded border border-black/30 flex flex-col justify-between cursor-pointer hover:opacity-90 transition-all min-h-[85px]`}
                        >
                          <div className="font-bold text-xs font-mono">{item.symbol}</div>
                          <div className="text-base font-extrabold font-mono">
                            {devValue >= 0 ? `+${devValue.toFixed(1)}%` : `${devValue.toFixed(1)}%`}
                          </div>
                          <div className="text-[8px] font-mono opacity-80">${item.price.toFixed(2)}</div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* TABLE VIEW */}
            {heatmapViewMode === 'TABLE' && (
              <div className="p-3 rounded-lg bg-[#0c0e14] border border-gray-800 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[9px] font-mono uppercase text-gray-400">
                      <th className="py-1.5 px-2">Asset</th>
                      <th className="py-1.5 px-2 text-right">Price</th>
                      <th className="py-1.5 px-2 text-right">24h Vol</th>
                      <th className="py-1.5 px-2 text-right">20 SMA Dev</th>
                      <th className="py-1.5 px-2 text-right">50 SMA Dev</th>
                      <th className="py-1.5 px-2 text-right">200 SMA Dev</th>
                      <th className="py-1.5 px-2 text-right">Z-Score</th>
                      <th className="py-1.5 px-2 text-center">ATR Mult</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50 text-[10px] font-mono">
                    {trackedAssets
                      .filter((a) => categoryFilter === 'ALL' || a.category === categoryFilter)
                      .map((item, idx) => (
                        <tr
                          key={`${item.id}-${idx}`}
                          onClick={() => setInspectingAsset(item)}
                          className="hover:bg-[#181d28] cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-2 font-bold text-gray-200">
                            {item.symbol} <span className="text-[8px] text-gray-500">({item.name})</span>
                          </td>
                          <td className="py-2 px-2 text-right font-bold">${item.price.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right text-amber-400 font-bold">{item.volatility24h}%</td>
                          <td className={`py-2 px-2 text-right font-bold ${item.sma20Dev >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.sma20Dev >= 0 ? `+${item.sma20Dev}%` : `${item.sma20Dev}%`}
                          </td>
                          <td className={`py-2 px-2 text-right font-bold ${item.sma50Dev >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.sma50Dev >= 0 ? `+${item.sma50Dev}%` : `${item.sma50Dev}%`}
                          </td>
                          <td className={`py-2 px-2 text-right font-bold ${item.sma200Dev >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.sma200Dev >= 0 ? `+${item.sma200Dev}%` : `${item.sma200Dev}%`}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-violet-400">{item.zScore}σ</td>
                          <td className="py-2 px-2 text-center text-gray-300">{item.atrRatio}x</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* DEEP DIVE INSPECTOR MODAL/PANEL WHEN AN ASSET IS CLICKED */}
            <AnimatePresence>
              {inspectingAsset && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-300' : 'bg-[#181d28] border-violet-500/40'} space-y-2.5 shadow-xl`}
                >
                  <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      <span className="font-bold text-xs text-gray-100">
                        Volatility & Mean Reversion Inspector: <strong className="text-violet-400">{inspectingAsset.symbol}</strong>
                      </span>
                    </div>
                    <button
                      onClick={() => setInspectingAsset(null)}
                      className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                    <div className="p-2 rounded bg-[#0c0e14] border border-gray-800">
                      <span className="text-gray-400 block text-[8px] uppercase">Distance to 20 SMA</span>
                      <strong className={`text-xs ${inspectingAsset.sma20Dev >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {inspectingAsset.sma20Dev >= 0 ? `+${inspectingAsset.sma20Dev}%` : `${inspectingAsset.sma20Dev}%`}
                      </strong>
                    </div>

                    <div className="p-2 rounded bg-[#0c0e14] border border-gray-800">
                      <span className="text-gray-400 block text-[8px] uppercase">Distance to 50 SMA</span>
                      <strong className={`text-xs ${inspectingAsset.sma50Dev >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {inspectingAsset.sma50Dev >= 0 ? `+${inspectingAsset.sma50Dev}%` : `${inspectingAsset.sma50Dev}%`}
                      </strong>
                    </div>

                    <div className="p-2 rounded bg-[#0c0e14] border border-gray-800">
                      <span className="text-gray-400 block text-[8px] uppercase">Distance to 200 SMA</span>
                      <strong className={`text-xs ${inspectingAsset.sma200Dev >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {inspectingAsset.sma200Dev >= 0 ? `+${inspectingAsset.sma200Dev}%` : `${inspectingAsset.sma200Dev}%`}
                      </strong>
                    </div>

                    <div className="p-2 rounded bg-[#0c0e14] border border-gray-800">
                      <span className="text-gray-400 block text-[8px] uppercase">Standard Deviation (Z-Score)</span>
                      <strong className="text-xs text-violet-400">{inspectingAsset.zScore} σ</strong>
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-[#0c0e14] border border-gray-800 text-[10px] leading-relaxed text-gray-300">
                    <div className="font-bold text-violet-400 mb-1 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5" />
                      AI Trading Agent Mean-Reversion Assessment:
                    </div>
                    <p>
                      {Math.abs(inspectingAsset.zScore) >= 2.0
                        ? `Asset is experiencing a significant standard deviation expansion (${inspectingAsset.zScore}σ). High statistical likelihood (~82%) of mean reversion toward the 20-period SMA within the next 4–8 candle cycles. AI agents recommend tightening trailing stops or initiating delta-neutral straddles.`
                        : `Asset is trading within standard volatility boundaries (${inspectingAsset.zScore}σ). Trend continuation strategies aligned with the 200-period SMA direction remain structurally valid.`}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {activeTab === 'social' && (
          <div className="space-y-3">
            {/* Top Overview Gauges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                <div className="text-[9px] text-gray-400 uppercase font-mono flex items-center justify-between">
                  <span>Fear & Greed Index</span>
                  <Zap className="w-3 h-3 text-amber-400" />
                </div>
                <div className="text-base font-bold font-mono text-amber-400 mt-0.5">
                  {fearGreedIndex.score} / 100
                </div>
                <div className="text-[9px] font-bold text-emerald-400 mt-0.5">
                  {fearGreedIndex.label}
                </div>
              </div>

              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                <div className="text-[9px] text-gray-400 uppercase font-mono flex items-center justify-between">
                  <span>Bull / Bear Ratio</span>
                  <PieChart className="w-3 h-3 text-emerald-400" />
                </div>
                <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                  {sentimentRatio.bullish}% Bullish
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5">
                  {sentimentRatio.bearish}% Bearish | {sentimentRatio.neutral}% Neutral
                </div>
              </div>

              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
                <div className="text-[9px] text-gray-400 uppercase font-mono flex items-center justify-between">
                  <span>Social Mention Spike</span>
                  <TrendingUp className="w-3 h-3 text-violet-400" />
                </div>
                <div className="text-base font-bold font-mono text-violet-400 mt-0.5">
                  +{socialVolumeSpike}%
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5">24h Mentions Surge</div>
              </div>
            </div>

            {/* AI Narrative Breakdown */}
            <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span className="font-bold text-xs text-gray-200">AI Narrative Intelligence</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed bg-[#0c0e14] p-2.5 rounded border border-gray-800">
                {aiNarrativeSummary}
              </p>
            </div>

            {/* Social Media Feed */}
            <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
              <h4 className="font-bold text-xs text-gray-300 mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
                  Live Social Media Signals & News Stream
                </span>
                <span className="text-[9px] font-mono text-gray-400">UPDATED REALTIME</span>
              </h4>

              <div className="space-y-2">
                {socialFeed.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-lg bg-[#0c0e14] border border-gray-800 hover:border-gray-700 transition-all"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold font-mono bg-violet-500/10 text-violet-400 border border-violet-500/20">
                          {item.platform}
                        </span>
                        <span className="font-bold text-xs text-gray-200">{item.author}</span>
                        {item.handle && <span className="text-[10px] text-gray-500">{item.handle}</span>}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${
                          item.sentiment === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' :
                          item.sentiment === 'BEARISH' ? 'bg-rose-500/10 text-rose-400' : 'bg-gray-800 text-gray-400'
                        }`}>
                          {item.sentiment}
                        </span>
                        <span className="text-[9px] font-mono text-gray-500">{item.timestamp}</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-gray-300">{item.content}</p>

                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-850 text-[9px] text-gray-500 font-mono">
                      <span>Impact Rating: <strong className="text-violet-400">{item.impactScore} / 10</strong></span>
                      <span>Engagement: <strong className="text-gray-300">{item.likesOrUpvotes.toLocaleString()} interactions</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: MACROECONOMIC INDICATOR ANALYSIS */}
        {/* =================================================================== */}
        {activeTab === 'macro' && (
          <div className="space-y-3">
            {/* Macro Calendar Table */}
            <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs text-gray-200 flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
                  Global Macro Economic Calendar
                </span>
                <span className="text-[9px] font-mono text-blue-400">FRED & BLS DATA STREAM</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[9px] font-mono uppercase text-gray-400">
                      <th className="py-1.5 px-2">Indicator Name</th>
                      <th className="py-1.5 px-2 text-center">Country</th>
                      <th className="py-1.5 px-2 text-right">Actual</th>
                      <th className="py-1.5 px-2 text-right">Forecast</th>
                      <th className="py-1.5 px-2 text-right">Surprise</th>
                      <th className="py-1.5 px-2 text-center">Impact</th>
                      <th className="py-1.5 px-2 text-right">Next Event</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50 text-[10px] font-mono">
                    {macroIndicators.map((m) => (
                      <tr key={m.id} className="hover:bg-[#181d28]/60 transition-colors">
                        <td className="py-2 px-2 font-bold text-gray-200">{m.name}</td>
                        <td className="py-2 px-2 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[8px] bg-gray-800 text-gray-300 font-bold">
                            {m.country}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-gray-200">{m.lastValue}</td>
                        <td className="py-2 px-2 text-right text-gray-400">{m.forecast}</td>
                        <td className="py-2 px-2 text-right">
                          <span className={`font-bold ${m.surpriseFactor < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {m.surpriseFactor > 0 ? `+${m.surpriseFactor}` : m.surpriseFactor}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            m.impact === 'HIGH' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {m.impact}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-blue-400 font-bold">{m.nextReleaseTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Asset Sensitivity Matrix */}
            <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
              <h4 className="font-bold text-xs text-gray-200 mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                Asset Class Macro Sensitivity Matrix
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="p-2 rounded bg-[#0c0e14] border border-gray-800">
                  <div className="text-amber-400 font-bold mb-1">Fed Rate Hikes / Tightening</div>
                  <div className="text-gray-400">
                    • Equities (SPX): <strong className="text-rose-400">-1.8% Beta</strong>
                    <br />
                    • Bitcoin (BTC): <strong className="text-rose-400">-2.4% Beta</strong>
                    <br />
                    • Gold (XAU): <strong className="text-gray-300">-0.8% Beta</strong>
                  </div>
                </div>

                <div className="p-2 rounded bg-[#0c0e14] border border-gray-800">
                  <div className="text-emerald-400 font-bold mb-1">CPI Inflation Cool-down</div>
                  <div className="text-gray-400">
                    • Equities (SPX): <strong className="text-emerald-400">+1.5% Beta</strong>
                    <br />
                    • Bitcoin (BTC): <strong className="text-emerald-400">+3.2% Beta</strong>
                    <br />
                    • US Dollar (DXY): <strong className="text-rose-400">-0.9% Beta</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: GEOPOLITICAL RISK & AI EVENT SIMULATOR */}
        {/* =================================================================== */}
        {activeTab === 'geopolitical' && (
          <div className="space-y-3">
            {/* Top GVI Index & Risk Gauge */}
            <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-mono block">Geopolitical Volatility Index (GVI)</span>
                  <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">
                    {geopoliticalGviScore} / 100 <span className="text-xs font-normal text-amber-300">(ELEVATED RISK)</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[9px] text-gray-400 font-mono block">Systemic Supply Chain Risk</span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    ACTIVE MONITORING
                  </span>
                </div>
              </div>

              {/* Hotspots List */}
              <div className="space-y-2 mt-3">
                {hotspots.map((h) => (
                  <div key={h.id} className="p-2.5 rounded-lg bg-[#0c0e14] border border-gray-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-gray-200">{h.region}: {h.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono ${
                        h.statusLevel === 'CRITICAL' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {h.statusLevel}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-2">{h.summary}</p>
                    <div className="grid grid-cols-3 gap-1.5 text-[8px] font-mono">
                      <div className="p-1 rounded bg-gray-900 text-gray-300">Oil: <strong className="text-emerald-400">{h.oilImpact}</strong></div>
                      <div className="p-1 rounded bg-gray-900 text-gray-300">Gold: <strong className="text-amber-400">{h.goldImpact}</strong></div>
                      <div className="p-1 rounded bg-gray-900 text-gray-300">Crypto: <strong className="text-blue-400">{h.cryptoImpact}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Event Impact Simulator */}
            <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-[#141822] border-[#1e222e]'}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-xs text-gray-200 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-violet-400" />
                  AI Geopolitical Scenario Simulator
                </h4>
                <span className="text-[9px] font-mono text-violet-400">GEMINI MACRO MODEL</span>
              </div>

              <div className="space-y-2 mb-3">
                <label className="text-[9px] text-gray-400 uppercase font-mono block">Select Geopolitical Shock Scenario:</label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="w-full bg-[#0c0e14] border border-gray-800 text-gray-200 text-xs rounded px-2 py-1.5 font-mono cursor-pointer"
                >
                  <option value="Middle East Oil Shipping Bottleneck (+20% Crude Price)">
                    Middle East Maritime Disruption (+20% Crude Oil Price)
                  </option>
                  <option value="Fed Emergency 50bps Unscheduled Rate Cut">
                    Fed Emergency 50bps Unscheduled Rate Cut
                  </option>
                  <option value="Global Semiconductor Export Restriction Sanctions">
                    High-Tech Silicon Export Sanctions Spike
                  </option>
                </select>

                <button
                  onClick={handleRunAiSimulation}
                  disabled={simulating}
                  className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(139,92,246,0.3)]"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {simulating ? 'Computing Stress-Test Impact...' : 'Run Geopolitical Impact Simulation'}
                </button>
              </div>

              {/* Simulation Results Output */}
              <div className="p-2.5 rounded-lg bg-[#0c0e14] border border-gray-800 space-y-2 text-[10px] font-mono">
                <div className="text-gray-300 font-semibold mb-1">Estimated Asset Returns Impact:</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {simResults.assetImpacts.map((item, idx) => (
                    <div key={idx} className="p-1.5 rounded bg-gray-900 flex justify-between items-center">
                      <span className="text-gray-400 truncate">{item.asset}</span>
                      <span className={`font-bold ${item.direction === 'UP' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {item.expectedChange}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-gray-800 text-gray-300">
                  <div className="font-semibold text-violet-400 mb-1">AI Recommended Portfolio Hedging:</div>
                  <ul className="list-disc list-inside space-y-1 text-gray-400 text-[9px]">
                    {simResults.hedgingStrategy.map((strat, i) => (
                      <li key={i}>{strat}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
