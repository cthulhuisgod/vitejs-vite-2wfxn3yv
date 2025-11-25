export interface Agent {
  id: string;
  name: string;
  role: string;
  icon: string;
  systemPrompt: string;
}

export interface Message {
  id?: string;
  text: string;
  sender: 'user' | 'ai';
  agentId: string;
  timestamp: number;
}

export interface ShopData {
  id: string;
  agents: Agent[];
}

export enum AppState {
  LOGIN,
  MAIN,
}