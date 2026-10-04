import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { FileText } from 'lucide-react';
import { Message, Source } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: Message[];
  loading: boolean;
}

export function MessageList({ messages, loading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <p className="text-text-muted text-sm">Start the conversation.</p>
          <p className="text-text-dim text-xs mt-1">Upload an image or type your question.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-4">
      {messages.map((msg, i) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: i === messages.length - 1 ? 0 : 0 }}
          className={cn('flex w-full', msg.role === 'user' ? 'justify-end' : 'justify-start')}
        >
          <div
            className={cn(
              'min-w-0 max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 break-words',
              msg.role === 'user'
                ? 'bg-primary/20 text-text-primary rounded-br-sm'
                : 'bg-surface-2 text-text-primary rounded-bl-sm border border-border'
            )}
          >
            {msg.image_path && (
              <img
                src={`/api/uploads/${msg.image_path}`}
                alt="Uploaded"
                className="rounded-xl mb-2 max-h-64 w-auto object-contain"
              />
            )}
            <div className={cn('text-sm leading-relaxed', msg.role === 'assistant' && 'prose prose-sm max-w-none')}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
            {msg.role === 'assistant' && <SourceChips sources={msg.sources} />}
          </div>
        </motion.div>
      ))}

      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
          <div className="bg-surface-2 border border-border rounded-2xl rounded-bl-sm px-4 py-3">
            <ThinkingDots />
          </div>
        </motion.div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

/**
 * Which of the user's documents fed this answer. A file can contribute several
 * excerpts, so chips are collapsed to one per document.
 */
function SourceChips({ sources }: { sources?: Source[] | null }) {
  if (!sources || sources.length === 0) return null;

  const byFile = new Map<string, { source: Source; headings: string[] }>();
  for (const source of sources) {
    const entry = byFile.get(source.file_id) ?? { source, headings: [] };
    if (source.heading && !entry.headings.includes(source.heading)) {
      entry.headings.push(source.heading);
    }
    byFile.set(source.file_id, entry);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-border">
      <span className="text-[11px] text-text-dim mr-0.5">Sources</span>
      {[...byFile.values()].map(({ source, headings }) => (
        <span
          key={source.file_id}
          title={[source.file_name, ...headings].join('\n')}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border',
            source.kind === 'retrieved'
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-border bg-surface text-text-muted'
          )}
        >
          <FileText size={10} />
          {source.title ?? source.file_name}
          {headings.length > 0 && (
            <span className="opacity-60">· {headings.length} section{headings.length > 1 ? 's' : ''}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center h-5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-text-muted"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}
