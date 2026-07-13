import React, { useMemo } from 'react';
import { TrendingUp, AlertCircle, Percent, BarChart, CheckCircle2, XCircle } from 'lucide-react';
import { Position } from '../types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from 'recharts';

interface StatsPanelProps {
  closedTrades: Position[];
  initialBalance: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#131722] border border-[#2a2e39] rounded p-2 text-[10px] font-mono shadow-xl space-y-0.5 z-50">
        <p className="text-gray-400 font-sans font-semibold">
          {data.timeLabel !== 'Start' ? `Trade #${data.index}` : 'Initial State'}
        </p>
        <p className="text-blue-400">
          Balance: <span className="font-bold">${data.balance.toFixed(2)}</span>
        </p>
        {data.timeLabel !== 'Start' && (
          <>
            <p className={data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              PnL: <span className="font-bold">{data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(2)}</span>
            </p>
            <p className="text-gray-500 text-[9px]">
              Asset: {data.symbol}
            </p>
          </>
        )}
      </div>
    );
  }
  return null;
};

export const StatsPanel: React.FC<StatsPanelProps> = ({ closedTrades, initialBalance }) => {
  // Compute analytics dynamically from closedTrades list
  const stats = useMemo(() => {
    const total = closedTrades.length;
    if (total === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        wins: 0,
        losses: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        largestWin: 0,
        largestLoss: 0,
        expectancy: 0,
        netProfit: 0,
        equityCurve: [initialBalance]
      };
    }

    const winsList = closedTrades.filter((t) => (t.pnl || 0) > 0);
    const lossesList = closedTrades.filter((t) => (t.pnl || 0) <= 0);

    const winCount = winsList.length;
    const lossCount = lossesList.length;
    const winRate = (winCount / total) * 100;

    const sumPnL = closedTrades.reduce((acc, curr) => acc + (curr.pnl || 0), 0);
    const totalGrossWins = winsList.reduce((acc, curr) => acc + (curr.pnl || 0), 0);
    const totalGrossLosses = Math.abs(lossesList.reduce((acc, curr) => acc + (curr.pnl || 0), 0));

    const avgWin = winCount > 0 ? totalGrossWins / winCount : 0;
    const avgLoss = lossCount > 0 ? totalGrossLosses / lossCount : 0;

    const profitFactor = totalGrossLosses > 0 ? totalGrossWins / totalGrossLosses : totalGrossWins > 0 ? 99.9 : 0;
    const expectancy = sumPnL / total;

    const largestWin = winsList.length > 0 ? Math.max(...winsList.map((t) => t.pnl || 0)) : 0;
    const largestLoss = lossesList.length > 0 ? Math.min(...lossesList.map((t) => t.pnl || 0)) : 0;

    // Build incremental cumulative balance points
    let currentBal = initialBalance;
    const equityPoints = [initialBalance];
    closedTrades.forEach((t) => {
      currentBal += t.pnl || 0;
      equityPoints.push(currentBal);
    });

    return {
      totalTrades: total,
      winRate,
      wins: winCount,
      losses: lossCount,
      avgWin,
      avgLoss,
      profitFactor,
      largestWin,
      largestLoss,
      expectancy,
      netProfit: sumPnL,
      equityCurve: equityPoints
    };
  }, [closedTrades, initialBalance]);

  // Compute dataset chronologically formatted for Recharts line plot
  const rechartsData = useMemo(() => {
    const sortedTrades = [...closedTrades].sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0));
    let currentBal = initialBalance;
    const data = [
      {
        index: 0,
        timeLabel: 'Start',
        balance: initialBalance,
        pnl: 0,
        symbol: 'N/A',
      }
    ];

    sortedTrades.forEach((t, i) => {
      currentBal += t.pnl || 0;
      let timeStr = 'Start';
      if (t.exitTime) {
        const date = new Date(t.exitTime * 1000);
        timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        timeStr = `Trade ${i + 1}`;
      }

      data.push({
        index: i + 1,
        timeLabel: timeStr,
        balance: Number(currentBal.toFixed(2)),
        pnl: Number((t.pnl || 0).toFixed(2)),
        symbol: t.symbol,
      });
    });

    return data;
  }, [closedTrades, initialBalance]);

  return (
    <div className="bg-[#171b26] border border-[#2a2e39] rounded-xl p-4.5 space-y-4">
      <div className="flex items-center gap-1.5 border-b border-[#2a2e39] pb-2.5">
        <TrendingUp className="w-4 h-4 text-blue-500" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">STATISTICAL METRICS</h3>
      </div>

      {closedTrades.length === 0 ? (
        <div className="py-4 text-center text-gray-550 text-xs flex flex-col items-center justify-center gap-1.5">
          <BarChart className="w-8 h-8 text-gray-700 animate-pulse" />
          <span>No closed trades in current logs.</span>
          <span className="text-[10px] text-gray-655 font-mono">Fill custom positions to see metrics.</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Main Net Profit Indicator grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#131722] border border-[#202431] rounded p-2.5">
              <span className="text-[10px] font-semibold text-gray-400 block uppercase font-mono">NET REVENUE</span>
              <span className={`text-lg font-bold font-mono ${stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {stats.netProfit >= 0 ? '+' : ''}${stats.netProfit.toFixed(2)}
              </span>
            </div>
            <div className="bg-[#131722] border border-[#202431] rounded p-2.5">
              <span className="text-[10px] font-semibold text-gray-400 block uppercase font-mono">WIN PERCENT</span>
              <span className="text-lg font-bold font-mono text-blue-400 flex items-center gap-1">
                {stats.winRate.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Interactive Recharts Balance Growth Line Chart */}
          <div className="bg-[#10131d] border border-[#2a2e39]/50 rounded-lg p-2.5">
            <span className="text-[9px] uppercase font-mono text-gray-500 mb-2 block">BALANCE TIMELINE (RECHARTS)</span>
            <div className="h-40 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rechartsData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid stroke="#1e222d" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="timeLabel"
                    tick={{ fontSize: 8, fill: '#626d7f' }}
                    tickLine={{ stroke: '#1e222d' }}
                    axisLine={{ stroke: '#1e222d' }}
                    minTickGap={25}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 8, fill: '#626d7f' }}
                    tickLine={{ stroke: '#1e222d' }}
                    axisLine={{ stroke: '#1e222d' }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '2 2' }} />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="#3b82f6"
                    strokeWidth={1.8}
                    dot={{ r: 2, fill: '#3b82f6', strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#60a5fa' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between text-[8px] text-gray-600 font-mono mt-2 pt-1.5 border-t border-[#1e222e]">
              <span>INITIAL: ${initialBalance}</span>
              <span>CURRENT: ${stats.equityCurve[stats.equityCurve.length - 1].toFixed(2)}</span>
            </div>
          </div>

          {/* Stats matrix grid details */}
          <div className="bg-[#131722] border border-[#1e222e] rounded p-3 space-y-2 text-xs font-mono">
            <div className="flex justify-between border-b border-gray-840/20 pb-1">
              <span className="text-gray-400 font-sans">Total Closed:</span>
              <span className="font-bold text-gray-200">{stats.totalTrades}</span>
            </div>
            <div className="flex justify-between border-b border-gray-840/20 pb-1">
              <span className="text-gray-400 font-sans">Profit Factor:</span>
              <span className={`font-bold ${stats.profitFactor >= 1.5 ? 'text-green-400 animate-pulse' : stats.profitFactor >= 1.0 ? 'text-gray-200' : 'text-amber-500'}`}>
                {stats.profitFactor.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-840/20 pb-1">
              <span className="text-gray-400 font-sans">Avg Win / Loss:</span>
              <span className="font-bold text-gray-200">
                <span className="text-emerald-400">+${stats.avgWin.toFixed(1)}</span>
                <span className="text-gray-500 font-sans"> / </span>
                <span className="text-rose-450">-${stats.avgLoss.toFixed(1)}</span>
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-840/20 pb-1">
              <span className="text-gray-400 font-sans">Expectancy:</span>
              <span className={`font-bold ${stats.expectancy >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {stats.expectancy >= 0 ? '+' : ''}${stats.expectancy.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-840/20 pb-1">
              <span className="text-gray-400 font-sans">Largest Win:</span>
              <span className="font-bold text-emerald-450">+${stats.largestWin.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 font-sans">Largest Loss:</span>
              <span className="font-bold text-rose-455">-${Math.abs(stats.largestLoss).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
