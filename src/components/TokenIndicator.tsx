import React, { useEffect, useState } from "react";
import { ServerCrash } from "lucide-react";

interface TokenStats {
  used: number;
  budget: number;
  prompt: number;
  output: number;
}

export default function TokenIndicator() {
  const [stats, setStats] = useState<TokenStats | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/tokens");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Failed to fetch token stats", e);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 8000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  const percentage = Math.min(100, Math.round((stats.used / stats.budget) * 100));
  const isClose = percentage > 85;

  // Circle properties for circular gauge
  const radius = 27;
  const circumference = 2 * Math.PI * radius; // ~169.6
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const formatTokens = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  };

  return (
    <div className="bg-white/55 backdrop-blur-md border border-white/90 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[12.5px] uppercase tracking-[0.09em] font-bold text-[#5B5570]">AI Research Capacity</h2>
        <span className="text-[11px] text-[#8B85A0] font-semibold">{percentage}%</span>
      </div>

      <div className="flex items-center gap-4">
        <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="var(--bg-canvas-2)"
            strokeWidth="7"
          />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={isClose ? "var(--garnet)" : "var(--teal)"}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 32 32)"
            className="transition-all duration-500 ease-out"
          />
        </svg>

        <div className="flex-1 min-w-0">
          <div className="font-sans text-[15px] font-semibold text-[#241F33] leading-none">
            {formatTokens(stats.used)}
            <small className="block font-sans text-[10.5px] font-semibold text-[#8B85A0] tracking-[0.03em] uppercase mt-1">
              of {formatTokens(stats.budget)} units
            </small>
          </div>
          <div className="text-[10px] text-[#8B85A0] mt-1.5 leading-relaxed font-mono">
            Analyzed: {formatTokens(stats.prompt)} | Generated: {formatTokens(stats.output)}
          </div>
        </div>
      </div>

      {isClose && (
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-red-600 leading-tight">
          <ServerCrash className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Approaching limits. Future calls may be throttled.</span>
        </div>
      )}
    </div>
  );
}
