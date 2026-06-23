import { toast } from "sonner";

/**
 * Centralised user feedback for the four global write-style flows: saving a
 * branch, importing a Metabyx export, downloading a PDF/JSON, and sharing a
 * link. Keeping the wording, intent, and a11y semantics here means every
 * screen feels the same and we never accidentally ship an assertive shout
 * for a calm "saved" confirmation.
 *
 * Sonner already renders the appropriate role="status" / role="alert" live
 * region under the hood, so callers should NOT also add their own aria-live
 * announcements — that's a double-announce in screen readers.
 */

const calm = { duration: 3500 } as const;
const firm = { duration: 5500 } as const;

export const notify = {
  /** Calm confirmation — "branch saved", "library exported". */
  saved(message: string, description?: string) {
    return toast.success(message, { description, ...calm });
  },
  /** Neutral status — "link copied", "import in progress". */
  info(message: string, description?: string) {
    return toast(message, { description, ...calm });
  },
  /**
   * Errors. Always include a recoverable next step in `description` when one
   * exists; sonner announces these with role="alert".
   */
  error(message: string, description?: string) {
    return toast.error(message, { description, ...firm });
  },
  /** Long-running flow — returns an id the caller resolves with `done`. */
  loading(message: string) {
    return toast.loading(message);
  },
  done(id: string | number, message: string, description?: string) {
    toast.success(message, { id, description, ...calm });
  },
  failed(id: string | number, message: string, description?: string) {
    toast.error(message, { id, description, ...firm });
  },
};