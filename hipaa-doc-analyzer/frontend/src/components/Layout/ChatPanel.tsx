import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, SendHorizontal, Sparkles, X } from 'lucide-react';
import { postDocumentChat, type ChatTurn } from '../../api/documentChat';
import { useLayout } from '../../context/LayoutContext';
import { assistantTextToParagraphs } from '../../utils/chatFormat';

/**
 * Slide-in assistant grounded in the stored clinical summary and de-identified document text when available (server-side).
 */
export function ChatPanel() {
  const { chatPanelOpen, closeChatPanel, chatDocument } = useLayout();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages([]);
    setInput('');
    setError(null);
  }, [chatDocument?.documentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const canSend =
    chatPanelOpen &&
    chatDocument &&
    input.trim().length > 0 &&
    !sending;

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !chatDocument || sending) return;

    const prevSnapshot = messages;
    const nextThread: ChatTurn[] = [...messages, { role: 'user', content: text }];
    setInput('');
    setError(null);
    setSending(true);
    setMessages(nextThread);

    try {
      const { reply } = await postDocumentChat({
        documentId: chatDocument.documentId,
        fileName: chatDocument.fileName,
        messages: nextThread
      });
      setMessages([...nextThread, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setMessages(prevSnapshot);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [chatDocument, input, messages, sending]);

  return (
    <aside
      className={[
        'flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-slate-200 bg-slate-50/90 transition-[width] duration-200 ease-out',
        chatPanelOpen
          ? 'w-[min(28rem,40vw)] border-r'
          : 'pointer-events-none w-0 border-0'
      ].join(' ')}
      aria-hidden={!chatPanelOpen}
    >
      <div className="flex h-full min-w-0 w-full flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles
              className="h-5 w-5 shrink-0 text-blue-600"
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-800">Chat</h2>
              {chatDocument && (
                <p className="truncate text-xs text-slate-500" title={chatDocument.fileName}>
                  {chatDocument.fileName}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={closeChatPanel}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-400"
            title="Close chat"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>

        {!chatDocument ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4" />
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {messages.map((m, i) => (
                <div
                  key={`${i}-${m.role}`}
                  className={
                    m.role === 'user'
                      ? 'ml-4 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white'
                      : 'mr-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm'
                  }
                >
                  {m.role === 'user' ? (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  ) : (
                    <div className="space-y-3">
                      {assistantTextToParagraphs(m.content).map((para, j) => (
                        <p key={j} className="leading-relaxed break-words">
                          {para}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="mr-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  Thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {error && (
              <div className="shrink-0 border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            )}

            <div className="shrink-0 border-t border-slate-200 bg-white p-3">
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask a question…"
                  rows={2}
                  disabled={sending}
                  className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60"
                  aria-label="Message"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!canSend}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <SendHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
