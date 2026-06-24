import { RequireAuth } from "@/lib/auth";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookHeart, Leaf, CheckCircle2, Search, ChevronRight, X, Download, Upload, LifeBuoy, FileText, Sunrise } from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { Screen, Section, Stack } from "@/components/layout/Screen";
import { ScreenHeader } from "@/components/layout/Typography";
import { EmptyState, ScreenTransition } from "@/components/feedback";
import { useMetabyx, importMetabyxJson, type Branch } from "@/lib/store";
import { exportLibraryPdf } from "@/lib/library-pdf";
import { notify } from "@/lib/feedback";
import { useFeatureGate } from "@/hooks/useFeatureGate";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library · METABYX" },
      { name: "description", content: "Branches you have noticed and metabolized." },
    ],
  }),
  component: () => (<RequireAuth><LibraryPage /></RequireAuth>),
});

const CATEGORIES = ["all", "mind", "body", "relationship", "work", "spirit"] as const;
type Cat = (typeof CATEGORIES)[number];
const CAT_KEY: Record<Cat, string> = {
  all: "libraryFull.catAll",
  mind: "libraryFull.catMind",
  body: "libraryFull.catBody",
  relationship: "libraryFull.catRelationship",
  work: "libraryFull.catWork",
  spirit: "libraryFull.catSpirit",
};

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
const dayLabel = (t: number, today: string, yesterday: string) => {
  const d = new Date(t);
  const todayStart = startOfDay(Date.now());
  if (startOfDay(t) === todayStart) return today;
  if (startOfDay(t) === todayStart - 86400000) return yesterday;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

function LibraryPage() {
  const { t } = useTranslation();
  const state = useMetabyx();
  const gate = useFeatureGate();
  const [query, setQuery] = useState("");
  // Debounce keeps filtering snappy and the live-region calm on long lists —
  // we don't recompute (or announce a new result count) until typing settles.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(id);
  }, [query]);
  const [cat, setCat] = useState<Cat>("all");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    return state.branches.filter((b) => {
      if (cat !== "all" && b.category !== cat) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.detail.toLowerCase().includes(q) ||
        (b.reflection ?? "").toLowerCase().includes(q)
      );
    });
  }, [state.branches, debouncedQuery, cat]);

  const groups = useMemo(() => {
    const map = new Map<number, Branch[]>();
    for (const b of filtered) {
      const key = startOfDay(b.createdAt);
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const total = state.branches.length;
  const closed = state.branches.filter((b) => b.status === "metabolized").length;

  return (
    <PhoneFrame>
      <StatusBar title="LIBRARY" />
      <Screen
        header={
          <ScreenHeader
            eyebrow={t("libraryFull.eyebrow")}
            title={
              <span style={{ fontFamily: "Fraunces, serif", fontWeight: 300 }}>
                {t("libraryFull.titlePrefix")} <span className="text-gold italic">{t("libraryFull.titleHighlight")}</span>
              </span>
            }
            action={
              <Stack direction="horizontal" gap="xs">
          <Link
            to="/crisis"
            aria-label={t("libraryFull.crisisAria")}
            className="glass flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95"
          >
            <LifeBuoy className="h-4 w-4 text-foreground" />
          </Link>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={t("libraryFull.importAria")}
            className="glass flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95"
          >
            <Upload className="h-4 w-4 text-foreground" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !gate.ensure("plus", {
                  feature: t("libraryFull.exportPlusTitle"),
                  description: t("libraryFull.exportPlusDesc"),
                })
              ) {
                return;
              }
              try {
                exportLibrary(state);
                notify.saved(t("libraryFull.exportedTitle"), t("libraryFull.exportedBody"));
              } catch (err) {
                notify.error(
                  t("libraryFull.exportError"),
                  err instanceof Error ? err.message : undefined,
                );
              }
            }}
            disabled={total === 0}
            aria-label={t("libraryFull.exportJsonAria")}
            className="glass flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40"
          >
            <Download className="h-4 w-4 text-foreground" />
          </button>
          <button
            type="button"
            onClick={async () => {
              if (
                !gate.ensure("plus", {
                  feature: t("libraryFull.pdfPlusTitle"),
                  description: t("libraryFull.pdfPlusDesc"),
                })
              ) {
                return;
              }
              const id = notify.loading(t("libraryFull.preparingPdf"));
              try {
                await exportLibraryPdf(state);
                notify.done(id, t("libraryFull.pdfReadyTitle"), t("libraryFull.pdfReadyBody"));
              } catch (err) {
                notify.failed(
                  id,
                  t("libraryFull.pdfError"),
                  err instanceof Error ? err.message : undefined,
                );
              }
            }}
            disabled={total === 0}
            aria-label={t("libraryFull.exportPdfAria")}
            className="glass flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40"
          >
            <FileText className="h-4 w-4 text-foreground" />
          </button>
          <div className="glass flex h-11 w-11 items-center justify-center rounded-full">
            <BookHeart className="h-4 w-4 text-gold" />
          </div>
              </Stack>
            }
          />
        }
      >

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const id = notify.loading(t("libraryFull.readingFile"));
          try {
            if (file.size > 5 * 1024 * 1024) {
              throw new Error(t("libraryFull.fileTooLarge"));
            }
            const text = await file.text();
            let parsed: unknown;
            try {
              parsed = JSON.parse(text);
            } catch {
              throw new Error(t("libraryFull.invalidJson"));
            }
            const r = importMetabyxJson(parsed);
            const branchWord = r.importedBranches === 1 ? t("libraryFull.branchSingular") : t("libraryFull.branchPlural");
            const parts = [
              t("libraryFull.merged", { merged: r.mergedBranches, imported: r.importedBranches, branchWord }),
              r.importedHistory === 1
                ? t("libraryFull.historyPoint", { count: r.importedHistory })
                : t("libraryFull.historyPoints", { count: r.importedHistory }),
            ];
            if (r.skippedBranches > 0) parts.push(t("libraryFull.skipped", { count: r.skippedBranches }));
            parts.push(t("libraryFull.libraryNow", { count: r.totalBranches }));
            notify.done(id, t("libraryFull.restoredTitle"), parts.join(" · "));
          } catch (err) {
            notify.failed(
              id,
              t("libraryFull.importError"),
              err instanceof Error ? err.message : undefined,
            );
          }
        }}
      />

      <Section className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("libraryFull.noticed")}</p>
          <p
            className="mt-1 text-3xl font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {total}
          </p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold">{t("libraryFull.metabolized")}</p>
          <p
            className="mt-1 text-3xl font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {closed}
          </p>
        </div>
      </Section>

      {/* Search */}
      <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("libraryFull.searchPlaceholder")}
          role="searchbox"
          aria-label={t("libraryFull.searchAria")}
          aria-controls="library-results"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label={t("libraryFull.clearAria")}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Calm SR-only announcement of result count, recomputed only after the
          debounce settles. */}
      <p className="sr-only" role="status" aria-live="polite">
        {debouncedQuery
          ? filtered.length === 1
            ? t("libraryFull.resultFor", { count: filtered.length, q: debouncedQuery })
            : t("libraryFull.resultsFor", { count: filtered.length, q: debouncedQuery })
          : ""}
      </p>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {CATEGORIES.map((c) => {
          const on = cat === c;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`glass shrink-0 rounded-full px-3.5 py-1.5 text-xs capitalize transition-all ${on ? "ring-1 ring-[oklch(0.82_0.14_82/0.6)] text-gold" : "text-muted-foreground"}`}
              style={
                on
                  ? { background: "linear-gradient(135deg, oklch(0.82 0.14 82 / 0.18), oklch(0.82 0.14 82 / 0.04))" }
                  : undefined
              }
            >
              {t(CAT_KEY[c])}
            </button>
          );
        })}
      </div>

      <ScreenTransition phase={total === 0 ? "empty" : groups.length === 0 ? "no-match" : "content"}>
      {total === 0 ? (
        <EmptyState
          icon={<BookHeart className="h-5 w-5" />}
          title={t("libraryFull.emptyTitle")}
          description={t("libraryFull.emptyBody")}
          action={
            <Link
              to="/morning"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
              style={{ background: "var(--gradient-gold)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-gold)" }}
            >
              <Sunrise className="h-3.5 w-3.5" /> {t("libraryFull.morningCta")}
            </Link>
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title={t("libraryFull.noMatchTitle")}
          description={t("libraryFull.noMatchBody")}
        />
      ) : (
        <section id="library-results" className="flex flex-col gap-5">
          {groups.map(([day, items], gi) => (
            <div
              key={day}
              className="flex flex-col gap-2 animate-rise"
              style={{ animationDelay: `${gi * 60}ms` }}
            >
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {dayLabel(day, t("libraryFull.today"), t("libraryFull.yesterday"))}
              </p>
              <ul className="flex flex-col gap-2">
                {items.map((b) => {
                  const done = b.status === "metabolized";
                  return (
                    <li key={b.id}>
                      <Link
                        to="/branch/$id"
                        params={{ id: b.id }}
                        className="glass flex items-start gap-3 rounded-2xl px-4 py-3 transition-all hover:bg-[oklch(1_0_0/0.06)] active:scale-[0.99]"
                      >
                        <div
                          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                          style={{
                            background: done
                              ? "var(--gradient-gold)"
                              : "oklch(0.82 0.14 82 / 0.10)",
                            border: done ? "none" : "1px solid oklch(0.82 0.14 82 / 0.22)",
                          }}
                        >
                          {done ? (
                            <CheckCircle2
                              className="h-4 w-4"
                              style={{ color: "var(--primary-foreground)" }}
                            />
                          ) : (
                            <Leaf className="h-4 w-4 text-gold" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{b.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{b.detail}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-gold">
                              {b.category}
                            </span>
                            {done && typeof b.rating === "number" && (
                              <span className="text-[10px] text-muted-foreground">
                                · {"●".repeat(b.rating)}{"○".repeat(5 - b.rating)}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
      </ScreenTransition>
      {gate.paywall}
      </Screen>
    </PhoneFrame>
  );
}

function exportLibrary(state: ReturnType<typeof useMetabyx>) {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    app: "metabyx",
    branches: state.branches,
    bmrHistory: state.bmrHistory,
    lastBmr: state.lastBmr,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `metabyx-library-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
