import Dexie, { Table } from "dexie";

export interface OfflineMutation {
  id?: number;
  endpoint: string;
  payload: Record<string, unknown>;
  method: string;
  createdAt: number;
}

class OfflineDatabase extends Dexie {
  mutations!: Table<OfflineMutation, number>;

  constructor() {
    super("webauto-offline-db");
    this.version(1).stores({
      mutations: "++id, endpoint, createdAt",
    });
  }
}

export const offlineDb = new OfflineDatabase();
