import { create } from "zustand";

type ConnectionState = {
  selectedConnectionId?: string;
  offlineQueueCount: number;
  setSelectedConnectionId: (id?: string) => void;
  setOfflineQueueCount: (count: number) => void;
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  selectedConnectionId: undefined,
  offlineQueueCount: 0,
  setSelectedConnectionId: (id) => set({ selectedConnectionId: id }),
  setOfflineQueueCount: (count) => set({ offlineQueueCount: count }),
}));
