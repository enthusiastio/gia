import { useState, useRef, KeyboardEvent } from 'react';
import { ImagePlus, Camera, ArrowUp, X, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { openGoogleDrivePicker } from '@/lib/googleDrivePicker';

function resizeImage(file: File, scale = 0.5): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(new File([blob!], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
        'image/jpeg',
        0.85,
      );
    };
    img.src = url;
  });
}

interface MessageInputProps {
  onSend: (content: string, image?: File, attachment?: File) => Promise<void>;
  disabled: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      setAttachment(null);
      const resized = await resizeImage(file);
      setImage(resized);
      const url = URL.createObjectURL(resized);
      setImagePreview(url);
    } else {
      setImage(null);
      if (imagePreview) { URL.revokeObjectURL(imagePreview); setImagePreview(null); }
      setAttachment(file);
    }
  };

  const removeImage = () => {
    setImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAttachment = () => {
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDrivePick = async () => {
    if (driveLoading || disabled) return;
    setDriveLoading(true);
    try {
      const file = await openGoogleDrivePicker();
      if (!file) return;
      if (file.type.startsWith('image/')) {
        setAttachment(null);
        const resized = await resizeImage(file);
        setImage(resized);
        const url = URL.createObjectURL(resized);
        setImagePreview(url);
      } else {
        setImage(null);
        if (imagePreview) { URL.revokeObjectURL(imagePreview); setImagePreview(null); }
        setAttachment(file);
      }
    } catch (err) {
      console.error('Drive picker error:', err);
    } finally {
      setDriveLoading(false);
    }
  };

  const resetHeight = () => {
    const el = textareaRef.current;
    if (el) el.style.height = 'auto';
  };

  // The box empties the moment a message is sent, so the user can watch it
  // land in the conversation and start typing the next one. If sending fails,
  // the draft comes back to retry.
  const handleSend = async () => {
    if ((!text.trim() && !image && !attachment) || sending || disabled) return;
    const draft = { text, image, imagePreview, attachment };
    setSending(true);
    setText('');
    setImage(null);
    setImagePreview(null);
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = '';
    resetHeight();
    try {
      await onSend(draft.text.trim(), draft.image ?? undefined, draft.attachment ?? undefined);
      if (draft.imagePreview) URL.revokeObjectURL(draft.imagePreview);
    } catch {
      setText((current) => current || draft.text);
      setImage(draft.image);
      setImagePreview(draft.imagePreview);
      setAttachment(draft.attachment);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px`; }
  };

  const canSend = (text.trim().length > 0 || image !== null || attachment !== null) && !sending && !disabled;

  return (
    <div className="bg-gradient-to-t from-background via-background to-transparent px-4 pt-2 pb-3 pb-safe">
      <div className="mx-auto w-full max-w-3xl">
      {/* Previews */}
      <AnimatePresence>
        {imagePreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2"
          >
            <div className="relative inline-block">
              <img src={imagePreview} alt="Preview" className="h-20 rounded-xl object-contain border border-border" />
              <button
                onClick={removeImage}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-surface-2 border border-border rounded-full flex items-center justify-center text-text-muted hover:text-red-400"
              >
                <X size={10} />
              </button>
            </div>
          </motion.div>
        )}
        {attachment && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-2 border border-border rounded-lg text-xs text-text-muted">
              <Paperclip size={11} />
              <span className="max-w-[200px] truncate">{attachment.name}</span>
              <button onClick={removeAttachment} className="hover:text-red-400 ml-0.5">
                <X size={10} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn(
        'flex items-end gap-2 bg-surface-2 border rounded-2xl px-3 py-2 transition-[border-color,box-shadow] duration-200',
        'border-border focus-within:border-primary/50 focus-within:shadow-[0_0_0_4px_rgba(124,109,245,0.12)]'
      )}>
        {/* Gallery */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 p-1.5 text-text-muted hover:text-primary transition-colors disabled:opacity-40 mb-0.5"
          title="Attach image from gallery"
        >
          <ImagePlus size={18} />
        </button>

        {/* Camera */}
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 p-1.5 text-text-muted hover:text-primary transition-colors disabled:opacity-40 mb-0.5"
          title="Take a photo"
        >
          <Camera size={18} />
        </button>

        {/* Google Drive */}
        <button
          onClick={handleDrivePick}
          disabled={disabled || driveLoading}
          className="flex-shrink-0 p-1.5 text-text-muted hover:text-primary transition-colors disabled:opacity-40 mb-0.5"
          title="Attach file from Google Drive"
        >
          {driveLoading ? (
            <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : (
            <svg width={18} height={18} viewBox="0 0 87.3 78" fill="currentColor" aria-hidden="true">
              <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" />
              <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 0 0 0 53h27.5z" />
              <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" />
              <path d="M43.65 25L59.4 53h27.5a9.1 9.1 0 0 0-1.2-4.5L60.95 3.3C60.15 1.9 59 .8 57.65 0z" />
              <path d="M27.5 53l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h51.8c1.6 0 3.15-.45 4.5-1.2L59.8 53z" />
              <path d="M43.65 25L57.4 0H29.9z" />
            </svg>
          )}
        </button>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageChange} />

        {/* Text area */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your health, food or reports…"
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm text-text-primary placeholder-text-dim min-h-[36px] max-h-[200px] py-1.5 leading-relaxed"
        />

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 mb-0.5',
            canSend ? 'bg-primary text-white hover:bg-primary-hover active:scale-90' : 'bg-surface text-text-dim cursor-not-allowed'
          )}
          aria-label="Send message"
        >
          <ArrowUp size={16} strokeWidth={2.25} />
        </button>
      </div>
      <p className="hidden md:block text-[11px] text-text-dim text-center mt-1.5">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  );
}
