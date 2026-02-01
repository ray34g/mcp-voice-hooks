import { randomUUID } from "crypto";
import { debugLog } from "../runtime/debugLogger.ts";

interface Utterance {
  id: string;
  text: string;
  timestamp: Date;
  status: "pending" | "delivered" | "responded";
}

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  status?: "pending" | "delivered" | "responded"; // user only
}

export class UtteranceQueue {
  private utterances: Utterance[] = [];
  private messages: ConversationMessage[] = [];

  add(text: string, timestamp?: Date): Utterance {
    const utterance: Utterance = {
      id: randomUUID(),
      text: text.trim(),
      timestamp: timestamp ?? new Date(),
      status: "pending",
    };

    this.utterances.push(utterance);
    this.messages.push({
      id: utterance.id,
      role: "user",
      text: utterance.text,
      timestamp: utterance.timestamp,
      status: utterance.status,
    });

    debugLog(`[Queue] queued: "${utterance.text}"\t[id: ${utterance.id}]`);
    return utterance;
  }

  addAssistantMessage(text: string): ConversationMessage {
    const message: ConversationMessage = {
      id: randomUUID(),
      role: "assistant",
      text: text.trim(),
      timestamp: new Date(),
    };
    this.messages.push(message);
    debugLog(
      `[Queue] assistant message: "${message.text}"\t[id: ${message.id}]`
    );
    return message;
  }

  getRecentMessages(limit = 50): ConversationMessage[] {
    return [...this.messages]
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(-limit);
  }

  getRecent(limit = 10): Utterance[] {
    return [...this.utterances]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  markDelivered(id: string): void {
    const u = this.utterances.find((x) => x.id === id);
    if (!u) return;

    u.status = "delivered";
    debugLog(`[Queue] delivered: "${u.text}"\t[id: ${id}]`);

    const m = this.messages.find((x) => x.id === id && x.role === "user");
    if (m) m.status = "delivered";
  }

  markRespondedDelivered(): number {
    const delivered = this.utterances.filter((u) => u.status === "delivered");
    delivered.forEach((u) => {
      u.status = "responded";
      debugLog(`[Queue] marked as responded: "${u.text}"\t[id: ${u.id}]`);

      const m = this.messages.find((x) => x.id === u.id && x.role === "user");
      if (m) m.status = "responded";
    });
    return delivered.length;
  }

  deletePending(id: string): boolean {
    const u = this.utterances.find((x) => x.id === id);
    if (!u || u.status !== "pending") return false;

    this.utterances = this.utterances.filter((x) => x.id !== id);
    this.messages = this.messages.filter((x) => x.id !== id);

    debugLog(`[Queue] Deleted pending message: "${u.text}"\t[id: ${id}]`);
    return true;
  }
  
  getPendingUtterances(): Utterance[] {
    return this.utterances.filter((u) => u.status === "pending");
  }

  getDeliveredUtterances(): Utterance[] {
    return this.utterances.filter((u) => u.status === "delivered");
  }

  getPendingUtterancesOldestFirst(): Utterance[] {
    return this.getPendingUtterances()
      .slice()
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getCounts(): { total: number; pending: number; delivered: number } {
    const total = this.utterances.length;
    let pending = 0;
    let delivered = 0;
    for (const u of this.utterances) {
      if (u.status === "pending") pending++;
      else if (u.status === "delivered") delivered++;
    }
    return { total, pending, delivered };
  }
  
  dequeuePendingNewestFirst(): Array<{ id: string; text: string; timestamp: Date }> {
    const pending = this.getPendingUtterances()
      .slice()
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    pending.forEach((u) => this.markDelivered(u.id));

    return pending.map((u) => ({ id: u.id, text: u.text, timestamp: u.timestamp }));
  }

  getTotalUtterancesCount(): number {
    return this.utterances.length;
  }

  hasAnyUtterances(): boolean {
    return this.utterances.length > 0;
  }

  clear(): void {
    const count = this.utterances.length;
    this.utterances = [];
    this.messages = [];
    debugLog(`[Queue] Cleared ${count} utterances and conversation history`);
  }
}
