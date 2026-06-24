import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({ meta: [{ title: "Privacy · METABYX" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <PhoneFrame hideTabBar>
      <StatusBar title="PRIVACY" />
      <LegalHeader title={t("legal.privacy")} />
      <article className="glass-strong space-y-3 rounded-3xl p-5 text-sm leading-relaxed text-foreground">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {t("legal.lastUpdated", { date: "June 2026" })}
        </p>
        <p>
          METABYX is built to hold your reflections gently. We collect only what
          we need to give the app back to you: your account email, your
          baseline preferences, and the entries you choose to sync.
        </p>
        <p>
          On-device data (branches, BMR history, emotion events) lives in your
          browser and is never sent to our servers unless you opt into a share
          link or export.
        </p>
        <p>
          We do not sell your data, and we never use your reflections to train
          third-party models.
        </p>
        <p>
          You can export or delete your data at any time from Settings.
        </p>
      </article>
    </PhoneFrame>
  );
}

function LegalHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <header className="flex items-center justify-between">
      <Link
        to="/settings"
        aria-label={t("legal.back")}
        className="glass flex h-9 w-9 items-center justify-center rounded-full"
      >
        <ChevronLeft className="h-4 w-4 text-foreground" />
      </Link>
      <h1
        className="text-xl font-light text-foreground"
        style={{ fontFamily: "Fraunces, serif" }}
      >
        {title}
      </h1>
      <span aria-hidden className="w-9" />
    </header>
  );
}