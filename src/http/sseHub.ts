import type { Response } from "express";

export class SseHub {
  clients = new Set<Response>();

  add(res: Response) {
    this.clients.add(res);
  }
  remove(res: Response) {
    this.clients.delete(res);
  }
  size() {
    return this.clients.size;
  }

  send(payload: unknown) {
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    this.clients.forEach((c) => c.write(msg));
  }

  notifyTts(text: string) {
    this.send({ type: "speak", text });
  }

  notifyWaitStatus(isWaiting: boolean) {
    this.send({ type: "waitStatus", isWaiting });
  }
}
