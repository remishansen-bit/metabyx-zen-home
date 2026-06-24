import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { notify } from "@/lib/feedback";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/legal/data-deletion")({
  head: () => ({ meta: [{ title: "Delete data · METABYX" }] }),
  component: DataDeletionPage,
});

function DataDeletionPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [sent, setSent] = useState(false);

  const submit = () => {
    const email = auth.user?.email;
    const subject = encodeURIComponent("METABYX data deletion request");
    const body = encodeURIComponent(
      `Please delete the account and data associated with ${email ?? "my account"}.`,
    );
    try {
      window.location.href = `mailto:support@metabyx.app?subject=${subject}&body=${body}`;
      setSent(true);
      notify.saved(t("legal.deletionSent"), t("legal.deletionSentBody"));
    } catch {
      notify.info(t("legal.deletionSent"), t("legal.deletionEmailFallback"));
    }
  };

  return (
    <PhoneFrame hideTabBar>
      <StatusBar title="DELETE" />
      <header className="flex items-center justify-between">
        <Link
          to="/settings"
          aria-label={t("legal.back")}
          className="glass flex h-9 w-9 items-center justify-center rounded-full"
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="text-xl font-light text-foreground" style={{ fontFamily: "Fraunces, serif" }}>
          {t("legal.dataDeletion")}
        </h1>
        <span aria-hidden className="w-9" />
      </header>
      <section className="glass-strong space-y-4 rounded-3xl p-5">
        <p className="text-sm leading-relaxed text-foreground">
          {t("legal.deletionIntro")}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={sent}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-background disabled:opacity-40"
          style={{ background: "var(--gradient-gold)" }}
        >
          <Trash2 className="h-4 w-4" />
          {sent ? t("legal.deletionSent") : t("legal.deletionConfirm")}
        </button>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t("legal.deletionEmailFallback")}
        </p>
      </section>
    </PhoneFrame>
  );
}