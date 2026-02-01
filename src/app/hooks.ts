// src/hooks/hooks.ts
import { debugLog } from "../runtime/debugLogger.ts";
import type { UtteranceQueue } from "../core/queue.ts";
import type { VoicePreferences } from "../core/voice.ts";
import { getVoiceResponseReminder } from "./messages/voice.ts";
import { playNotificationSound as defaultPlayNotificationSound } from "../adapters/tts/macos.ts";
import { config } from "../runtime/config.ts";

export function dequeueUtterancesCore(queue: UtteranceQueue) {
  const utterances = queue.dequeuePendingNewestFirst();
  return {
    success: true,
    utterances: utterances.map(({ text, timestamp }) => ({ text, timestamp })),
  };
}

export async function waitForUtteranceCore(args: {
  queue: UtteranceQueue;
  prefs: VoicePreferences;
  notifyWaitStatus: (isWaiting: boolean) => void;
  playNotificationSound?: () => Promise<void>;
  sleepMs?: number; // for testing
}) {
  const {
    queue,
    prefs,
    notifyWaitStatus,
    playNotificationSound,
    sleepMs,
  } = args;

  if (!prefs.voiceInputActive) {
    return {
      success: false,
      error:
        "Voice input is not active. Cannot wait for utterances when voice input is disabled.",
    };
  }
  
  const maxWaitMs = config.timeouts.waitSeconds * 1000;
  const startTime = Date.now();
  debugLog(
    `[WaitCore] Starting wait_for_utterance (${config.timeouts.waitSeconds}s)`
  );

  notifyWaitStatus(true);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const doPlaySound = playNotificationSound ?? defaultPlayNotificationSound;
  const pollMs = sleepMs ?? 100;

  let firstTime = true;

  while (Date.now() - startTime < maxWaitMs) {
    if (!prefs.voiceInputActive) {
      debugLog("[WaitCore] Voice input deactivated during wait_for_utterance");
      notifyWaitStatus(false);
      return {
        success: true,
        utterances: [],
        message: "Voice input was deactivated",
        waitTime: Date.now() - startTime,
      };
    }

    const pending = queue.getPendingUtterances();
    if (pending.length > 0) {
      const sortedOldestFirst = queue.getPendingUtterancesOldestFirst();
      sortedOldestFirst.forEach((u) => queue.markDelivered(u.id));

      notifyWaitStatus(false);
      return {
        success: true,
        utterances: sortedOldestFirst.map((u) => ({
          id: u.id,
          text: u.text,
          timestamp: u.timestamp,
          status: "delivered" as const,
        })),
        count: pending.length,
        waitTime: Date.now() - startTime,
      };
    }

    if (firstTime) {
      firstTime = false;
      try {
        await doPlaySound();
      } catch (e) {
        debugLog(`[WaitCore] Failed to play notification sound: ${e}`);
      }
    }

    await sleep(pollMs);
  }

  notifyWaitStatus(false);
  return {
    success: true,
    utterances: [],
    message: `No utterances found after waiting ${config.timeouts.waitSeconds} seconds.`,
    waitTime: maxWaitMs,
  };
}

export function validateAction(args: {
  action: unknown;
  queue: UtteranceQueue;
  prefs: VoicePreferences;
}) {
  const { action, queue, prefs } = args;

  if (!action || !["tool-use", "stop"].includes(String(action))) {
    return {
      status: 400 as const,
      body: { error: 'Invalid action. Must be "tool-use" or "stop"' },
    };
  }

  if (prefs.voiceInputActive) {
    const pending = queue.getPendingUtterances();
    if (pending.length > 0) {
      return {
        status: 200 as const,
        body: {
          allowed: false,
          requiredAction: "dequeue_utterances",
          reason: `${pending.length} pending utterance(s) must be dequeued first. Please use dequeue_utterances to process them.`,
        },
      };
    }
  }

  if (prefs.voiceResponsesEnabled) {
    const delivered = queue.getDeliveredUtterances();
    if (delivered.length > 0) {
      return {
        status: 200 as const,
        body: {
          allowed: false,
          requiredAction: "speak",
          reason: `${delivered.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`,
        },
      };
    }
  }

  if (String(action) === "stop" && prefs.voiceInputActive) {
    if (queue.getCounts().total > 0) {
      return {
        status: 200 as const,
        body: {
          allowed: false,
          requiredAction: "wait_for_utterance",
          reason:
            "Assistant tried to end its response. Stopping is not allowed without first checking for voice input. Assistant should now use wait_for_utterance to check for voice input",
        },
      };
    }
  }

  return { status: 200 as const, body: { allowed: true } };
}

