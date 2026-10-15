import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  collapsed: boolean;
  toggleCollapsed: () => void;
  watchInterval: number;
  setWatchInterval: (s: number) => void;
  notifyEnabled: boolean;
  setNotifyEnabled: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      watchInterval: 3,
      setWatchInterval: (s) => set({ watchInterval: s }),
      notifyEnabled: false,
      setNotifyEnabled: (v) => set({ notifyEnabled: v }),
    }),
    { name: "smartinvest-app" }
  )
);

export const useTheme = () => "dark";
