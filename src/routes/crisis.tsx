import { RequireAuth } from "@/lib/auth";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, LifeBuoy, Phone, Sparkles } from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { VoiceInputButton } from "@/components/voice-input-button";

export const Route = createFileRoute("/crisis")({
  head: () => ({
    meta: [
      { title: "Crisis Mode · METABYX" },
      {
        name: "description",
        content:
          "A calm place for moments of strong distress: paced breathing, grounding, and a private space to speak.",
      },
    ],
  }),
  component: () => (<RequireAuth><CrisisPage /></RequireAuth>),
});

/** 4 · 7 · 8 breathing pattern (seconds), one of the gentlest paced patterns. */
const PHASES = [
  { key: "phaseIn", seconds: 4, scale: 1.0 },
  { key: "phaseHold", seconds: 7, scale: 1.0 },
  { key: "phaseOut", seconds: 8, scale: 0.55 },
] as const;

const GROUNDING_KEYS = ["g5", "g4", "g3", "g2", "g1"] as const;

function CrisisPage() {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [note, setNote] = useState("");
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      if (tickRef.current) window.clearTimeout(tickRef.current);
      tickRef.current = null;
      return;
    }
    const ms = PHASES[phaseIdx].seconds * 1000;
    tickRef.current = window.setTimeout(() => {
      const next = (phaseIdx + 1) % PHASES.length;
      setPhaseIdx(next);
      if (next === 0) setCycle((c) => c + 1);
    }, ms);
    return () => {
      if (tickRef.current) window.clearTimeout(tickRef.current);
    };
  }, [running, phaseIdx]);

  const active = PHASES[phaseIdx];

  return (
    <PhoneFrame hideTabBar>
      <StatusBar title={t("crisisFull.title")} />

      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="glass flex h-10 w-10 items-center justify-center rounded-full"
          aria-label={t("crisisFull.back")}
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <div className="flex items-center gap-2 text-gold">
          <LifeBuoy className="h-4 w-4" />
          <span className="text-[10px] uppercase tracking-[0.35em]">{t("crisisFull.safe")}</span>
        </div>
        <div className="h-10 w-10" />
      </header>

      <section className="flex flex-col items-center gap-4 pt-2">
        <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
          {t("crisisFull.cycle", { n: cycle + 1 })}
        </p>
        <div className="relative flex h-56 w-56 items-center justify-center">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full opacity-60 blur-2xl"
            style={{ background: "var(--gradient-gold)" }}
          />
          <div
            className="glass-strong relative flex h-full w-full items-center justify-center rounded-full"
            style={{
              transform: `scale(${running ? active.scale : 0.8})`,
              transition: `transform ${active.seconds}s cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            <div className="text-center">
              <p
                className="text-2xl font-light text-foreground"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                {running ? t(`crisisFull.${active.key}`) : t("crisisFull.ready")}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-gold">
                {running ? `${active.seconds}s` : t("crisisFull.pattern")}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setPhaseIdx(0);
            setRunning((r) => !r);
          }}
          className="rounded-2xl px-6 py-3 text-sm font-semibold transition-transform active:scale-[0.99]"
          style={{
            background: running
              ? "oklch(1 0 0 / 0.08)"
              : "var(--gradient-gold)",
            color: running ? "var(--foreground)" : "var(--primary-foreground)",
            boxShadow: running ? undefined : "var(--shadow-gold)",
          }}
        >
          {running ? t("crisisFull.pause") : t("crisisFull.begin")}
        </button>
      </section>

      <section className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold">{t("crisisFull.groundingEyebrow")}</p>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {GROUNDING_KEYS.map((g) => (
            <li
              key={g}
              className="text-sm leading-relaxed text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              · {t(`crisisFull.${g}`)}
            </li>
          ))}
        </ul>
      </section>

      <section className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("crisisFull.sayEyebrow")}
          </p>
          <VoiceInputButton value={note} onChange={setNote} compact />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("crisisFull.notePlaceholder")}
          rows={4}
          className="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          style={{ fontFamily: "Fraunces, serif" }}
        />
      </section>

      <a
        href="tel:116123"
        className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-foreground"
      >
        <Phone className="h-4 w-4 text-gold" />
        {t("crisisFull.helpline")}
      </a>

      <p className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
        {t("crisisFull.footer")}
      </p>
    </PhoneFrame>
  );
}