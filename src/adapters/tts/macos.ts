
import { exec } from "child_process";
import { promisify } from "util";
import { debugLog } from "../../runtime/debugLogger.ts";

const execAsync = promisify(exec);
export async function speakSystemMac(text: string, rate = 150) {
  await execAsync(`say -r ${rate} "${text.replace(/"/g, '\\"')}"`);
}

export async function playNotificationSound() {
  try {
    await execAsync("afplay /System/Library/Sounds/Funk.aiff");
    debugLog("[Sound] Played notification sound");
  } catch (e) {
    debugLog(`[Sound] Failed to play sound: ${e}`);
  }
}