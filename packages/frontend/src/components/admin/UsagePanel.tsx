import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api, UsageSpend, UsageSpending } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const usd = (amount: number) => `$${amount.toFixed(2)}`;

interface UsageRowProps {
  label: string;
  spend: UsageSpend;
  resetLabel: string;
  busy: boolean;
  onReset: () => void;
}

function UsageRow({ label, spend, resetLabel, busy, onReset }: UsageRowProps) {
  const percent = Math.min(Math.round((spend.spent / spend.limit) * 100), 100);
  return (
    <div className="flex items-end gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between text-xs text-text-muted">
          <span>{label}</span>
          <span className={cn(percent >= 100 && 'text-red-600 font-medium')}>
            {usd(spend.spent)} of {usd(spend.limit)} · {percent}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={cn('h-full rounded-full', percent >= 100 ? 'bg-red-600' : percent >= 80 ? 'bg-accent' : 'bg-primary-dark')}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <Button onClick={onReset} disabled={busy || spend.spent === 0} variant="ghost" size="sm">
        <RotateCcw size={13} />
        {resetLabel}
      </Button>
    </div>
  );
}

/** What a user has spent against their limits, and the reset that lets them chat again. */
export function UsagePanel({ userId }: { userId: string }) {
  const [usage, setUsage] = useState<UsageSpending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUsage(null);
    setError(null);
    api.admin.usage(userId).then(setUsage).catch((err) => setError(err instanceof Error ? err.message : 'Could not load usage'));
  }, [userId]);

  const reset = async (window: 'daily' | 'monthly') => {
    setBusy(true);
    setError(null);
    try {
      setUsage(await api.admin.resetUsage(userId, window));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset usage');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-1">Usage</h2>
      <p className="text-xs text-text-dim mb-4 leading-relaxed">
        Chat spending counted against the limits set under General. A reset sets the counter back to zero
        so the user can chat again; resetting the month also resets today.
      </p>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {usage && (
        <div className="space-y-4">
          <UsageRow label="Today" spend={usage.daily} resetLabel="Reset today" busy={busy} onReset={() => reset('daily')} />
          <UsageRow label="This month" spend={usage.monthly} resetLabel="Reset month" busy={busy} onReset={() => reset('monthly')} />
          <p className="text-[11px] text-text-dim leading-relaxed">
            Actual model cost this month: {usd(usage.month_cost)}. This includes document indexing and any
            spending that was reset, neither of which counts against the limits.
          </p>
        </div>
      )}
    </div>
  );
}
