import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

type Props = {
  rowKey: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  canMutate: boolean;
  onView: () => void;
  onOpenDocument: () => void;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function HistoryRowActions({
  rowKey,
  isOpen,
  onOpenChange,
  canMutate,
  onView,
  onOpenDocument,
  onShare,
  onRename,
  onDelete
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (!isOpen || !wrapRef.current) return;
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onOpenChange]);

  const menu = isOpen && (
    <div
      ref={menuRef}
      className="fixed z-[300] min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      style={{ top: menuPos.top, right: menuPos.right }}
      role="menu"
      aria-label={`Actions for row ${rowKey}`}
    >
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
        onClick={() => {
          onView();
          onOpenChange(false);
        }}
      >
        View Summary
      </button>
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
        onClick={() => {
          onOpenDocument();
          onOpenChange(false);
        }}
      >
        Open Document
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!canMutate}
        title={canMutate ? undefined : 'Only analyses you own can be shared.'}
        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        onClick={() => {
          if (!canMutate) return;
          onShare();
          onOpenChange(false);
        }}
      >
        Share
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!canMutate}
        title={
          canMutate
            ? undefined
            : 'Only your saved analyses can be renamed. Shared items use the owner’s name.'
        }
        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        onClick={() => {
          if (!canMutate) return;
          onRename();
          onOpenChange(false);
        }}
      >
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!canMutate}
        title={
          canMutate
            ? undefined
            : 'Only your saved analyses can be removed from this list.'
        }
        className="w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
        onClick={() => {
          if (!canMutate) return;
          onDelete();
          onOpenChange(false);
        }}
      >
        Delete
      </button>
    </div>
  );

  return (
    <div className="relative inline-flex justify-end" ref={wrapRef}>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Row actions"
        onClick={() => onOpenChange(!isOpen)}
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
