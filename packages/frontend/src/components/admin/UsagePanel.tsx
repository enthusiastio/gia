import { FormEvent, useEffect, useState } from 'react';
import { CalendarPlus, Plus, X } from 'lucide-react';
import { api, UsageSpending } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const usd = (amount: number) => `$${amount.toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** What a user has spent this year, and the top-ups that let them chat again. */
export function UsagePanel({ userId }: { userId: string }) {
  const [usage, setUsage] = useState<UsageSpending | null>(null);
  const [amount, setAmount] = useState('10');
  const [confirmNewYear, setConfirmNewYear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUsage(null);
    setError(null);
    setConfirmNewYear(false);
    api.admin.usage(userId).then(setUsage).catch((err) => setError(err instanceof Error ? err.message : 'Could not load usage'));
  }, [userId]);

  const run = async (action: () => Promise<UsageSpending>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      setUsage(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const addTopup = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) { setError('A top-up must be an amount above zero'); return; }
    run(() => api.admin.addTopup(userId, value), 'Could not add the top-up');
  };

  const startNewYear = () => {
    // Two clicks: it drops this year's spending and top-ups from the count.
    if (!confirmNewYear) { setConfirmNewYear(true); return; }
    setConfirmNewYear(false);
    run(() => api.admin.startNewPeriod(userId), 'Could not start a new year');
  };

  const percent = usage ? Math.min(Math.round((usage.spent / usage.limit) * 100), 100) : 0;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-1">Usage</h2>
      <p className="text-xs text-text-dim mb-4 leading-relaxed">
        Chat spending counted against the yearly limit set under General. When the user pays for more, add a
        top-up; when they pay for a new year, start one here.
      </p>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {usage && (
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between text-xs text-text-muted">
              <span>
                {day(usage.period_start)} to {day(usage.resets_at)}
              </span>
              <span className={cn(percent >= 100 && 'text-red-600 font-medium')}>
                {usd(usage.spent)} of {usd(usage.limit)} · {percent}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className={cn('h-full rounded-full', percent >= 100 ? 'bg-red-600' : percent >= 80 ? 'bg-accent' : 'bg-primary-dark')}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="text-xs text-text-muted space-y-1">
            <div className="flex justify-between">
              <span>Yearly limit</span>
              <span>{usd(usage.base_limit)}</span>
            </div>
            {usage.topups.map((t) => (
              <div key={t.id} className="flex items-center justify-between">
                <span>Top-up, {day(t.created_at)}</span>
                <span className="flex items-center gap-1">
                  +{usd(t.amount_usd)}
                  <button
                    onClick={() => run(() => api.admin.removeTopup(userId, t.id), 'Could not remove the top-up')}
                    disabled={busy}
                    aria-label={`Remove top-up of ${usd(t.amount_usd)}`}
                    title="Remove top-up"
                    className="p-0.5 rounded text-text-dim hover:text-red-600 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={addTopup} className="flex items-center gap-2">
              <label htmlFor="topup-amount" className="text-xs text-text-muted">Add $</label>
              <input
                id="topup-amount"
                type="number"
                min="0"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-20 bg-surface-2 border border-border rounded-xl px-3 py-1.5 text-sm text-text-primary outline-none focus:border-primary/50 transition-colors"
              />
              <Button type="submit" disabled={busy} variant="ghost" size="sm">
                <Plus size={13} />
                Top up
              </Button>
            </form>
            <Button
              onClick={startNewYear}
              disabled={busy}
              variant="ghost"
              size="sm"
              className="ml-auto"
              title={
                'For when the user pays for another year. Their year restarts today and runs for 12 months: spending and top-ups from before no longer count, so they get the full yearly limit again.\n\n' +
                'Example: a user\'s year runs from 1 March. On 20 February they have $15 left and pay for another year. Click this, and their new year runs from 20 February to the next 20 February with the full limit. The $15 left over does not carry forward.'
              }
            >
              <CalendarPlus size={13} />
              {confirmNewYear ? 'Click again to start a new year' : 'Start new year today'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
