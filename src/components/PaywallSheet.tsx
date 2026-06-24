import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Crown, Lock, Sparkles, X } from "lucide-react";
import { PAYWALL_COPY, type PaywallReason } from "@/lib/feature-access";
import { recordPaywallEvent } from "@/lib/paywall-analytics";

/**
 * Glassmorphism paywall sheet shown when a Free user tries to use a
 * Plus/Pro-only feature. Routes to /settings (subscription card) for the
 * actual upgrade flow — we deliberately keep checkout in one place.
 */
export function PaywallSheet({
  reason,
  onClose,
}: {
  reason: PaywallReason | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  if (!reason) return null;
  const copy = PAYWALL_COPY[reason.required];
  const dismiss = () => {
    recordPaywallEvent({
      required: reason.required,
      feature: reason.feature,
      type: "dismissed",
      surface: "sheet",
    });
    onClose();
  };
  const upgrade = () => {
    recordPaywallEvent({
      required: reason.required,
      feature: reason.feature,
      type: "upgrade_clicked",
      surface: "sheet",
    });
    onClose();
    navigate({ to: "/settings" });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${copy.name} required`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={dismiss}
    >
      <div
        className="glass-strong w-full max-w-sm rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl glass">
            {reason.required === "pro" ? (
              <Crown className="h-4 w-4 text-gold" />
            ) : (
              <Sparkles className="h-4 w-4 text-gold" />
            )}
          </div>
          <button
            onClick={dismiss}
            aria-label="Close"
            className="glass flex h-8 w-8 items-center justify-center rounded-full"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {copy.name} · {copy.price}
        </p>
        <h2
          className="mt-2 text-xl font-light text-foreground"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {reason.feature}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{reason.description}</p>
        <p className="mt-3 text-xs text-foreground/80">{copy.tagline}</p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={dismiss}
            className="glass flex-1 rounded-2xl px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground"
          >
            Not now
          </button>
          <button
            onClick={upgrade}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-background"
            style={{ background: "var(--gradient-gold)" }}
          >
            <Sparkles className="h-4 w-4" /> Upgrade
          </button>
        </div>
      </div>
    </div>
  );
}

export function PaywallLockedCard({
  required,
  title,
  description,
  onUnlock,
}: {
  required: "plus" | "pro";
  title: string;
  description: string;
  onUnlock: () => void;
}) {
  const copy = PAYWALL_COPY[required];
  useEffect(() => {
    recordPaywallEvent({
      required,
      feature: title,
      type: "impression",
      surface: "locked_card",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required, title]);
  return (
    <button
      onClick={() => {
        recordPaywallEvent({
          required,
          feature: title,
          type: "upgrade_clicked",
          surface: "locked_card",
        });
        onUnlock();
      }}
      className="glass-strong flex w-full flex-col items-start gap-2 rounded-3xl p-5 text-left transition-all active:scale-[0.99]"
    >
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-gold" />
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {copy.name} · locked
        </p>
      </div>
      <p
        className="text-lg font-light text-foreground"
        style={{ fontFamily: "Fraunces, serif" }}
      >
        {title}
      </p>
      <p className="text-xs text-muted-foreground">{description}</p>
      <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-[oklch(0.82_0.14_82/0.18)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-gold">
        <Sparkles className="h-3 w-3" /> Unlock {required}
      </span>
    </button>
  );
}