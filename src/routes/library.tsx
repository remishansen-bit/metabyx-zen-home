import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { BookHeart, Leaf, CheckCircle2, Circle } from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { useMetabyx } from "@/lib/store";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library · METABYX" },
      { name: "description", content: "Branches you have noticed and metabolized." },
    ],
  }),
  component: LibraryPage,
});

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
  const groups = useMemo(() => {
    const map = new Map<number, typeof state.branches>();
    for (const b of state.branches) {
      const key = startOfDay(b.createdAt);
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [state.branches]);

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
        <div className="glass flex h-11 w-11 items-center justify-center rounded-full">
          <BookHeart className="h-4 w-4 text-gold" />
        </div>
      </header>

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

      {groups.length === 0 ? (
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
      ) : (
        <section className="flex flex-col gap-5">
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
                  const Icon = done ? CheckCircle2 : Circle;
                  return (
                    <li key={b.id} className="glass flex items-start gap-3 rounded-2xl px-4 py-3">
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
                          <Icon
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
                        {b.reflection && (
                          <p
                            className="mt-1 text-xs italic text-muted-foreground/80"
                            style={{ fontFamily: "Fraunces, serif" }}
                          >
                            "{b.reflection}"
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {b.category}
                      </span>
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
