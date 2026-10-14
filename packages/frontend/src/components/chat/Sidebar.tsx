import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquarePlus,
  Trash2,
  X,
  Dna,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Conversation, UsageStatus, UsageWindow, User } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

/** "in 5h", "in 12 days": how long until an allowance is full again. */
function formatReset(resetsAt: string): string {
  const minutes = Math.max(Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 60000), 1);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

function UsageBar({ label, window }: { label: string; window: UsageWindow }) {
  const percent = Math.round(window.used * 100);
  return (
    <div title={`Resets ${formatReset(window.resets_at)}`}>
      <div className="flex items-baseline justify-between text-[11px] text-text-muted">
        <span>{label}</span>
        <span className={cn(percent >= 100 && "text-red-600 font-medium")}>
          {percent >= 100 ? `Resets ${formatReset(window.resets_at)}` : `${percent}% used`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1 h-1 rounded-full bg-primary/15 overflow-hidden"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            percent >= 100 ? "bg-red-600" : percent >= 80 ? "bg-accent" : "bg-primary-dark",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * A labelled bar along the bottom of the sidebar, filled to whichever allowance
 * is closer to running out. Clicking it slides the details up.
 */
function UsageMeter({ usage }: { usage: UsageStatus }) {
  const [open, setOpen] = useState(false);
  const percent = Math.round(Math.max(usage.daily.used, usage.monthly.used) * 100);

  return (
    <div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-6 pt-1 pb-2 space-y-2">
              <UsageBar label="Today" window={usage.daily} />
              <UsageBar label="This month" window={usage.monthly} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Usage: ${percent}% used. ${open ? "Hide" : "Show"} details`}
        title="Usage"
        className="block w-full px-6 pt-2 pb-3 group"
      >
        <div className="flex items-baseline justify-between text-[11px] text-text-muted group-hover:text-text-primary transition-colors">
          <span>Usage</span>
          <span>{percent}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-primary/25 group-hover:bg-primary/35 overflow-hidden transition-colors">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              percent >= 100 ? "bg-red-600" : percent >= 80 ? "bg-accent" : "bg-primary-dark",
            )}
            // A sliver even at 0-1%, so the bar never looks empty.
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>
      </button>
    </div>
  );
}

interface SidebarProps {
  user: User;
  /** null until the first load; the meter simply is not drawn yet. */
  usage: UsageStatus | null;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({
  user,
  usage,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onLogout,
  open,
  onClose,
}: SidebarProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  const content = (
    <div className="flex flex-col h-full bg-background bg-gradient-to-b from-genesis-light/80 via-genesis-light/40 to-biohack-light/60 border-r border-primary/20">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-primary/20">
        <div className="w-8 h-8 rounded-xl bg-primary-dark flex items-center justify-center flex-shrink-0">
          <Dna size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-muted tracking-widest uppercase">
            SOLUT·IA LAB
          </p>
          <p className="text-sm font-semibold text-text-primary truncate">
            GIA Assistant
          </p>
        </div>
        <button
          onClick={onClose}
          className="md:hidden text-text-muted hover:text-text-primary p-1"
        >
          <X size={18} />
        </button>
      </div>

      {/* New conversation */}
      <div className="p-3">
        <Button
          className="w-full justify-start gap-2 shadow-sm"
          onClick={onNew}
        >
          <MessageSquarePlus size={16} />
          New conversation
        </Button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {conversations.length === 0 && (
          <p className="text-xs text-text-muted text-center py-8">
            No conversations yet
          </p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              onSelect(c.id);
              onClose();
            }}
            className={cn(
              "w-full text-left px-3 py-2.5 rounded-xl group flex items-start gap-2 transition-colors duration-100",
              activeId === c.id
                ? "bg-surface shadow-sm text-text-primary"
                : "text-text-muted hover:bg-surface/60 hover:text-text-primary",
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.title}</p>
              <p className="text-xs text-text-muted mt-0.5">
                {formatRelativeTime(c.updated_at)}
              </p>
            </div>
            <button
              onClick={(e) => handleDelete(e, c.id)}
              disabled={deletingId === c.id}
              className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600 transition-opacity flex-shrink-0 mt-0.5"
            >
              <Trash2 size={13} />
            </button>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-primary/20 p-3 space-y-1">
        {user.is_admin && (
          <a
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text-primary hover:bg-surface/60 transition-colors"
          >
            <Settings size={15} />
            Admin panel
            <ChevronRight size={13} className="ml-auto" />
          </a>
        )}
        <div className="flex items-center gap-3 px-3 py-2">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-7 h-7 rounded-full flex-shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-accent/30 flex items-center justify-center text-xs text-nexus-dark font-semibold flex-shrink-0">
              {user.name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary font-medium truncate">
              {user.name}
            </p>
            <p className="text-xs text-text-muted truncate">{user.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="text-text-muted hover:text-red-600 transition-colors p-1"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {usage && <UsageMeter usage={usage} />}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0 h-full">{content}</div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="md:hidden fixed inset-0 bg-deep/40 z-40"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="md:hidden fixed left-0 top-0 bottom-0 w-72 z-50"
            >
              {content}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
