import { useState, useEffect, useCallback, useRef } from "react";
import { Menu } from "lucide-react";
import { MotionConfig } from "framer-motion";
import { Sidebar } from "@/components/chat/Sidebar";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { UsageNotice } from "@/components/chat/UsageNotice";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError, Conversation, Message, UsageStatus } from "@/lib/api";
import { useNavigate } from "react-router-dom";

/** Shares of the allowance that earn a warning, highest first. */
const USAGE_WARNINGS = [0.8, 0.5];

export default function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [starters, setStarters] = useState<string[]>([]);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [usageWarning, setUsageWarning] = useState<number | null>(null);
  const usageRef = useRef<UsageStatus | null>(null);

  // Only chat spends the allowance, so each warning comes once: on the reply
  // that crosses it, compared with what was loaded before.
  const refreshUsage = useCallback(() => {
    api.conversations
      .usage()
      .then((next) => {
        const prev = usageRef.current;
        usageRef.current = next;
        setUsage(next);
        const crossed = USAGE_WARNINGS.find((share) => prev && prev.used < share && next.used >= share);
        if (crossed) setUsageWarning(crossed);
      })
      .catch(console.error);
  }, []);

  // A new random few each time the empty screen comes up.
  const refreshStarters = useCallback(() => {
    api.conversations
      .starters()
      .then((s) => setStarters(s.questions))
      .catch(console.error);
  }, []);

  useEffect(() => {
    api.conversations.list().then(setConversations).catch(console.error);
    refreshStarters();
    refreshUsage();
  }, [refreshStarters, refreshUsage]);

  const loadConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setMessages([]);
    const msgs = await api.conversations.messages(id);
    setMessages(msgs);
  }, []);

  const handleNew = async () => {
    const conv = await api.conversations.create();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setMessages([]);
    refreshStarters();
  };

  const handleDelete = async (id: string) => {
    await api.conversations.delete(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      refreshStarters();
    }
  };

  const handleSend = async (
    content: string,
    image?: File,
    attachment?: File,
  ) => {
    let convId = activeId;
    if (!convId) {
      const conv = await api.conversations.create();
      setConversations((prev) => [conv, ...prev]);
      convId = conv.id;
      setActiveId(conv.id);
    }

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      image_path: image ? URL.createObjectURL(image) : null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setAiLoading(true);

    try {
      const reply = await api.conversations.sendMessage(
        convId,
        content,
        image,
        attachment,
      );
      // Append rather than reload: reloading swaps the optimistic message for
      // the stored one, which remounts it and replays its entrance animation.
      // Switching conversations loads the stored versions anyway.
      setMessages((prev) => [...prev, reply]);
      // Refresh conversation list to show updated title and timestamp
      const convs = await api.conversations.list();
      setConversations(convs);
    } catch (err) {
      console.error("[chat] send failed:", err);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          // 429 is the usage limit: its message stands on its own, and sending
          // again would not help.
          content:
            err instanceof ApiError && err.status === 429
              ? err.message
              : `No answer came back: ${err instanceof Error ? err.message : String(err)}. Your message is back in the box below, so you can send it again.`,
          image_path: null,
          created_at: new Date().toISOString(),
        },
      ]);
      // Lets the input restore the draft it cleared on send.
      throw err;
    } finally {
      setAiLoading(false);
      refreshUsage();
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (!user) return null;

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        user={user}
        usage={usage}
        conversations={conversations}
        activeId={activeId}
        onSelect={loadConversation}
        onNew={handleNew}
        onDelete={handleDelete}
        onLogout={handleLogout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-text-muted hover:text-text-primary"
          >
            <Menu size={20} />
          </button>
          <p className="text-sm font-medium text-text-primary">
            {conversations.find((c) => c.id === activeId)?.title ??
              "GIA Assistant"}
          </p>
        </div>

        <MessageList
          messages={messages}
          loading={aiLoading}
          userName={user.name}
          language={user.preferred_language}
          starters={starters}
          onSuggest={(text) => handleSend(text).catch(() => {})}
        />
        <UsageNotice usage={usage} warning={usageWarning} onDismiss={() => setUsageWarning(null)} />
        <MessageInput onSend={handleSend} disabled={aiLoading} />
      </div>
    </div>
    </MotionConfig>
  );
}
