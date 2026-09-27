import { useState, useEffect, useCallback } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/chat/Sidebar";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { useAuth } from "@/hooks/useAuth";
import { api, Conversation, Message } from "@/lib/api";
import { useNavigate } from "react-router-dom";

export default function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    api.conversations.list().then(setConversations).catch(console.error);
  }, []);

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
  };

  const handleDelete = async (id: string) => {
    await api.conversations.delete(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
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
      // Reload messages to get proper IDs and any title update
      const msgs = await api.conversations.messages(convId);
      setMessages(msgs);
      // Refresh conversation list to show updated title and timestamp
      const convs = await api.conversations.list();
      setConversations(convs);
    } catch (err) {
      console.error('[chat] send failed:', err);
      console.error('[chat] type:', typeof err);
      console.error('[chat] message:', err instanceof Error ? err.message : String(err));
      console.error('[chat] stack:', err instanceof Error ? err.stack : 'n/a');
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Sorry, something went wrong. ${err instanceof Error ? err.message : String(err)}`,
          image_path: null,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        user={user}
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

        <MessageList messages={messages} loading={aiLoading} />
        <MessageInput onSend={handleSend} disabled={aiLoading} />
      </div>
    </div>
  );
}
