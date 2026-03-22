import { MessageSquare, X } from 'lucide-react';
import { useLayout } from '../../context/LayoutContext';

/**
 * Slide-in assistant column between the sidebar and main content.
 * Width is controlled by the parent shell (0 when closed).
 */
export function ChatPanel() {
  const { chatPanelOpen, closeChatPanel } = useLayout();

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
            <MessageSquare
              className="h-5 w-5 shrink-0 text-blue-600"
              strokeWidth={1.75}
              aria-hidden
            />
            <h2 className="truncate text-sm font-semibold text-slate-800">Chat</h2>
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
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Ask questions about this clinical summary. Full chat with your document context will be
            available here soon.
          </p>
        </div>
      </div>
    </aside>
  );
}
