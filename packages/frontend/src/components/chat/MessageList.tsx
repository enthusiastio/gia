import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { FileText } from 'lucide-react';
import { Message, Source } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  userName: string;
  onSuggest: (text: string) => void;
}

/** Starting points that show what GIA is for, phrased the way users ask. */
const SUGGESTIONS = [
  'What should I eat for breakfast?',
  'Summarise my latest blood test',
  'Which supplements are in my protocol?',
];

/** Optimistic messages show their local preview; stored ones come from the server. */
function imageSrc(path: string): string {
  return path.startsWith('blob:') ? path : `/api/uploads/${path}`;
}

function GiaMark() {
  return (
    <div
      aria-hidden="true"
      className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-[10px] font-semibold tracking-wide text-primary"
    >
      GIA
    </div>
  );
}

function EmptyState({ userName, onSuggest }: { userName: string; onSuggest: (text: string) => void }) {
  const firstName = userName.split(' ')[0];
  return (
    <div className="flex-1 flex items-center justify-center px-6 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md text-center"
      >
        <p className="text-xl font-medium text-text-primary text-balance">
          {firstName ? `Hi ${firstName}, what would you like to know?` : 'What would you like to know?'}
        </p>
        <p className="text-sm text-text-muted mt-2 text-balance">
          Ask about your reports, or send a photo of a menu or a food label.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {SUGGESTIONS.map((text, i) => (
            <motion.button
              key={text}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + i * 0.06 }}
              onClick={() => onSuggest(text)}
              className="w-full text-left text-sm text-text-primary px-4 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {text}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function MessageList({ messages, loading, userName, onSuggest }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return <EmptyState userName={userName} onSuggest={onSuggest} />;
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-6">
        {messages.map((msg) =>
          msg.role === 'user' ? (
            // Rises out of the input box it was just typed into.
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              style={{ transformOrigin: 'bottom right' }}
              className="flex justify-end"
            >
              <div className="min-w-0 max-w-[85%] md:max-w-[75%] rounded-2xl rounded-br-md bg-primary/20 border border-primary/20 px-4 py-2.5 break-words">
                {msg.image_path && (
                  <img src={imageSrc(msg.image_path)} alt="Uploaded" className="rounded-xl mb-2 max-h-64 w-auto object-contain" />
                )}
                <p className="text-sm leading-relaxed text-text-primary whitespace-pre-wrap">{msg.content}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex gap-3"
            >
              <GiaMark />
              <div className="min-w-0 flex-1 pt-0.5 break-words">
                <div className="prose prose-sm max-w-none text-[0.9rem] leading-7">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
                <SourceChips sources={msg.sources} />
              </div>
            </motion.div>
          )
        )}

        <AnimatePresence>
          {loading && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.25 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="flex gap-3 items-center"
            >
              <GiaMark />
              <ThinkingDots />
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>
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
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
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
