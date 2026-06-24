import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Bell,
  Sunrise,
  Moon,
  Sparkles,
  ShieldCheck,
  Heart,
  Palette,
  LogOut,
  Check,
  Download,
  Trash2,
  BellRing,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth, refreshProfile, signOut, useAuth } from "@/lib/auth";
import { notify } from "@/lib/feedback";
import { applyTheme, type ThemeName } from "@/lib/theme";
import {
  notificationPermission,
  requestNotificationPermission,
  scheduleReminders,
} from "@/lib/reminders";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · METABYX" }] }),
  component: () => (
    <RequireAuth>
      <SettingsPage />
    </RequireAuth>
  ),
});

type Prefs = {
  morningReminder: boolean;
  eveningReminder: boolean;
  morningTime: string;
  eveningTime: string;
  aiModel: "google/gemini-3-flash-preview" | "google/gemini-2.5-flash" | "openai/gpt-5-mini";
  theme: "dusk" | "indigo" | "rose";
  notifications: boolean;
};

const DEFAULTS: Prefs = {
  morningReminder: true,
  eveningReminder: true,
  morningTime: "08:00",
  eveningTime: "21:00",
  aiModel: "google/gemini-3-flash-preview",
  theme: "dusk",
  notifications: true,
};

function SettingsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );

  useEffect(() => {
    setPermission(notificationPermission());
  }, []);

  useEffect(() => {
    if (auth.profile?.preferences) {
      const merged = { ...DEFAULTS, ...(auth.profile.preferences as Partial<Prefs>) };
      setPrefs(merged);
      applyTheme(merged.theme as ThemeName);
      scheduleReminders(merged);
    }
  }, [auth.profile]);

  const update = async (next: Partial<Prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    if (next.theme) applyTheme(next.theme as ThemeName);
    scheduleReminders(merged);
    if (!auth.user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ preferences: merged })
        .eq("user_id", auth.user.id);
      if (error) throw error;
      await refreshProfile();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    } catch (err) {
      notify.error("Couldn't save", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const enableNotifications = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      await update({ notifications: true });
      notify.saved("Notifications on", "We'll nudge you gently, twice a day at most.");
    } else if (result === "denied") {
      notify.error(
        "Notifications blocked",
        "Enable them in your browser settings to receive reminders.",
      );
    }
  };

  const exportDeviceData = () => {
    try {
      const raw = window.localStorage.getItem("metabyx:v1") ?? "{}";
      const payload = {
        app: "metabyx",
        version: 1,
        exportedAt: new Date().toISOString(),
        ...JSON.parse(raw),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `metabyx-library-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify.saved("Export ready", "Your device data was downloaded as JSON.");
    } catch (err) {
      notify.error("Couldn't export", err instanceof Error ? err.message : "Please try again.");
    }
  };

  const deleteDeviceData = () => {
    if (typeof window === "undefined") return;
    const confirmed = window.confirm(
      "Delete all branches and BMR history on this device? This cannot be undone.",
    );
    if (!confirmed) return;
    try {
      window.localStorage.removeItem("metabyx:v1");
      window.dispatchEvent(new Event("metabyx:change"));
      notify.saved("Cleared", "All on-device data has been deleted.");
    } catch (err) {
      notify.error("Couldn't delete", err instanceof Error ? err.message : "Please try again.");
    }
  };

  return (
    <PhoneFrame hideTabBar>
      <StatusBar title="SETTINGS" />
      <header className="flex items-center justify-between">
        <Link
          to="/profile"
          className="glass flex h-9 w-9 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1
          className="text-xl font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Preferences
        </h1>
        <span
          className={`text-[10px] uppercase tracking-[0.2em] transition-opacity ${savedFlash ? "text-gold opacity-100" : "opacity-0"}`}
        >
          saved
        </span>
      </header>

      <Section icon={Bell} title="Daily reminders">
        <Toggle
          icon={Sunrise}
          label="Morning check-in"
          hint={prefs.morningTime}
          value={prefs.morningReminder}
          onChange={(v) => update({ morningReminder: v })}
        />
        <TimeRow
          label="Morning time"
          value={prefs.morningTime}
          onChange={(v) => update({ morningTime: v })}
          disabled={!prefs.morningReminder}
        />
        <Toggle
          icon={Moon}
          label="Evening integration"
          hint={prefs.eveningTime}
          value={prefs.eveningReminder}
          onChange={(v) => update({ eveningReminder: v })}
        />
        <TimeRow
          label="Evening time"
          value={prefs.eveningTime}
          onChange={(v) => update({ eveningTime: v })}
          disabled={!prefs.eveningReminder}
        />
      </Section>

      <Section icon={Sparkles} title="AI refinement">
        <RadioGroup
          value={prefs.aiModel}
          onChange={(v) => update({ aiModel: v as Prefs["aiModel"] })}
          options={[
            { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", hint: "Default · fast & warm" },
            { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Steady, balanced" },
            { value: "openai/gpt-5-mini", label: "GPT-5 mini", hint: "Crisper reflections" },
          ]}
        />
      </Section>

      <Section icon={Palette} title="Appearance">
        <RadioGroup
          value={prefs.theme}
          onChange={(v) => update({ theme: v as Prefs["theme"] })}
          options={[
            { value: "dusk", label: "Dusk", hint: "Default · gold on indigo" },
            { value: "indigo", label: "Indigo", hint: "Deeper night tones" },
            { value: "rose", label: "Rose", hint: "Warmer, softer" },
          ]}
        />
      </Section>

      <Section icon={Bell} title="Notifications">
        <Toggle
          icon={Bell}
          label="Allow gentle nudges"
          hint="Twice a day at most"
          value={prefs.notifications}
          onChange={(v) => update({ notifications: v })}
        />
        {permission !== "granted" && permission !== "unsupported" && (
          <button
            onClick={enableNotifications}
            className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-foreground transition-all hover:bg-[oklch(1_0_0/0.06)]"
          >
            <BellRing className="h-4 w-4 text-gold" />
            {permission === "denied" ? "Notifications blocked" : "Enable device notifications"}
          </button>
        )}
        {permission === "granted" && (
          <p className="px-1 text-[10px] uppercase tracking-[0.3em] text-gold">
            device notifications · enabled
          </p>
        )}
        {permission === "unsupported" && (
          <p className="px-1 text-[11px] text-muted-foreground">
            This browser doesn't support notifications. Reminders will appear as in-app toasts.
          </p>
        )}
      </Section>

      <Section icon={ShieldCheck} title="Privacy">
        <div className="glass rounded-2xl px-4 py-3">
          <p className="text-sm text-foreground">What lives where</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>
              <span className="text-gold">On this device</span> · branches, reflections,
              BMR history, emotion log
            </li>
            <li>
              <span className="text-gold">In your account</span> · display name, archetype,
              baseline BMR, preferences
            </li>
          </ul>
        </div>
        <button
          onClick={exportDeviceData}
          className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all hover:bg-[oklch(1_0_0/0.06)]"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{
              background: "oklch(0.82 0.14 82 / 0.12)",
              border: "1px solid oklch(0.82 0.14 82 / 0.22)",
            }}
          >
            <Download className="h-4 w-4 text-gold" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Export device data</p>
            <p className="text-xs text-muted-foreground">Download a JSON snapshot</p>
          </div>
        </button>
        <button
          onClick={deleteDeviceData}
          className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all hover:bg-[oklch(1_0_0/0.06)]"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{
              background: "oklch(0.62 0.2 27 / 0.12)",
              border: "1px solid oklch(0.62 0.2 27 / 0.28)",
            }}
          >
            <Trash2 className="h-4 w-4" style={{ color: "oklch(0.78 0.16 27)" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Delete device data</p>
            <p className="text-xs text-muted-foreground">
              Clears branches & BMR history on this device
            </p>
          </div>
        </button>
      </Section>

      <Section icon={Heart} title="About">
        <div className="glass rounded-2xl px-4 py-3">
          <p className="text-sm text-foreground">METABYX v1.0</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Made with care · narrative metabolism for everyday life.
          </p>
        </div>
      </Section>

      <button
        onClick={async () => {
          await signOut();
          navigate({ to: "/auth" });
        }}
        className="glass mt-2 flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:bg-[oklch(1_0_0/0.06)]"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>

      {saving && (
        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          syncing…
        </p>
      )}
    </PhoneFrame>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-gold" />
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{title}</p>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Toggle({
  icon: Icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all hover:bg-[oklch(1_0_0/0.06)]"
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{
          background: "oklch(0.82 0.14 82 / 0.12)",
          border: "1px solid oklch(0.82 0.14 82 / 0.22)",
        }}
      >
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <span
        className="relative h-6 w-10 rounded-full transition-colors"
        style={{
          background: value ? "oklch(0.82 0.14 82 / 0.6)" : "oklch(1 0 0 / 0.1)",
        }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform"
          style={{ transform: value ? "translateX(18px)" : "translateX(2px)" }}
        />
      </span>
    </button>
  );
}

function TimeRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`glass flex items-center justify-between rounded-2xl px-4 py-3 ${disabled ? "opacity-50" : ""}`}
    >
      <span className="text-sm text-foreground">{label}</span>
      <input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg bg-transparent px-2 py-1 text-sm text-gold outline-none"
      />
    </div>
  );
}

function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all hover:bg-[oklch(1_0_0/0.06)]"
            style={{
              border: active ? "1px solid oklch(0.82 0.14 82 / 0.4)" : undefined,
            }}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full"
              style={{
                background: active ? "var(--gradient-gold)" : "oklch(1 0 0 / 0.08)",
              }}
            >
              {active && <Check className="h-3 w-3 text-background" />}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.hint}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}