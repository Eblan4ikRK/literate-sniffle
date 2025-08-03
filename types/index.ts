// /types/index.ts
export interface StatsData {
    requests: number;
    timestamp: number;
  }
  
  export interface StatsStore {
    increment(): Promise<void>;
    getCount(): Promise<number>;
    reset(): Promise<void>;
  }