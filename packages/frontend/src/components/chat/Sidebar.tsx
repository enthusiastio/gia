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
import { Conversation, User } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface SidebarProps {
  user: User;
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
    <div className="flex flex-col h-full bg-surface border-r border-border">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Dna size={16} className="text-primary" />
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
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onNew}
        >
          <MessageSquarePlus size={16} />
          New conversation
        </Button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {conversations.length === 0 && (
          <p className="text-xs text-text-dim text-center py-8">
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
                ? "bg-primary/10 text-text-primary"
                : "text-text-muted hover:bg-surface-2 hover:text-text-primary",
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.title}</p>
              <p className="text-xs text-text-dim mt-0.5">
                {formatRelativeTime(c.updated_at)}
              </p>
            </div>
            <button
              onClick={(e) => handleDelete(e, c.id)}
              disabled={deletingId === c.id}
              className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity flex-shrink-0 mt-0.5"
            >
              <Trash2 size={13} />
            </button>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1">
        {user.is_admin && (
          <a
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
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
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium flex-shrink-0">
              {user.name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary font-medium truncate">
              {user.name}
            </p>
            <p className="text-xs text-text-dim truncate">{user.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="text-text-muted hover:text-red-400 transition-colors p-1"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
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
              className="md:hidden fixed inset-0 bg-black/60 z-40"
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
