import { RequireAuth } from "@/lib/auth";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookHeart, Leaf, CheckCircle2, Search, ChevronRight, X, Download, Upload, LifeBuoy, FileText } from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
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

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
const dayLabel = (t: number) => {
  const d = new Date(t);
  const today = startOfDay(Date.now());
  if (startOfDay(t) === today) return "Today";
  if (startOfDay(t) === today - 86400000) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

function LibraryPage() {
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

      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Your branches</p>
          <h1
            className="mt-2 text-3xl font-light leading-tight text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Quietly <span className="text-gold italic">remembered</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/crisis"
            aria-label="Open crisis mode"
            className="glass flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95"
          >
            <LifeBuoy className="h-4 w-4 text-foreground" />
          </Link>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Import library from JSON"
            className="glass flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95"
          >
            <Upload className="h-4 w-4 text-foreground" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !gate.ensure("plus", {
                  feature: "Library export is part of Plus",
                  description:
                    "Plus lets you download the full library as JSON or PDF — Free keeps the last 14 days on-device only.",
                })
              ) {
                return;
              }
              try {
                exportLibrary(state);
                notify.saved("Library exported", "JSON download started.");
              } catch (err) {
                notify.error(
                  "Couldn't export library",
                  err instanceof Error ? err.message : undefined,
                );
              }
            }}
            disabled={total === 0}
            aria-label="Export library as JSON"
            className="glass flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40"
          >
            <Download className="h-4 w-4 text-foreground" />
          </button>
          <button
            type="button"
            onClick={async () => {
              if (
                !gate.ensure("plus", {
                  feature: "PDF export is part of Plus",
                  description:
                    "Plus generates a printable PDF of your branches, BMR history, and emotion log.",
                })
              ) {
                return;
              }
              const id = notify.loading("Preparing PDF…");
              try {
                await exportLibraryPdf(state);
                notify.done(id, "PDF ready", "Saved to your downloads.");
              } catch (err) {
                notify.failed(
                  id,
                  "Couldn't build PDF",
                  err instanceof Error ? err.message : undefined,
                );
              }
            }}
            disabled={total === 0}
            aria-label="Export library as PDF"
            className="glass flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40"
          >
            <FileText className="h-4 w-4 text-foreground" />
          </button>
          <div className="glass flex h-11 w-11 items-center justify-center rounded-full">
            <BookHeart className="h-4 w-4 text-gold" />
          </div>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const id = notify.loading("Reading file…");
          try {
            if (file.size > 5 * 1024 * 1024) {
              throw new Error("File is larger than 5 MB.");
            }
            const text = await file.text();
            let parsed: unknown;
            try {
              parsed = JSON.parse(text);
            } catch {
              throw new Error("File isn't valid JSON.");
            }
            const r = importMetabyxJson(parsed);
            const parts = [
              `Merged ${r.mergedBranches} of ${r.importedBranches} branch${r.importedBranches === 1 ? "" : "es"}`,
              `${r.importedHistory} BMR point${r.importedHistory === 1 ? "" : "s"}`,
            ];
            if (r.skippedBranches > 0) parts.push(`${r.skippedBranches} skipped`);
            parts.push(`library now ${r.totalBranches}`);
            notify.done(id, "Library restored", parts.join(" · "));
          } catch (err) {
            notify.failed(
              id,
              "Couldn't import that file",
              err instanceof Error ? err.message : undefined,
            );
          }
        }}
      />

      <section className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Noticed</p>
          <p
            className="mt-1 text-3xl font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {total}
          </p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold">Metabolized</p>
          <p
            className="mt-1 text-3xl font-light text-foreground"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {closed}
          </p>
        </div>
      </section>

      {/* Search */}
      <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search branches, reflections…"
          role="searchbox"
          aria-label="Search past branches"
          aria-controls="library-results"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Calm SR-only announcement of result count, recomputed only after the
          debounce settles. */}
      <p className="sr-only" role="status" aria-live="polite">
        {debouncedQuery
          ? `${filtered.length} result${filtered.length === 1 ? "" : "s"} for ${debouncedQuery}`
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
              {c}
            </button>
          );
        })}
      </div>

      {total === 0 ? (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Your library is empty. Begin with a morning check-in.
          </p>
          <Link
            to="/morning"
            className="mt-4 inline-block rounded-full px-4 py-2 text-xs font-semibold"
            style={{ background: "var(--gradient-gold)", color: "var(--primary-foreground)" }}
          >
            Morning check-in
          </Link>
        </div>
      ) : groups.length === 0 ? (
        <p className="glass rounded-2xl px-4 py-6 text-center text-xs text-muted-foreground">
          Nothing matches — try another word.
        </p>
      ) : (
        <section id="library-results" className="flex flex-col gap-5">
          {groups.map(([day, items], gi) => (
            <div
              key={day}
              className="flex flex-col gap-2 animate-rise"
              style={{ animationDelay: `${gi * 60}ms` }}
            >
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {dayLabel(day)}
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
