import { useTranslation } from "react-i18next";
import { getPaddleEnvironment } from "@/lib/paddle";

export function PaymentTestModeBanner() {
  const { t } = useTranslation();
  if (getPaddleEnvironment() !== "sandbox") return null;
  // Temporarily hidden so the design preview isn't covered by the test-mode
  // banner. Set VITE_SHOW_TEST_PAYMENT_BANNER=true to re-enable.
  if (import.meta.env.VITE_SHOW_TEST_PAYMENT_BANNER !== "true") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] border-b border-orange-300/40 bg-orange-100/95 px-4 py-1.5 text-center text-[11px] text-orange-900 backdrop-blur">
      {t("paymentBanner.message")}{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium"
      >
        {t("paymentBanner.readMore")}
      </a>
    </div>
  );
}