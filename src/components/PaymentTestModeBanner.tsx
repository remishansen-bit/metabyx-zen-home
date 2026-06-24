import { getPaddleEnvironment } from "@/lib/paddle";

export function PaymentTestModeBanner() {
  if (getPaddleEnvironment() !== "sandbox") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] border-b border-orange-300/40 bg-orange-100/95 px-4 py-1.5 text-center text-[11px] text-orange-900 backdrop-blur">
      Payments are in test mode in the preview.{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium"
      >
        Read more
      </a>
    </div>
  );
}