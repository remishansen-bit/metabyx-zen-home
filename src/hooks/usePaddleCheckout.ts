import { useState } from "react";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";

type OpenCheckoutOptions = {
  priceId: string;
  quantity?: number;
  customerEmail?: string;
  customData?: Record<string, string>;
  successUrl?: string;
};

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCheckout = async (options: OpenCheckoutOptions) => {
    setLoading(true);
    setError(null);
    try {
      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(options.priceId);

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: options.quantity ?? 1 }],
        customer: options.customerEmail
          ? { email: options.customerEmail }
          : undefined,
        customData: options.customData,
        settings: {
          displayMode: "overlay",
          successUrl:
            options.successUrl ||
            `${window.location.origin}/settings?checkout=success`,
          allowLogout: false,
          variant: "one-page",
          theme: "dark",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't open checkout";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading, error };
}