import React from 'react';

interface PriceBadgeProps {
  quality: 'LIVE' | 'DELAYED' | 'SIMULATED';
  source?: string;
  className?: string;
}

export const PriceBadge: React.FC<PriceBadgeProps> = ({ quality, source, className = '' }) => {
  const badgeStyles = {
    LIVE: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    DELAYED: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    SIMULATED: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  };

  const colors = {
    LIVE: '#10B981', // emerald-500
    DELAYED: '#F59E0B', // amber-500
    SIMULATED: '#EF4444', // red-500
  };

  return (
    <span
      id={`price-badge-${quality.toLowerCase()}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold font-mono tracking-wider rounded border uppercase shadow-sm transition-all duration-150 ${badgeStyles[quality]} ${className}`}
      style={{
        // Fallback or explicit inline style overrides to ensure the user's specific colors can render if needed
        borderColor: `${colors[quality]}33`,
      }}
    >
      <span 
        className={`w-1.5 h-1.5 rounded-full ${
          quality === 'LIVE' ? 'bg-emerald-400 animate-pulse' : 
          quality === 'DELAYED' ? 'bg-amber-400' : 'bg-rose-400'
        }`}
        style={{
          backgroundColor: colors[quality]
        }}
      />
      {source ? `${quality} • ${source}` : quality}
    </span>
  );
};