function formatVoiceUtterances(
  utterances: Array<{ text: string }>,
  prefs: VoicePreferences
) {
  const utteranceTexts = utterances.map((u) => `"${u.text}"`).join("\n");
  return `Assistant received voice input from the user (${utterances.length} utterance${
    utterances.length !== 1 ? "s" : ""
  }):\n\n${utteranceTexts}${getVoiceResponseReminder(prefs)}`;
}

export function createHookHandler(args: {
  queue: UtteranceQueue;
  prefs: VoicePreferences;

  notifyWaitStatus: (isWaiting: boolean) => void;

  // 任意（テストや環境差分のため）
  playNotificationSound?: () => Promise<void>;
  sleepMs?: number;

  getLastToolUseTimestamp: () => Date | null;
  getLastSpeakTimestamp: () => Date | null;
  setLastToolUseTimestamp: (d: Date) => void;
}) {
  const {
    queue,
    prefs,
    notifyWaitStatus,
    playNotificationSound,
    sleepMs,
    getLastToolUseTimestamp,
    getLastSpeakTimestamp,
    setLastToolUseTimestamp,
  } = args;

  return function handleHookRequest(
    attemptedAction: "tool" | "speak" | "stop" | "post-tool"
  ):
    | { decision: "approve" | "block"; reason?: string }
    | Promise<{ decision: "approve" | "block"; reason?: string }> {
    // 1) pending は常に dequeue（typed/voice 両対応）
    const pending = queue.getPendingUtterances();
    if (pending.length > 0) {
      const dequeueResult = dequeueUtterancesCore(queue);
      if (dequeueResult.utterances?.length) {
        const reversedOldestFirst = [...dequeueResult.utterances].reverse();
        return {
          decision: "block",
          reason: formatVoiceUtterances(reversedOldestFirst as any, prefs),
        };
      }
    }

    // 2) voice enabled 時、delivered があるなら speak 以外ブロック
    if (prefs.voiceResponsesEnabled) {
      const delivered = queue.getDeliveredUtterances();
      if (delivered.length > 0) {
        if (attemptedAction === "speak") return { decision: "approve" };
        return {
          decision: "block",
          reason: `${delivered.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`,
        };
      }
    }

    // 3) tool/post-tool
    if (attemptedAction === "tool" || attemptedAction === "post-tool") {
      setLastToolUseTimestamp(new Date());
      return { decision: "approve" };
    }

    // 4) speak は許可
    if (attemptedAction === "speak") return { decision: "approve" };

    // 5) stop
    if (attemptedAction === "stop") {
      if (
        prefs.voiceResponsesEnabled &&
        getLastToolUseTimestamp() &&
        (!getLastSpeakTimestamp() ||
          (getLastSpeakTimestamp() as Date) <
            (getLastToolUseTimestamp() as Date))
      ) {
        return {
          decision: "block",
          reason:
            "Assistant must speak after using tools. Please use the speak tool to respond before proceeding.",
        };
      }

      if (prefs.voiceInputActive) {
        return (async () => {
          try {
            debugLog(`[Stop Hook] Auto-calling wait_for_utterance...`);

            const data = await waitForUtteranceCore({
              queue,
              prefs,
              notifyWaitStatus,
              playNotificationSound,
              sleepMs,
            });

            debugLog(
              `[Stop Hook] wait_for_utterance response: ${JSON.stringify(data)}`
            );

            if (!data.success && (data as any).error) {
              return {
                decision: "approve" as const,
                reason: (data as any).error,
              };
            }

            if ((data as any).utterances?.length) {
              return {
                decision: "block" as const,
                reason: formatVoiceUtterances((data as any).utterances, prefs),
              };
            }

            return {
              decision: "approve" as const,
              reason: (data as any).message || "No utterances found during wait",
            };
          } catch (e) {
            debugLog(`[Stop Hook] Error: ${e}`);
            return {
              decision: "approve" as const,
              reason: "Auto-wait encountered an error, proceeding",
            };
          }
        })();
      }

      return { decision: "approve", reason: "No utterances since last timeout" };
    }

    return { decision: "approve" };
  };
}
