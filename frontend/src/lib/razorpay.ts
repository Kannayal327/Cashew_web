interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void; confirm_close: boolean };
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (
        event: string,
        callback: (response: { error: { description?: string } }) => void,
      ) => void;
    };
  }
}
let loading: Promise<void> | undefined;

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    const timeout = window.setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timeout);
      script.remove();
      loading = undefined;
      reject(new Error("Secure checkout couldn’t load. Please try again."));
    }
    script.onload = () => {
      clearTimeout(timeout);
      if (window.Razorpay) resolve();
      else fail();
    };
    script.onerror = fail;
    document.body.appendChild(script);
  });
  return loading;
}

export async function checkoutIdempotencyKey(payload: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const fingerprint = Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  let previous: { fingerprint?: string; key?: string } = {};
  try {
    previous = JSON.parse(
      sessionStorage.getItem("farmdirect-checkout-attempt") || "{}",
    );
  } catch {
    /* New attempt if storage is corrupted. */
  }
  if (previous.fingerprint === fingerprint && previous.key) return previous.key;
  const key = crypto.randomUUID();
  sessionStorage.setItem(
    "farmdirect-checkout-attempt",
    JSON.stringify({ fingerprint, key }),
  );
  return key;
}
