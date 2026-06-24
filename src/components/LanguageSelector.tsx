import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { LANGUAGES, applyDocumentDirection } from "@/i18n";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.split("-")[0] ?? "en";

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    await i18n.changeLanguage(next);
    applyDocumentDirection(next);
  };

  return (
    <label
      className={
        compact
          ? "inline-flex items-center gap-2 text-xs text-muted-foreground"
          : "glass flex items-center gap-3 rounded-2xl px-4 py-3"
      }
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{
          background: "oklch(0.82 0.14 82 / 0.12)",
          border: "1px solid oklch(0.82 0.14 82 / 0.22)",
        }}
      >
        <Globe className="h-4 w-4 text-gold" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{t("settings.language")}</p>
        <p className="text-xs text-muted-foreground">{t("settings.languageDesc")}</p>
      </div>
      <select
        value={current}
        onChange={onChange}
        aria-label={t("common.language")}
        className="rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}