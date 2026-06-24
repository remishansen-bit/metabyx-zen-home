import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronLeft,
  Users,
  Plus,
  Lock,
  Globe,
  Sparkles,
  ArrowRight,
  X,
  Copy,
  MessageCircle,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { RequireAuth } from "@/lib/auth";
import { notify } from "@/lib/feedback";
import {
  createCircle,
  joinByCode,
  leaveCircle,
  useCircles,
  type Circle,
} from "@/lib/circles";
import { useSubscription } from "@/hooks/useSubscription";
import { canAccess } from "@/lib/feature-access";
import { PaywallLockedCard } from "@/components/PaywallSheet";

/**
 * Metabolic Circles — sketch screen for shared rooms. Rooms persist to
 * localStorage via @/lib/circles so what the user creates or joins survives
 * reloads. Group state (members, pulse) is still local-only; the backend
 * sync ships later.
 */
export const Route = createFileRoute("/circles")({
  head: () => ({
    meta: [
      { title: "Circles · METABYX" },
      {
        name: "description",
        content: "Shared rooms for metabolising together.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <CirclesPage />
    </RequireAuth>
  ),
});

function CirclesPage() {
  const { tier, loading: subLoading } = useSubscription();
  const navigate = useNavigate();
  const allowed = canAccess(tier, "pro");
  const circles = useCircles();
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVisibility, setNewVisibility] = useState<"private" | "public">("private");
  const [joinCode, setJoinCode] = useState("");

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

      {!subLoading && !allowed && (
        <PaywallLockedCard
          required="pro"
          title="Circles are part of Pro"
          description="Small shared rooms — invite a few people in, hold one collective pulse together."
          onUnlock={() => navigate({ to: "/settings" })}
        />
      )}

      {allowed && (
      <>
      <section className="glass-strong rounded-3xl p-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl glass">
          <Users className="h-5 w-5 text-gold" />
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
          Shared rooms · early
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
          Your circles
        </p>
        {circles.length === 0 ? (
          <div className="glass rounded-2xl p-4 text-center text-xs text-muted-foreground">
            You're not in any circles yet. Create one or join with a code.
          </div>
        ) : (
          circles.map((c) => (
            <CircleRow
              key={c.id}
              circle={c}
              onOpen={() => navigate({ to: "/circles/$id", params: { id: c.id } })}
              onLeave={() => {
                leaveCircle(c.id);
                notify.info("Left circle", `You're no longer in ${c.name}.`);
              }}
            />
          ))
        )}
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
          intro="Name your room and choose how open it is. We'll generate a private join code you can share."
          confirmLabel="Create circle"
          onClose={() => {
            setOpenCreate(false);
            setNewName("");
          }}
          onConfirm={() => {
            const c = createCircle(newName || "Untitled circle", newVisibility);
            notify.saved("Circle created", `Share code ${c.joinCode} to invite people.`);
            setOpenCreate(false);
            setNewName("");
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Circle name"
            className="glass mt-3 w-full rounded-2xl bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="glass mt-2 flex rounded-2xl p-1 text-[11px] uppercase tracking-[0.2em]">
            {(["private", "public"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setNewVisibility(v)}
                className={`flex-1 rounded-xl py-2 transition-all ${newVisibility === v ? "bg-[oklch(0.82_0.14_82/0.18)] text-gold" : "text-muted-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>
        </SheetDialog>
      )}
      {openJoin && (
        <SheetDialog
          title="Join a circle"
          intro="Paste the invite code a friend shared. You'll be added to their room."
          confirmLabel="Join circle"
          onClose={() => {
            setOpenJoin(false);
            setJoinCode("");
          }}
          onConfirm={() => {
            try {
              const c = joinByCode(joinCode);
              notify.saved("Joined", `You're in ${c.name}.`);
              setOpenJoin(false);
              setJoinCode("");
            } catch (err) {
              notify.error("Couldn't join", err instanceof Error ? err.message : "Try a longer code.");
            }
          }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="ABCD-1234"
            className="glass mt-3 w-full rounded-2xl bg-transparent px-4 py-3 text-sm uppercase tracking-[0.2em] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </SheetDialog>
      )}
      </>
      )}
    </PhoneFrame>
  );
}

function CircleRow({
  circle,
  onLeave,
  onOpen,
}: {
  circle: Circle;
  onLeave: () => void;
  onOpen: () => void;
}) {
  const Visibility = circle.visibility === "private" ? Lock : Globe;
  const copyCode = async () => {
    if (!circle.joinCode) return;
    try {
      await navigator.clipboard.writeText(circle.joinCode);
      notify.info("Code copied", circle.joinCode);
    } catch {
      notify.error("Couldn't copy", "Try selecting it manually.");
    }
  };
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
      <button onClick={onOpen} className="flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">{circle.name}</p>
          <Visibility className="h-3 w-3 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">{circle.hint}</p>
        {circle.joinCode && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              void copyCode();
            }}
            role="button"
            tabIndex={0}
            className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-gold hover:underline"
          >
            <Copy className="h-3 w-3" /> {circle.joinCode}
          </span>
        )}
        <span className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <MessageCircle className="h-3 w-3" /> open thread
        </span>
      </button>
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
        {circle.source !== "preview" && (
          <button
            onClick={onLeave}
            aria-label={`Leave ${circle.name}`}
            className="mt-1 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Leave
          </button>
        )}
      </div>
    </div>
  );
}

function SheetDialog({
  title,
  intro,
  confirmLabel,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  intro: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
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
        {children}
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