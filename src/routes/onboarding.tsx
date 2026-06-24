import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Loader2, Check } from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth, refreshProfile, useAuth } from "@/lib/auth";
import { notify } from "@/lib/feedback";
import {
  ARCHETYPES,
  ONBOARDING_QUESTIONS as QUESTIONS,
  archetypeAreaFor,
  baselineBmrFor,
  type Area,
} from "@/lib/onboarding";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Welcome · METABYX" }] }),
  component: () => (
    <RequireAuth requireOnboarded={false}>
      <OnboardingFlow />
    </RequireAuth>
  ),
});

function OnboardingFlow() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>(() => QUESTIONS.map(() => 3));
  const [saving, setSaving] = useState(false);

  // Skip the flow if already onboarded
  useEffect(() => {
    if (auth.profile?.onboarded_at) navigate({ to: "/" });
  }, [auth.profile, navigate]);

  const total = QUESTIONS.length + 2; // welcome + questions + summary
  const progress = (step / (total - 1)) * 100;

  const archetypeArea: Area = archetypeAreaFor(answers);
  const archetype = ARCHETYPES[archetypeArea];
  const baselineBmr = baselineBmrFor(answers);

  const finish = async () => {
    if (!auth.user) return;
    setSaving(true);
    try {
      const scores = Object.fromEntries(QUESTIONS.map((q, i) => [q.area, answers[i]]));
      const { error } = await supabase
        .from("profiles")
        .update({
          archetype: archetype.name,
          archetype_scores: scores,
          baseline_bmr: baselineBmr,
          onboarded_at: new Date().toISOString(),
        })
        .eq("user_id", auth.user.id);
      if (error) throw error;
      await refreshProfile();
      notify.saved(t("onboarding.welcomeSaved.title"), t("onboarding.welcomeSaved.body"));
      navigate({ to: "/" });
    } catch (err) {
      notify.error(t("onboarding.couldNotSave"), err instanceof Error ? err.message : t("auth.tryAgain"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PhoneFrame hideTabBar>
      <StatusBar title={t("onboarding.titleBar")} />
      <div className="h-1 w-full overflow-hidden rounded-full bg-[oklch(1_0_0/0.05)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: "var(--gradient-gold)" }}
        />
      </div>

      {step === 0 ? (
        <WelcomeStep onNext={() => setStep(1)} />
      ) : step <= QUESTIONS.length ? (
        <QuestionStep
          index={step - 1}
          value={answers[step - 1]}
          onChange={(v) =>
            setAnswers((prev) => prev.map((a, i) => (i === step - 1 ? v : a)))
          }
          onNext={() => setStep(step + 1)}
          onBack={() => setStep(step - 1)}
        />
      ) : (
        <SummaryStep
          archetype={archetype}
          baseline={baselineBmr}
          onFinish={finish}
          saving={saving}
          onBack={() => setStep(QUESTIONS.length)}
        />
      )}
    </PhoneFrame>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="glass-strong flex h-20 w-20 items-center justify-center rounded-3xl">
        <Sparkles className="h-7 w-7 text-gold" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
          {t("onboarding.welcomeEyebrow")}
        </p>
        <h1
          className="mt-2 text-3xl font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {t("onboarding.welcomeTitle")}
        </h1>
      </div>
      <div className="glass w-full rounded-3xl p-5 text-left">
        <p className="text-[10px] uppercase tracking-[0.3em] text-gold">{t("onboarding.bmrTitle")}</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">{t("onboarding.bmrBody")}</p>
      </div>
      <div className="glass w-full rounded-3xl p-5 text-left">
        <p className="text-[10px] uppercase tracking-[0.3em] text-gold">{t("onboarding.narrativeTitle")}</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">{t("onboarding.narrativeBody")}</p>
      </div>
      <button
        onClick={onNext}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-background"
        style={{ background: "var(--gradient-gold)" }}
      >
        {t("common.begin")} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function QuestionStep({
  index,
  value,
  onChange,
  onNext,
  onBack,
}: {
  index: number;
  value: number;
  onChange: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const q = QUESTIONS[index];
  const { t } = useTranslation();
  const labels = [
    t("onboarding.scale.rarely"),
    t("onboarding.scale.sometimes"),
    t("onboarding.scale.often"),
    t("onboarding.scale.aLot"),
    t("onboarding.scale.constantly"),
  ];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t("onboarding.questionOf", { current: index + 1, total: QUESTIONS.length })}
        </p>
        <h2
          className="mt-3 text-2xl font-light leading-snug text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {q.prompt}
        </h2>
      </div>
      <div className="glass-strong rounded-3xl p-5">
        <div className="flex items-end justify-between gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <span
                className="block w-full rounded-full transition-all"
                style={{
                  height: 12 + n * 8,
                  background:
                    value >= n
                      ? "var(--gradient-gold)"
                      : "oklch(1 0 0 / 0.08)",
                  boxShadow:
                    value === n ? "0 0 18px oklch(0.82 0.14 82 / 0.5)" : undefined,
                }}
              />
              <span
                className={`text-[9px] uppercase tracking-wider ${value === n ? "text-gold" : "text-muted-foreground"}`}
              >
                {labels[n - 1]}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={onBack}
          className="glass rounded-2xl px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          {t("common.back")}
        </button>
        <button
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-background"
          style={{ background: "var(--gradient-gold)" }}
        >
          {t("common.continue")} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SummaryStep({
  archetype,
  baseline,
  onFinish,
  saving,
  onBack,
}: {
  archetype: { name: string; tagline: string };
  baseline: number;
  onFinish: () => void;
  saving: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5 text-center">
      <div>
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
          {t("onboarding.archetypeEyebrow")}
        </p>
        <h2
          className="mt-2 text-3xl font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {archetype.name}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{archetype.tagline}</p>
      </div>
      <div className="glass-strong rounded-3xl p-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t("onboarding.baselineEyebrow")}
        </p>
        <p
          className="mt-2 text-6xl font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {baseline}
        </p>
        <p className="mt-2 text-xs text-gold">{t("onboarding.baselineHint")}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="glass rounded-2xl px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          {t("common.back")}
        </button>
        <button
          onClick={onFinish}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-background disabled:opacity-60"
          style={{ background: "var(--gradient-gold)" }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("onboarding.enterApp")}
        </button>
      </div>
    </div>
  );
}