import type { Response } from "express";

export type SseController = {
  addClient: (res: Response) => void;
  removeClient: (res: Response) => void;
  clientCount: () => number;
};

export type SseNotifiers = {
  notifyTts: (text: string) => void;
  notifyWaitStatus: (isWaiting: boolean) => void;
};
