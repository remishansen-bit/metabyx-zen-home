import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";

export const Route = createFileRoute("/legal/contact")({
  head: () => ({ meta: [{ title: "Contact · METABYX" }] }),
  component: ContactPage,
});

function ContactPage() {
  const { t } = useTranslation();
  const email = t("legal.contactEmailValue");
  return (
    <PhoneFrame hideTabBar>
      <StatusBar title="CONTACT" />
      <header className="flex items-center justify-between">
        <Link
          to="/settings"
          aria-label={t("legal.back")}
          className="glass flex h-9 w-9 items-center justify-center rounded-full"
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="text-xl font-light text-foreground" style={{ fontFamily: "Fraunces, serif" }}>
          {t("legal.contact")}
        </h1>
        <span aria-hidden className="w-9" />
      </header>
      <section className="glass-strong space-y-4 rounded-3xl p-5">
        <p className="text-sm text-foreground">
          We read every note. Reach out and we'll respond within a few days.
        </p>
        <a
          href={`mailto:${email}`}
          className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all hover:bg-[oklch(1_0_0/0.06)]"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{
              background: "oklch(0.82 0.14 82 / 0.12)",
              border: "1px solid oklch(0.82 0.14 82 / 0.22)",
            }}
          >
            <Mail className="h-4 w-4 text-gold" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{t("legal.contactEmailLabel")}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
        </a>
      </section>
    </PhoneFrame>
  );
}