import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

const SIDEBAR_STORAGE_KEY = 'hipaa-sidebar-collapsed';

/** Active document for split-view chat (server loads summary by documentId). */
export type ChatDocumentContext = { documentId: string; fileName: string } | null;

type LayoutContextValue = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  chatPanelOpen: boolean;
  openChatPanel: () => void;
  closeChatPanel: () => void;
  chatDocument: ChatDocumentContext;
  setChatDocument: (ctx: ChatDocumentContext) => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [chatDocument, setChatDocument] = useState<ChatDocumentContext>(null);
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  const collapsedBeforeChatRef = useRef<boolean | null>(null);

  sidebarCollapsedRef.current = sidebarCollapsed;

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => !c);
  }, []);

  const openChatPanel = useCallback(() => {
    setChatPanelOpen((wasOpen) => {
      if (!wasOpen) {
        collapsedBeforeChatRef.current = sidebarCollapsedRef.current;
        setSidebarCollapsed(true);
      }
      return true;
    });
  }, []);

  const closeChatPanel = useCallback(() => {
    setChatPanelOpen(false);
    const prev = collapsedBeforeChatRef.current;
    collapsedBeforeChatRef.current = null;
    if (prev !== null) {
      setSidebarCollapsed(prev);
    }
  }, []);

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebarCollapsed,
      chatPanelOpen,
      openChatPanel,
      closeChatPanel,
      chatDocument,
      setChatDocument
    }),
    [
      sidebarCollapsed,
      chatPanelOpen,
      chatDocument,
      toggleSidebarCollapsed,
      openChatPanel,
      closeChatPanel
    ]
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) {
    throw new Error('useLayout must be used within LayoutProvider');
  }
  return ctx;
}
