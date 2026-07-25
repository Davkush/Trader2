import React, { useState, useEffect, useRef } from 'react';
import { Search, Globe, ChevronRight, Hash, Clock, X, LayoutGrid, Sliders, Play } from 'lucide-react';
import { POPULAR_SYMBOLS } from '../utils/dataGenerator';
import { Timeframe } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
  onSelectTimeframe: (timeframe: Timeframe) => void;
  onSelectLayout?: (panesCount: number) => void;
  onToggleMode?: (simpleMode: boolean) => void;
  onSelectAction?: (actionId: string) => void;
  onToggleIndicator?: (indicatorKey: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectSymbol,
  onSelectTimeframe,
  onSelectLayout,
  onToggleMode,
  onSelectAction,
  onToggleIndicator,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter systems
  const filteredSymbols = POPULAR_SYMBOLS.filter((sym) => {
    const combined = `${sym.symbol} ${sym.name} ${sym.category}`.toLowerCase();
    return combined.includes(query.toLowerCase());
  }).slice(0, 10); // Limit to top 10 for better sizing

  const timeframes: { value: Timeframe; label: string }[] = [
    { value: '1s', label: '1 Second' },
    { value: '5s', label: '5 Seconds' },
    { value: '1m', label: '1 Minute' },
    { value: '5m', label: '5 Minutes' },
    { value: '10m', label: '10 Minutes' },
    { value: '15m', label: '15 Minutes' },
    { value: '30m', label: '30 Minutes' },
    { value: '1h', label: '1 Hour' },
    { value: '2h', label: '2 Hours' },
    { value: '3h', label: '3 Hours' },
    { value: '4h', label: '4 Hours' },
    { value: '1d', label: '1 Day' },
    { value: '1w', label: '1 Week' },
  ];

  const filteredTimeframes = timeframes.filter((tf) =>
    tf.label.toLowerCase().includes(query.toLowerCase()) || tf.value.toLowerCase().includes(query.toLowerCase())
  );

  // Grid Layouts
  const layouts = [
    { id: 'layout-1', label: 'Single Pane Layout (1 Chart)', panesCount: 1 },
    { id: 'layout-2', label: 'Split Screen Dual (2 Charts)', panesCount: 2 },
    { id: 'layout-4', label: 'Split Screen Quad (4 Charts)', panesCount: 4 },
    { id: 'layout-8', label: 'Split Screen Octa (8 Charts)', panesCount: 8 },
  ];

  const filteredLayouts = layouts.filter((l) =>
    l.label.toLowerCase().includes(query.toLowerCase())
  );

  // Actions
  const actions = [
    { id: 'action-settings', label: 'Open Terminal Preferences Settings' },
    { id: 'action-clear-drawings', label: 'Clear All Active Drawings on Chart' },
    { id: 'action-wipe-data', label: 'Wipe Local Cache & Reset All Settings' },
    { id: 'action-simple-mode', label: 'Switch to Simple Mode (Single-screen layout)' },
    { id: 'action-pro-mode', label: 'Switch to Pro Mode (Advanced trading terminal)' },
  ];

  const filteredActions = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase())
  );

  // Indicator Toggles
  const indicators = [
    { id: 'ind-rsi', label: 'Toggle RSI Indicator', indKey: 'rsi' },
    { id: 'ind-macd', label: 'Toggle MACD Indicator', indKey: 'macd' },
    { id: 'ind-smartSignal', label: 'Toggle AI SmartSignal Alerts', indKey: 'smartSignal' },
    { id: 'ind-volumeProfile', label: 'Toggle Volume Profile Overlay', indKey: 'volumeProfile' },
    { id: 'ind-bollingerBands', label: 'Toggle Bollinger Bands Overlay', indKey: 'bollingerBands' },
    { id: 'ind-smcOrderBlocks', label: 'Toggle Smart Money Concepts Order Blocks', indKey: 'smcOrderBlocks' },
    { id: 'ind-fvg', label: 'Toggle Fair Value Gap (FVG)', indKey: 'fvg' },
  ];

  const filteredIndicators = indicators.filter((i) =>
    i.label.toLowerCase().includes(query.toLowerCase())
  );

  const totalItems = 
    filteredSymbols.length + 
    filteredTimeframes.length + 
    filteredLayouts.length + 
    filteredActions.length + 
    filteredIndicators.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      triggerSelection(selectedIndex);
    }
  };

  const triggerSelection = (index: number) => {
    let cursor = 0;

    // 1. Symbols
    if (index >= cursor && index < cursor + filteredSymbols.length) {
      onSelectSymbol(filteredSymbols[index - cursor].symbol);
      onClose();
      return;
    }
    cursor += filteredSymbols.length;

    // 2. Timeframes
    if (index >= cursor && index < cursor + filteredTimeframes.length) {
      onSelectTimeframe(filteredTimeframes[index - cursor].value);
      onClose();
      return;
    }
    cursor += filteredTimeframes.length;

    // 3. Layouts
    if (index >= cursor && index < cursor + filteredLayouts.length) {
      if (onSelectLayout) {
        onSelectLayout(filteredLayouts[index - cursor].panesCount);
      }
      onClose();
      return;
    }
    cursor += filteredLayouts.length;

    // 4. Actions
    if (index >= cursor && index < cursor + filteredActions.length) {
      const act = filteredActions[index - cursor];
      if (act.id === 'action-simple-mode' && onToggleMode) {
        onToggleMode(true);
      } else if (act.id === 'action-pro-mode' && onToggleMode) {
        onToggleMode(false);
      } else if (onSelectAction) {
        onSelectAction(act.id);
      }
      onClose();
      return;
    }
    cursor += filteredActions.length;

    // 5. Indicators
    if (index >= cursor && index < cursor + filteredIndicators.length) {
      if (onToggleIndicator) {
        onToggleIndicator(filteredIndicators[index - cursor].indKey);
      }
      onClose();
      return;
    }
  };

  return (
    <div id="command-palette-wrapper" className="fixed inset-0 bg-black/75 z-55 flex items-start justify-center p-4 sm:p-10 backdrop-blur-xs">
      <div 
        className="bg-[#171b26] border border-[#2a2e39] w-full max-w-xl rounded-xl shadow-2xl overflow-hidden mt-10 md:mt-20 flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Search header bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#2a2e39]">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search tickers, timeframes, indicators, or actions (e.g. BTC, Simple Mode, RSI)..."
            className="bg-transparent w-full text-sm outline-none border-none text-gray-100 placeholder-gray-500"
          />
          <kbd className="hidden sm:block text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700 font-mono">
            ESC
          </kbd>
          <button onClick={onClose} className="p-0.5 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results items scrolling view */}
        <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2 space-y-1 divide-y divide-[#202431]/20">
          {totalItems === 0 ? (
            <div className="p-6 text-center text-gray-500 text-xs">No matching commands, symbols, or settings found.</div>
          ) : (
            <>
              {/* Symbols */}
              {filteredSymbols.length > 0 && (
                <div className="py-1">
                  <div className="text-[9px] text-blue-400 uppercase font-mono px-3 py-1 tracking-wider font-bold">TICKER SYMBOLS</div>
                  {filteredSymbols.map((sym, idx) => {
                    const isSel = idx === selectedIndex;
                    return (
                      <button
                        key={`sym-${sym.symbol}`}
                        onClick={() => {
                          onSelectSymbol(sym.symbol);
                          onClose();
                        }}
                        className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isSel ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Globe className={`w-3.5 h-3.5 ${isSel ? 'text-white' : 'text-blue-400'}`} />
                          <div>
                            <span className="font-bold tracking-wide">{sym.symbol}</span>
                            <span className={`mx-2 text-[10px] ${isSel ? 'text-blue-100' : 'text-gray-400'}`}>{sym.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${isSel ? 'bg-blue-700 text-white' : 'bg-gray-850 text-gray-400'}`}>
                            {sym.category}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Timeframes */}
              {filteredTimeframes.length > 0 && (
                <div className="py-1">
                  <div className="text-[9px] text-amber-400 uppercase font-mono px-3 py-1 tracking-wider font-bold">TIMEFRAME PRESETS</div>
                  {filteredTimeframes.map((tf, idx) => {
                    const correctedIdx = idx + filteredSymbols.length;
                    const isSel = correctedIdx === selectedIndex;
                    return (
                      <button
                        key={`tf-${tf.value}`}
                        onClick={() => {
                          onSelectTimeframe(tf.value);
                          onClose();
                        }}
                        className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isSel ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Clock className={`w-3.5 h-3.5 ${isSel ? 'text-white' : 'text-amber-400'}`} />
                          <span className="font-bold tracking-wide">{tf.value}</span>
                          <span className={`text-[10px] ${isSel ? 'text-blue-100' : 'text-gray-400'}`}>{tf.label}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Layouts */}
              {filteredLayouts.length > 0 && (
                <div className="py-1">
                  <div className="text-[9px] text-emerald-400 uppercase font-mono px-3 py-1 tracking-wider font-bold">GRID LAYOUTS</div>
                  {filteredLayouts.map((layout, idx) => {
                    const correctedIdx = idx + filteredSymbols.length + filteredTimeframes.length;
                    const isSel = correctedIdx === selectedIndex;
                    return (
                      <button
                        key={layout.id}
                        onClick={() => {
                          if (onSelectLayout) onSelectLayout(layout.panesCount);
                          onClose();
                        }}
                        className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isSel ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <LayoutGrid className={`w-3.5 h-3.5 ${isSel ? 'text-white' : 'text-emerald-400'}`} />
                          <span className="font-medium">{layout.label}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              {filteredActions.length > 0 && (
                <div className="py-1">
                  <div className="text-[9px] text-purple-400 uppercase font-mono px-3 py-1 tracking-wider font-bold">TERMINAL ACTIONS</div>
                  {filteredActions.map((action, idx) => {
                    const correctedIdx = idx + filteredSymbols.length + filteredTimeframes.length + filteredLayouts.length;
                    const isSel = correctedIdx === selectedIndex;
                    return (
                      <button
                        key={action.id}
                        onClick={() => {
                          if (action.id === 'action-simple-mode' && onToggleMode) {
                            onToggleMode(true);
                          } else if (action.id === 'action-pro-mode' && onToggleMode) {
                            onToggleMode(false);
                          } else if (onSelectAction) {
                            onSelectAction(action.id);
                          }
                          onClose();
                        }}
                        className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isSel ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Play className={`w-3.5 h-3.5 ${isSel ? 'text-white' : 'text-purple-400'}`} />
                          <span className="font-medium">{action.label}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Indicators */}
              {filteredIndicators.length > 0 && (
                <div className="py-1">
                  <div className="text-[9px] text-cyan-400 uppercase font-mono px-3 py-1 tracking-wider font-bold">INDICATOR TOGGLES</div>
                  {filteredIndicators.map((indicator, idx) => {
                    const correctedIdx = idx + filteredSymbols.length + filteredTimeframes.length + filteredLayouts.length + filteredActions.length;
                    const isSel = correctedIdx === selectedIndex;
                    return (
                      <button
                        key={indicator.id}
                        onClick={() => {
                          if (onToggleIndicator) onToggleIndicator(indicator.indKey);
                          onClose();
                        }}
                        className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isSel ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Sliders className={`w-3.5 h-3.5 ${isSel ? 'text-white' : 'text-cyan-400'}`} />
                          <span className="font-medium">{indicator.label}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Help footer */}
        <div className="bg-[#131722] border-t border-[#2a2e39] px-4 py-2 flex items-center justify-between text-[10px] text-gray-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>ENTER to select</span>
          </div>
          <span>Total items: {totalItems}</span>
        </div>
      </div>
    </div>
  );
};
