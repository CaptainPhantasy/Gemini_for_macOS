import { useEffect, useState } from 'react';
import { costLedger } from '../lib/cost-ledger';

interface CostBadgeProps {
  onClick?: () => void;
  className?: string;
}

const POLL_INTERVAL_MS = 30_000;

// Threshold defaults (USD, today). These are intentionally hardcoded for the
// initial release; a follow-up will move them into AppSettings so users can
// override green/yellow/red bands from the Cost & Usage settings pane.
const THRESHOLD_GREEN_MAX = 1;
const THRESHOLD_YELLOW_MAX = 5;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatUsd(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function bandClassesForToday(today: number): string {
  if (today < THRESHOLD_GREEN_MAX) {
    return 'text-emerald-300 ring-emerald-500/30 hover:ring-emerald-400/60';
  }
  if (today < THRESHOLD_YELLOW_MAX) {
    return 'text-amber-300 ring-amber-500/30 hover:ring-amber-400/60';
  }
  return 'text-rose-300 ring-rose-500/40 hover:ring-rose-400/70';
}

export function CostBadge({ onClick, className }: CostBadgeProps) {
  const [today, setToday] = useState<number>(0);
  const [month, setMonth] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [todayValue, monthValue, byCap] = await Promise.all([
          costLedger.todayUsd(),
          costLedger.monthUsd(),
          costLedger.byCapability(),
        ]);
        if (cancelled) return;
        setToday(todayValue);
        setMonth(monthValue);
        setBreakdown(byCap);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load cost ledger';
        setError(message);
      }
    };

    void load();
    const id = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const breakdownEntries = Object.entries(breakdown).sort(
    ([, a], [, b]) => b - a
  );

  const tooltipLines: string[] = error
    ? [`Error: ${error}`]
    : breakdownEntries.length === 0
      ? ['No usage recorded today']
      : breakdownEntries.map(
          ([capability, cost]) => `${capability}: ${formatUsd(cost)}`
        );

  const tooltipText = ['Today by capability:', ...tooltipLines].join('\n');

  const bandClasses = error
    ? 'text-zinc-400 ring-zinc-500/30'
    : bandClassesForToday(today);

  const baseClasses =
    'group relative inline-flex items-center gap-2 rounded-full bg-zinc-900/60 px-3 py-1 text-xs font-medium ring-1 transition-all duration-150 ease-out hover:bg-zinc-900/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70';

  const composed = [baseClasses, bandClasses, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltipText}
      aria-label={`Estimated Gemini spend. Today ${formatUsd(today)}. This month ${formatUsd(month)}. Click to open Cost and Usage settings.`}
      className={composed}
    >
      <span className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Today
        </span>
        <span className="tabular-nums">{formatUsd(today)}</span>
      </span>
      <span aria-hidden="true" className="text-zinc-600">
        |
      </span>
      <span className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Month
        </span>
        <span className="tabular-nums">{formatUsd(month)}</span>
      </span>
    </button>
  );
}
