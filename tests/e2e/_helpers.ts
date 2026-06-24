import { Page, expect } from "@playwright/test";

/** Best-effort sign-in helper used by suites that need an authenticated user.
 *  Falls back to skipping the spec when credentials aren't provided so the
 *  suite stays runnable locally without seeded data. */
export async function signInIfPossible(page: Page) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) return false;
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(|onboarding|morning|profile)$/, { timeout: 10_000 });
  return true;
}

/** Stub the SpeechRecognition API so we can test voice-input UI without a mic. */
export async function installFakeSpeechRecognition(page: Page) {
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      lang = "";
      interimResults = false;
      continuous = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onresult: ((e: any) => void) | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onerror: ((e: any) => void) | null = null;
      onend: (() => void) | null = null;
      _shouldDeny = false;
      start() {
        if ((window as unknown as { __denyMic?: boolean }).__denyMic) {
          setTimeout(() => this.onerror?.({ error: "not-allowed" }), 5);
          return;
        }
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [
              [{ transcript: "this is a test transcript" }, { isFinal: true }] as unknown as {
                0: { transcript: string };
                isFinal: boolean;
              },
            ],
          });
          this.onend?.();
        }, 10);
      }
      stop() {
        this.onend?.();
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
      FakeRecognition;
  });
}