/**
 * Daily reminders via the web Notification API. We compute the next firing
 * time for morning/evening from the user's prefs and schedule a single
 * setTimeout per slot; on fire we re-schedule for the following day. This
 * respects the toggles and times configured in Settings.
 */
import { notify } from "@/lib/feedback";

export type ReminderPrefs = {
  notifications: boolean;
  morningReminder: boolean;
  eveningReminder: boolean;
  morningTime: string; // "HH:MM"
  eveningTime: string;
};

let morningTimer: ReturnType<typeof setTimeout> | null = null;
let eveningTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Milliseconds from `now` until the next occurrence of `HH:MM` local time.
 * Exported so the Settings screen can show a human-readable "next fire" and
 * tests can verify the arming maths without touching real timers.
 */
export function nextFireAt(time: string, now: Date = new Date()): number {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  const next = new Date(now);
  next.setHours(h || 0, m || 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Human-readable "in 2h 14m" / "in 45s" for the Settings preview. */
export function formatRelative(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `in ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `in ${h}h ${rem}m` : `in ${h}h`;
}

function fireNotification(title: string, body: string) {
  if (typeof window === "undefined") return;
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico", tag: title });
      return;
    } catch {
      /* fall through to toast */
    }
  }
  notify.info(title, body);
}

function clearAll() {
  if (morningTimer) clearTimeout(morningTimer);
  if (eveningTimer) clearTimeout(eveningTimer);
  morningTimer = null;
  eveningTimer = null;
}

export function scheduleReminders(prefs: ReminderPrefs) {
  if (typeof window === "undefined") return;
  clearAll();
  if (!prefs.notifications) return;

  if (prefs.morningReminder) {
    const arm = () => {
      morningTimer = setTimeout(() => {
        fireNotification("Morning check-in", "A gentle moment to name what's circling.");
        arm();
      }, nextFireAt(prefs.morningTime));
    };
    arm();
  }

  if (prefs.eveningReminder) {
    const arm = () => {
      eveningTimer = setTimeout(() => {
        fireNotification("Evening integration", "Close the loops you can. Rest with the rest.");
        arm();
      }, nextFireAt(prefs.eveningTime));
    };
    arm();
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return await Notification.requestPermission();
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}