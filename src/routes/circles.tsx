import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  RotateCw,
} from "lucide-react";
import { PhoneFrame, StatusBar } from "@/components/phone-frame";
import { RequireAuth } from "@/lib/auth";
import { EmptyState } from "@/components/feedback";
import { notify } from "@/lib/feedback";
import {
  createCircle,
  joinByCode,
  joinAttemptsRemaining,
  isValidCodeShape,
  rotateJoinCode,
  JOIN_LIMIT,
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
  const { t } = useTranslation();
  const { tier, loading: subLoading } = useSubscription();
  const navigate = useNavigate();
  const allowed = canAccess(tier, "pro");
  const circles = useCircles();
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVisibility, setNewVisibility] = useState<"private" | "public">("private");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  const shapeOk = isValidCodeShape(joinCode);
  const attemptsLeft = joinAttemptsRemaining();
  const joinHintId = "join-code-hint";
  const joinErrorId = "join-code-error";

  return (
    <PhoneFrame>
      <StatusBar title="CIRCLES" />

      <header className="flex items-center justify-between">
        <Link
          to="/profile"
          className="glass flex h-9 w-9 items-center justify-center rounded-full"
          aria-label={t("circlesFull.backAria")}
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1
          className="text-xl font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {t("circlesFull.header")}
        </h1>
        <span className="w-9" aria-hidden />
      </header>

      {!subLoading && !allowed && (
        <PaywallLockedCard
          required="pro"
          title={t("circlesFull.paywallTitle")}
          description={t("circlesFull.paywallDesc")}
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
          {t("circlesFull.earlyEyebrow")}
        </p>
        <p
          className="mt-2 text-base font-light leading-relaxed text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {t("circlesFull.earlyBody")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t("circlesFull.yourCircles")}
        </p>
        {circles.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={t("circlesFull.noCirclesTitle")}
            description={t("circlesFull.noCirclesBody")}
          />
        ) : (
          circles.map((c) => (
            <CircleRow
              key={c.id}
              circle={c}
              onOpen={() => navigate({ to: "/circles/$id", params: { id: c.id } })}
              onLeave={() => {
                leaveCircle(c.id);
                notify.info(t("circlesFull.leftTitle"), t("circlesFull.leftBody", { name: c.name }));
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
          <Plus className="h-4 w-4" /> {t("circlesFull.create")}
        </button>
        <button
          onClick={() => setOpenJoin(true)}
          className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-medium text-foreground"
        >
          <ArrowRight className="h-4 w-4" /> {t("circlesFull.joinWithCode")}
        </button>
      </section>

      {openCreate && (
        <SheetDialog
          title={t("circlesFull.createTitle")}
          intro={t("circlesFull.createIntro")}
          confirmLabel={t("circlesFull.createConfirm")}
          cancelLabel={t("circlesFull.cancel")}
          onClose={() => {
            setOpenCreate(false);
            setNewName("");
          }}
          onConfirm={() => {
            const c = createCircle(newName || t("circlesFull.untitled"), newVisibility);
            notify.saved(t("circlesFull.createdTitle"), t("circlesFull.createdBody", { code: c.joinCode }));
            setOpenCreate(false);
            setNewName("");
          }}
        >
          <label htmlFor="circle-name-input" className="mt-3 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("circlesFull.circleNameLabel")}
          </label>
          <input
            id="circle-name-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const c = createCircle(newName || t("circlesFull.untitled"), newVisibility);
                notify.saved(t("circlesFull.createdTitle"), t("circlesFull.createdBody", { code: c.joinCode }));
                setOpenCreate(false);
                setNewName("");
              }
            }}
            placeholder={t("circlesFull.circleNamePlaceholder")}
            autoFocus
            maxLength={60}
            aria-label={t("circlesFull.circleNameAria")}
            className="glass mt-1 w-full rounded-2xl bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-gold"
          />
          <div className="glass mt-2 flex rounded-2xl p-1 text-[11px] uppercase tracking-[0.2em]">
            {(["private", "public"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setNewVisibility(v)}
                className={`flex-1 rounded-xl py-2 transition-all ${newVisibility === v ? "bg-[oklch(0.82_0.14_82/0.18)] text-gold" : "text-muted-foreground"}`}
              >
                {v === "private" ? t("circlesFull.private") : t("circlesFull.public")}
              </button>
            ))}
          </div>
        </SheetDialog>
      )}
      {openJoin && (
        <SheetDialog
          title={t("circlesFull.joinTitle")}
          intro={t("circlesFull.joinIntro")}
          confirmLabel={t("circlesFull.joinConfirm")}
          cancelLabel={t("circlesFull.cancel")}
          onClose={() => {
            setOpenJoin(false);
            setJoinCode("");
            setJoinError(null);
          }}
          onConfirm={() => {
            try {
              const c = joinByCode(joinCode);
              notify.saved(t("circlesFull.joinedTitle"), t("circlesFull.joinedBody", { name: c.name }));
              setOpenJoin(false);
              setJoinCode("");
              setJoinError(null);
            } catch (err) {
              const msg =
                err instanceof Error
                  ? err.message
                  : t("circlesFull.invalidCode");
              setJoinError(msg);
              notify.error(t("circlesFull.couldNotJoin"), msg);
            }
          }}
        >
          <label htmlFor="join-code-input" className="mt-3 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("circlesFull.inviteCodeLabel")}
          </label>
          <input
            id="join-code-input"
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase());
              if (joinError) setJoinError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget.form ?? e.currentTarget).blur?.();
                try {
                  const c = joinByCode(joinCode);
                  notify.saved(t("circlesFull.joinedTitle"), t("circlesFull.joinedBody", { name: c.name }));
                  setOpenJoin(false);
                  setJoinCode("");
                  setJoinError(null);
                } catch (err) {
                  const msg =
                    err instanceof Error
                      ? err.message
                      : t("circlesFull.invalidCode");
                  setJoinError(msg);
                  notify.error(t("circlesFull.couldNotJoin"), msg);
                }
              }
            }}
            placeholder={t("circlesFull.inviteCodePlaceholder")}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            maxLength={9}
            aria-invalid={Boolean(joinError) || (joinCode.length > 0 && !shapeOk)}
            aria-describedby={`${joinHintId}${joinError || (joinCode.length > 0 && !shapeOk) ? ` ${joinErrorId}` : ""}`}
            aria-label={t("circlesFull.inviteCodeAria")}
            className="glass mt-1 w-full rounded-2xl bg-transparent px-4 py-3 text-sm uppercase tracking-[0.2em] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-gold"
          />
          <p id={joinHintId} className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("circlesFull.formatHint", { left: attemptsLeft, max: JOIN_LIMIT })}
          </p>
          {(joinError || (joinCode.length > 0 && !shapeOk)) && (
            <p
              id={joinErrorId}
              role="alert"
              aria-live="polite"
              className="mt-1 text-[11px] text-rose-300"
            >
              {joinError ?? (
                <>
                  {t("circlesFull.codesLook")} <span className="font-mono">ABCD-1234</span>.
                </>
              )}
            </p>
          )}
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
  const { t } = useTranslation();
  const Visibility = circle.visibility === "private" ? Lock : Globe;
  const copyCode = async () => {
    if (!circle.joinCode) return;
    try {
      await navigator.clipboard.writeText(circle.joinCode);
      notify.info(t("circlesFull.codeCopiedTitle"), circle.joinCode);
    } catch {
      notify.error(t("circlesFull.couldNotCopy"), t("circlesFull.copyManually"));
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
        {circle.source === "created" && circle.joinCode && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              const next = rotateJoinCode(circle.id);
              if (next?.joinCode) {
                notify.saved(t("circlesFull.rotatedTitle"), t("circlesFull.rotatedBody", { code: next.joinCode }));
              }
            }}
            role="button"
            tabIndex={0}
            className="ml-2 mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            <RotateCw className="h-3 w-3" /> {t("circlesFull.rotateAria")}
          </span>
        )}
        <span className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <MessageCircle className="h-3 w-3" /> {t("circlesFull.openThread")}
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
          {t("circlesFull.membersIn", { count: circle.members })}
        </p>
        {circle.source !== "preview" && (
          <button
            onClick={onLeave}
            aria-label={t("circlesFull.leaveAria", { name: circle.name })}
            className="mt-1 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> {t("circlesFull.leave")}
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
  cancelLabel,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  intro: string;
  confirmLabel: string;
  cancelLabel: string;
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
            {cancelLabel}
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