import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronLeft,
  Users,
  Plus,
  Lock,
  Globe,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { RequireAuth } from "@/lib/auth";
import { notify } from "@/lib/feedback";

/**
 * Sketch screen for "Metabolic Circles" — shared rooms where small groups
 * could metabolise together. No backend yet; this is the visual contract
 * we want the future shared-state implementation to land into.
 */

export const Route = createFileRoute("/circles")({
  head: () => ({
    meta: [
      { title: "Circles · METABYX" },
      {
        name: "description",
        content: "Shared rooms for metabolising together — coming soon.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <CirclesPage />
    </RequireAuth>
  ),
});

type Circle = {
  id: string;
  name: string;
  members: number;
  pulse: number; // group BMR
  visibility: "private" | "public";
  hint: string;
};

const PREVIEW: Circle[] = [
  {
    id: "kin",
    name: "Kin",
    members: 4,
    pulse: 74,
    visibility: "private",
    hint: "Quiet evening reflections with the people closest in.",
  },
  {
    id: "founders",
    name: "Founders' Quiet Room",
    members: 11,
    pulse: 68,
    visibility: "private",
    hint: "For founders metabolising the week's open loops.",
  },
  {
    id: "dawn",
    name: "Dawn Practice",
    members: 32,
    pulse: 71,
    visibility: "public",
    hint: "An open morning circle. Drop in, set one intention.",
  },
];

function CirclesPage() {
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);

  return (
    <PhoneFrame>
      <StatusBar title="CIRCLES" />

      <header className="flex items-center justify-between">
        <Link
          to="/profile"
          className="glass flex h-9 w-9 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1
          className="text-xl font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Metabolic Circles
        </h1>
        <span className="w-9" aria-hidden />
      </header>

      <section className="glass-strong rounded-3xl p-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl glass">
          <Users className="h-5 w-5 text-gold" />
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
          A future feature
        </p>
        <p
          className="mt-2 text-base font-light leading-relaxed text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Small rooms where a few people metabolise life together — gentle
          rhythms, shared check-ins, one collective pulse.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Preview
        </p>
        {PREVIEW.map((c) => (
          <CircleRow key={c.id} circle={c} />
        ))}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setOpenCreate(true)}
          className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-background"
          style={{ background: "var(--gradient-gold)" }}
        >
          <Plus className="h-4 w-4" /> Create
        </button>
        <button
          onClick={() => setOpenJoin(true)}
          className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-foreground"
        >
          <ArrowRight className="h-4 w-4" /> Join with code
        </button>
      </section>

      {openCreate && (
        <SheetDialog
          title="Create a circle"
          intro="Name your room. You'll get a private code to invite a few people in."
          confirmLabel="Notify me when it's ready"
          onClose={() => setOpenCreate(false)}
          onConfirm={() => {
            notify.saved("Saved", "We'll let you know when Circles ships.");
            setOpenCreate(false);
          }}
        />
      )}
      {openJoin && (
        <SheetDialog
          title="Join a circle"
          intro="Got an invite code? Paste it here and we'll save your interest."
          confirmLabel="Hold my spot"
          inputPlaceholder="ABCD-1234"
          onClose={() => setOpenJoin(false)}
          onConfirm={() => {
            notify.saved("Saved", "Your spot is held for the first wave.");
            setOpenJoin(false);
          }}
        />
      )}
    </PhoneFrame>
  );
}

function CircleRow({ circle }: { circle: Circle }) {
  const Visibility = circle.visibility === "private" ? Lock : Globe;
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{
          background: "oklch(0.82 0.14 82 / 0.12)",
          border: "1px solid oklch(0.82 0.14 82 / 0.22)",
        }}
      >
        <Sparkles className="h-4 w-4 text-gold" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">{circle.name}</p>
          <Visibility className="h-3 w-3 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">{circle.hint}</p>
      </div>
      <div className="text-right">
        <p
          className="text-lg font-light text-gold"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {circle.pulse}
        </p>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
          {circle.members} in
        </p>
      </div>
    </div>
  );
}

function SheetDialog({
  title,
  intro,
  confirmLabel,
  inputPlaceholder,
  onClose,
  onConfirm,
}: {
  title: string;
  intro: string;
  confirmLabel: string;
  inputPlaceholder?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="glass-strong w-full max-w-sm rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-lg font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {title}
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">{intro}</p>
        {inputPlaceholder && (
          <input
            placeholder={inputPlaceholder}
            className="glass mt-3 w-full rounded-2xl bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="glass flex-1 rounded-2xl px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-2xl px-4 py-3 text-sm font-medium text-background"
            style={{ background: "var(--gradient-gold)" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}