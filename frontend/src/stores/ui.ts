import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DirectoryRecord, TransactionType } from '../types';
interface UIState {
  aiDraft?: { amount: string; occurredAt: string; accountId?: string; categoryId?: string; merchant?: string; currency: string; draftId?: string; version?: string; note?: string; tagIds?: string[] };
  openAiDraft: (type: 'Expense' | 'Income', draft: NonNullable<UIState['aiDraft']>) => void;
  language: 'zh-CN' | 'en';
  setLanguage: (language: UIState['language']) => void;
  hidden: boolean;
  theme: 'light' | 'dark' | 'system';
  defaultAccount: string;
  entryType: TransactionType | null;
  entryAccount?: string;
  template?: DirectoryRecord;
  setTemplate: (template: DirectoryRecord) => void;
  setEntryAccount: (id: string) => void;
  toggleHidden: () => void;
  setTheme: (theme: UIState['theme']) => void;
  setDefaultAccount: (id: string) => void;
  openEntry: (type: TransactionType) => void;
  closeEntry: () => void;
}
export const useUI = create<UIState>()(
  persist(
    (set) => ({
      language: 'zh-CN',
      setLanguage: (language) => set({ language }),
      hidden: false,
      theme: 'light',
      defaultAccount: '',
      entryType: null,
      openAiDraft: (entryType, aiDraft) => set({ entryType, aiDraft, template: undefined, entryAccount: undefined }),
      setTemplate: (template) =>
        set({
          template,
          entryType: 'Expense',
          entryAccount: template.accountId,
        }),
      toggleHidden: () => set((s) => ({ hidden: !s.hidden })),
      setTheme: (theme) => set({ theme }),
      setDefaultAccount: (defaultAccount) => set({ defaultAccount }),
      openEntry: (entryType) =>
        set({ entryType, entryAccount: undefined, template: undefined, aiDraft: undefined }),
      setEntryAccount: (entryAccount) => set({ entryAccount }),
      closeEntry: () =>
        set({ entryType: null, entryAccount: undefined, template: undefined, aiDraft: undefined }),
    }),
    {
      name: 'finance-ui',
      partialize: (s) => ({
        language: s.language,
        hidden: s.hidden,
        theme: s.theme,
        defaultAccount: s.defaultAccount,
      }),
    },
  ),
);
