import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({ meta: [{ title: "Terms · METABYX" }] }),
  component: TermsPage,
});

function TermsPage() {
  const { t } = useTranslation();
  return (
    <PhoneFrame hideTabBar>
      <StatusBar title="TERMS" />
      <header className="flex items-center justify-between">
        <Link
          to="/settings"
          aria-label={t("legal.back")}
          className="glass flex h-9 w-9 items-center justify-center rounded-full"
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="text-xl font-light text-foreground" style={{ fontFamily: "Fraunces, serif" }}>
          {t("legal.terms")}
        </h1>
        <span aria-hidden className="w-9" />
      </header>
      <article className="glass-strong space-y-3 rounded-3xl p-5 text-sm leading-relaxed text-foreground">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {t("legal.lastUpdated", { date: "June 2026" })}
        </p>
        <p>
          By using METABYX you agree to use it as a personal reflection space —
          not as a substitute for medical or mental-health care.
        </p>
        <p>
          You keep ownership of what you write. We grant you a personal,
          non-transferable licence to use the app and its content.
        </p>
        <p>
          Please be kind to the people you share with. Don't use METABYX to
          harass, harm, or spam others.
        </p>
        <p>
          We may update these terms. Material changes will be surfaced in-app
          before they take effect.
        </p>
      </article>
    </PhoneFrame>
  );
}