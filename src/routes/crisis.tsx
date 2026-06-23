import { RequireAuth } from "@/lib/auth";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  { label: "Breathe in", seconds: 4, scale: 1.0 },
  { label: "Hold", seconds: 7, scale: 1.0 },
  { label: "Breathe out", seconds: 8, scale: 0.55 },
] as const;

const GROUNDING = [
  "5 things you can see",
  "4 things you can touch",
  "3 things you can hear",
  "2 things you can smell",
  "1 thing you can taste",
];

function CrisisPage() {
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
      <StatusBar title="CRISIS MODE" />

      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="glass flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back to home"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <div className="flex items-center gap-2 text-gold">
          <LifeBuoy className="h-4 w-4" />
          <span className="text-[10px] uppercase tracking-[0.35em]">You are safe here</span>
        </div>
        <div className="h-10 w-10" />
      </header>

      <section className="flex flex-col items-center gap-4 pt-2">
        <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
          Cycle {cycle + 1}
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
                {running ? active.label : "Ready"}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-gold">
                {running ? `${active.seconds}s` : "4 · 7 · 8"}
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
          {running ? "Pause" : "Begin breathing"}
        </button>
      </section>

      <section className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold">5 · 4 · 3 · 2 · 1 grounding</p>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {GROUNDING.map((g) => (
            <li
              key={g}
              className="text-sm leading-relaxed text-foreground"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              · {g}
            </li>
          ))}
        </ul>
      </section>

      <section className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Say or write what is here
          </p>
          <VoiceInputButton value={note} onChange={setNote} compact />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nothing needs to be solved. Just name it…"
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
        Reach a human (Mental Helse · 116 123)
      </a>

      <p className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
        Breathing alone is enough. Stay as long as you need.
      </p>
    </PhoneFrame>
  );
}