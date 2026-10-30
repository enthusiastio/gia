import { X } from "lucide-react";
import { UsageStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * A line above the message box. A warning at 50% or 80% can be closed; once
 * the plan is used up or has ended it stays, since nothing can be sent.
 */
export function UsageNotice({
  usage,
  warning,
  onDismiss,
}: {
  usage: UsageStatus | null;
  /** The share just crossed, or null when there is nothing to warn about. */
  warning: number | null;
  onDismiss: () => void;
}) {
  const blocked = usage?.expired
    ? "Your plan has ended. To keep using GIA, contact us to renew it."
    : usage?.exhausted
      ? "You have used all of your plan's allowance. To keep asking questions, contact us to buy a top-up."
      : null;
  const text =
    blocked ??
    (warning !== null
      ? `You have used ${Math.round(warning * 100)}% of your plan's allowance. When it runs out, you can contact us to buy a top-up.`
      : null);
  if (!text) return null;

  return (
    <div className="px-4 pt-2">
      <div
        role="status"
        className={cn(
          "mx-auto w-full max-w-3xl flex items-start gap-2 rounded-2xl border px-4 py-2.5 text-xs leading-relaxed",
          blocked ? "border-red-600/40 bg-red-600/5 text-red-600 font-medium" : "border-accent/50 bg-accent/10 text-text-primary",
        )}
      >
        <p className="flex-1">{text}</p>
        {!blocked && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="p-0.5 rounded text-text-dim hover:text-text-primary transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
