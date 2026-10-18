"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { useCart, cartSubtotal } from "@/stores/cart";
import { ApiError, api, demoCatalog } from "@/lib/api";
import type { CartLine, CreatedOrder, Quote, TrackingOrder } from "@/lib/types";
import { money, weight } from "@/lib/utils";
import { checkoutIdempotencyKey, loadRazorpay } from "@/lib/razorpay";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";

const blankAddress = {
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
};

function consumePurchased(purchased: CartLine[]) {
  const counts = new Map(
    purchased.map((line) => [line.variant_id, line.quantity]),
  );
  useCart.setState((state) => ({
    lines: state.lines.flatMap((line) => {
      const quantity = line.quantity - (counts.get(line.variant_id) || 0);
      return quantity > 0 ? [{ ...line, quantity }] : [];
    }),
  }));
}

export function CartDrawer() {
  const { lines, open, setOpen, setQuantity, remove } = useCart();
  const [step, setStep] = useState<"bag" | "checkout" | "confirmation">("bag");
  const [address, setAddress] = useState(blankAddress);
  const [email, setEmail] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [totals, setTotals] = useState<Quote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<CreatedOrder | null>(null);
  const [purchased, setPurchased] = useState<CartLine[]>([]);
  const [demoOrder, setDemoOrder] = useState<CreatedOrder | null>(null);
  const [copied, setCopied] = useState(false);
  const subtotal = cartSubtotal(lines);
  const itemsKey = JSON.stringify(
    lines.map((line) => ({
      variant_id: line.variant_id,
      quantity: line.quantity,
    })),
  );

  useEffect(() => {
    if (step !== "checkout" || !open) return;
    setTotals(null);
    setQuoteError("");
    setDemoOrder(null);
    if (
      !/^[1-9][0-9]{5}$/.test(address.pincode) ||
      !lines.length ||
      demoCatalog
    ) {
      setQuoteBusy(false);
      return;
    }
    setQuoteBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const quote = await api<Quote>("/api/checkout/quote", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            items: JSON.parse(itemsKey),
            pincode: address.pincode,
            coupon: coupon || null,
          }),
        });
        if (!controller.signal.aborted) setTotals(quote);
      } catch (reason) {
        if (!controller.signal.aborted)
          setQuoteError(
            reason instanceof Error
              ? reason.message
              : "Could not calculate delivery.",
          );
      } finally {
        if (!controller.signal.aborted) setQuoteBusy(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [itemsKey, address.pincode, coupon, step, open, lines.length]);

  function record(order: CreatedOrder) {
    sessionStorage.setItem(`farmdirect-order-${order.id}`, order.order_token);
    sessionStorage.setItem("farmdirect-last-order", order.id);
  }

  function complete(order: CreatedOrder, snapshot: CartLine[]) {
    record(order);
    setConfirmation(order);
    setPurchased(snapshot);
    setStep("confirmation");
    setBusy(false);
    setDemoOrder(null);
    if (order.payment_status === "PAID") {
      consumePurchased(snapshot);
      sessionStorage.removeItem("farmdirect-checkout-attempt");
      setAddress(blankAddress);
      setEmail("");
      setCoupon("");
      setCouponInput("");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!totals || quoteBusy || demoCatalog || busy) return;
    setBusy(true);
    setError("");
    const snapshot = [...lines];
    try {
      const payload = {
        items: JSON.parse(itemsKey),
        email,
        address,
        coupon: coupon || null,
      };
      const key = await checkoutIdempotencyKey(payload);
      const order = await api<CreatedOrder>("/api/orders/create", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
      record(order);
      if (order.payment_status === "EXPIRED") {
        sessionStorage.removeItem("farmdirect-checkout-attempt");
        throw new Error(
          "This checkout has expired. Please try again to reserve fresh stock.",
        );
      }
      if (order.payment_status !== "PENDING") {
        complete(order, snapshot);
        return;
      }
      // The order is the final authority; never charge a stale browser quote.
      if (order.total_paise !== totals.total_paise) {
        setTotals(order);
        setBusy(false);
        setError(
          "Your total has changed. Review the updated amount, then continue to payment.",
        );
        return;
      }
      if (order.payment_provider === "mock") {
        setDemoOrder(order);
        setPurchased(snapshot);
        setBusy(false);
        return;
      }
      if (!order.razorpay_key_id || !order.razorpay_order_id)
        throw new Error("Secure payment is not configured.");
      await loadRazorpay();
      if (!window.Razorpay)
        throw new Error("Secure payment could not be loaded.");
      const checkout = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: order.total_paise,
        currency: "INR",
        name: "FarmDirect Cashews",
        description: `Your farm-direct order ${order.reference}`,
        order_id: order.razorpay_order_id,
        prefill: { name: address.name, email, contact: address.phone },
        theme: { color: "#294b3b" },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            setBusy(false);
            setError(
              "Payment window closed. You can retry this checkout while your reservation is active.",
            );
          },
        },
        handler: async (result) => {
          try {
            const verified = await api<{
              payment_status: CreatedOrder["payment_status"];
            }>("/api/payments/verify", {
              method: "POST",
              headers: { "X-Order-Token": order.order_token },
              body: JSON.stringify({ order_id: order.id, ...result }),
            });
            complete(
              { ...order, payment_status: verified.payment_status },
              snapshot,
            );
          } catch {
            // A network failure is not evidence that a payment failed. Keep the
            // bag and direct the buyer to the webhook-backed tracking state.
            complete(order, snapshot);
          }
        },
      });
      checkout.on("payment.failed", (response) => {
        setBusy(false);
        setError(
          response.error.description ||
            "Payment could not be completed. You can retry.",
        );
      });
      checkout.open();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409)
        sessionStorage.removeItem("farmdirect-checkout-attempt");
      setError(
        reason instanceof Error
          ? reason.message
          : "Checkout could not be completed.",
      );
      setBusy(false);
    }
  }

  async function simulatePayment() {
    if (!demoOrder) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        payment_status: CreatedOrder["payment_status"];
      }>(`/api/dev/orders/${demoOrder.id}/pay`, {
        method: "POST",
        headers: { "X-Order-Token": demoOrder.order_token },
      });
      complete(
        { ...demoOrder, payment_status: result.payment_status },
        purchased,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Demo payment failed.",
      );
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!confirmation) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<TrackingOrder>(
        `/api/orders/${confirmation.id}/track`,
        { headers: { "X-Order-Token": confirmation.order_token } },
      );
      complete(
        {
          ...confirmation,
          payment_status:
            result.payment_status as CreatedOrder["payment_status"],
        },
        result.payment_status === "PAID" &&
          confirmation.payment_status !== "PAID"
          ? purchased
          : [],
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not check your order.",
      );
      setBusy(false);
    }
  }

  function changeOpen(value: boolean) {
    if (!value && busy) return;
    setOpen(value);
    if (!value && step === "confirmation") {
      setStep("bag");
      setConfirmation(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent closeDisabled={busy}>
        <div className="drawer-heading">
          <span className="eyebrow">A LITTLE BAG OF GOODNESS</span>
          <SheetTitle>
            {step === "bag"
              ? "Your farm favourites."
              : step === "checkout"
                ? "Almost at your doorstep."
                : confirmation?.payment_status === "PAID"
                  ? "A good little decision."
                  : "We’re checking your payment."}
          </SheetTitle>
          <SheetDescription>
            {step === "bag"
              ? "Handpicked by you. Ready for your everyday."
              : step === "checkout"
                ? "Your details, delivery, and payment. All in one place."
                : "Keep your order ID and access key to follow your order."}
          </SheetDescription>
        </div>
        <div className="drawer-body">
          {step === "bag" &&
            (!lines.length ? (
              <div className="empty-bag">
                <ShoppingBag size={43} strokeWidth={1} />
                <h3>Good things belong in here.</h3>
                <p>Find your favourite handful and make yourself at home.</p>
                <Button asChild>
                  <Link href="/shop" onClick={() => setOpen(false)}>
                    Explore the collection <ArrowRight size={17} />
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="bag-list">
                  {lines.map((line) => (
                    <div className="bag-line" key={line.variant_id}>
                      <div className={`bag-thumbnail art-${line.accent}`}>
                        <Leaf size={25} strokeWidth={1.2} />
                        <span>FarmDirect</span>
                      </div>
                      <div className="bag-line-main">
                        <Link
                          href={`/products/${line.product_slug}`}
                          onClick={() => setOpen(false)}
                        >
                          {line.product_name}
                        </Link>
                        <span>
                          {weight(line.weight_grams)} ·{" "}
                          {money(line.price_paise)}
                        </span>
                        <div className="quantity-control">
                          <button
                            aria-label={`Remove one ${line.product_name}`}
                            onClick={() =>
                              setQuantity(line.variant_id, line.quantity - 1)
                            }
                          >
                            <Minus size={13} />
                          </button>
                          <span>{line.quantity}</span>
                          <button
                            aria-label={`Add one ${line.product_name}`}
                            disabled={
                              line.quantity >=
                              Math.min(20, line.available_stock)
                            }
                            onClick={() =>
                              setQuantity(line.variant_id, line.quantity + 1)
                            }
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="bag-line-total">
                        <strong>
                          {money(line.price_paise * line.quantity)}
                        </strong>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${line.product_name} from bag`}
                          onClick={() => remove(line.variant_id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bag-delivery-note">
                  <Truck size={20} />
                  <div>
                    <strong>A little closer to your doorstep.</strong>
                    <p>
                      Enter your PIN code at checkout for delivery and your
                      final total.
                    </p>
                  </div>
                </div>
              </>
            ))}
          {step === "checkout" && (
            <>
              <button
                className="text-link back-to-bag"
                onClick={() => {
                  setStep("bag");
                  setError("");
                }}
                disabled={busy}
              >
                <ArrowLeft size={15} /> Back to your bag
              </button>
              {demoCatalog && (
                <p className="notice">
                  This is a catalog preview. Connect a backend and disable demo
                  catalog mode to check out.
                </p>
              )}
              {!lines.length ? (
                <p>Your bag is empty. Add a few favourites to continue.</p>
              ) : (
                <form
                  id="checkout-form"
                  onSubmit={submit}
                  className="checkout-form"
                >
                  <fieldset disabled={busy || !!demoOrder}>
                    <legend>01 / YOUR DETAILS</legend>
                    <label>
                      Email address
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        maxLength={254}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </label>
                    <div className="form-row">
                      <label>
                        Full name
                        <input
                          required
                          autoComplete="name"
                          minLength={2}
                          maxLength={100}
                          value={address.name}
                          onChange={(e) =>
                            setAddress({ ...address, name: e.target.value })
                          }
                          placeholder="Your name"
                        />
                      </label>
                      <label>
                        Mobile number
                        <input
                          type="tel"
                          required
                          inputMode="numeric"
                          pattern="[6-9][0-9]{9}"
                          autoComplete="tel-national"
                          maxLength={10}
                          value={address.phone}
                          onChange={(e) =>
                            setAddress({
                              ...address,
                              phone: e.target.value.replace(/\D/g, ""),
                            })
                          }
                          placeholder="10-digit mobile"
                        />
                      </label>
                    </div>
                  </fieldset>
                  <fieldset disabled={busy || !!demoOrder}>
                    <legend>02 / DELIVERY ADDRESS</legend>
                    <label>
                      Street address
                      <input
                        required
                        autoComplete="address-line1"
                        minLength={5}
                        maxLength={200}
                        value={address.line1}
                        onChange={(e) =>
                          setAddress({ ...address, line1: e.target.value })
                        }
                        placeholder="House / flat, building, street"
                      />
                    </label>
                    <label>
                      Area or landmark <span className="muted">(optional)</span>
                      <input
                        autoComplete="address-line2"
                        maxLength={200}
                        value={address.line2}
                        onChange={(e) =>
                          setAddress({ ...address, line2: e.target.value })
                        }
                        placeholder="Help us find you"
                      />
                    </label>
                    <div className="form-row">
                      <label>
                        City
                        <input
                          required
                          autoComplete="address-level2"
                          minLength={2}
                          maxLength={100}
                          value={address.city}
                          onChange={(e) =>
                            setAddress({ ...address, city: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        State
                        <input
                          required
                          autoComplete="address-level1"
                          minLength={2}
                          maxLength={100}
                          value={address.state}
                          onChange={(e) =>
                            setAddress({ ...address, state: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      PIN code
                      <input
                        required
                        inputMode="numeric"
                        pattern="[1-9][0-9]{5}"
                        autoComplete="postal-code"
                        maxLength={6}
                        value={address.pincode}
                        onChange={(e) =>
                          setAddress({
                            ...address,
                            pincode: e.target.value.replace(/\D/g, ""),
                          })
                        }
                        placeholder="6-digit Indian PIN"
                      />
                    </label>
                    <div className="delivery-status" aria-live="polite">
                      {quoteBusy ? (
                        <>
                          <LoaderCircle className="spin" size={15} /> Checking
                          delivery and your total…
                        </>
                      ) : totals ? (
                        <>
                          <Check size={16} /> We deliver here. Estimated{" "}
                          {totals.delivery_estimate}.
                        </>
                      ) : !quoteError ? (
                        "Enter your PIN to check delivery."
                      ) : null}
                    </div>
                  </fieldset>
                  <div className="coupon-row">
                    <label className="sr-only" htmlFor="coupon">
                      Coupon code
                    </label>
                    <input
                      id="coupon"
                      value={couponInput}
                      onChange={(e) =>
                        setCouponInput(e.target.value.toUpperCase())
                      }
                      placeholder="Have a little savings code?"
                      maxLength={30}
                      disabled={busy || !!demoOrder}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCoupon(couponInput.trim().toUpperCase());
                        setError("");
                      }}
                      disabled={busy || !!demoOrder}
                    >
                      Apply
                    </button>
                  </div>
                  {coupon && (
                    <div className="coupon-applied">
                      Code: {coupon}
                      <button
                        type="button"
                        onClick={() => {
                          setCoupon("");
                          setCouponInput("");
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {quoteError && (
                    <p role="alert" className="error-message">
                      {quoteError}
                    </p>
                  )}
                  <div className="order-summary">
                    <div>
                      <span>
                        Products (
                        {lines.reduce((sum, l) => sum + l.quantity, 0)} packs)
                      </span>
                      <span>{money(totals?.subtotal_paise ?? subtotal)}</span>
                    </div>
                    {!!totals?.discount_paise && (
                      <div className="savings">
                        <span>A little saving ({totals.coupon})</span>
                        <span>−{money(totals.discount_paise)}</span>
                      </div>
                    )}
                    <div>
                      <span>Delivery</span>
                      <span>
                        {totals
                          ? totals.shipping_paise
                            ? money(totals.shipping_paise)
                            : "On us"
                          : "Enter PIN code"}
                      </span>
                    </div>
                    <div className="summary-total">
                      <strong>Your total</strong>
                      <strong>
                        {totals ? money(totals.total_paise) : "—"}
                      </strong>
                    </div>
                    <p>
                      Product prices include applicable taxes. Your final amount
                      is confirmed by the store before payment.
                    </p>
                  </div>
                </form>
              )}
              {demoOrder && (
                <div className="notice">
                  <strong>
                    Development payment — no money will be charged.
                  </strong>
                  <p>This backend is using its local mock gateway.</p>
                  <Button onClick={simulatePayment} disabled={busy}>
                    {busy ? "Confirming…" : "Simulate successful payment"}
                  </Button>
                  <button
                    className="text-link"
                    onClick={() => setDemoOrder(null)}
                  >
                    Return to checkout
                  </button>
                </div>
              )}
            </>
          )}
          {step === "confirmation" && confirmation && (
            <div className="confirmation">
              <CheckCircle2 size={49} strokeWidth={1.2} />
              <h3>
                {confirmation.payment_status === "PAID"
                  ? "Thank you for choosing FarmDirect."
                  : confirmation.payment_status === "REVIEW"
                    ? "Your payment needs a store review."
                    : "Your payment is being confirmed."}
              </h3>
              <p>
                {confirmation.payment_status === "PAID"
                  ? "Your order is in. We’ll get your little bag of goodness ready."
                  : "Please check your order status before starting another payment."}
              </p>
              <div className="confirmation-reference">
                <span>YOUR ORDER</span>
                <strong>{confirmation.reference}</strong>
                <small>Order ID: {confirmation.id}</small>
              </div>
              <details className="tracking-key">
                <summary>Save your tracking access key</summary>
                <p>
                  Keep this private. Use it with your order ID on the tracking
                  page.
                </p>
                <code>{confirmation.order_token}</code>
                <button
                  className="text-link"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `Order ID: ${confirmation.id}\nAccess key: ${confirmation.order_token}`,
                    );
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy order ID & key"}
                </button>
              </details>
              <Button asChild>
                <Link
                  href={`/track?id=${confirmation.id}`}
                  onClick={() => changeOpen(false)}
                >
                  Follow your order <ArrowRight size={17} />
                </Link>
              </Button>
              {confirmation.payment_status === "PENDING" && (
                <Button
                  variant="outline"
                  onClick={refreshStatus}
                  disabled={busy}
                >
                  {busy ? "Checking…" : "Check payment status"}
                </Button>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </div>
        {step === "bag" && !!lines.length && (
          <div className="drawer-footer">
            <div className="bag-subtotal">
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <p>Delivery and discounts calculated at checkout.</p>
            <Button
              onClick={() => {
                setStep("checkout");
                setError("");
              }}
              className="w-full"
            >
              Take me to checkout <ArrowRight size={18} />
            </Button>
            <span className="secure-note">
              <LockKeyhole size={12} /> Secure checkout · UPI, cards &
              netbanking
            </span>
          </div>
        )}
        {step === "checkout" && !!lines.length && !demoOrder && (
          <div className="drawer-footer">
            <Button
              type="submit"
              form="checkout-form"
              disabled={busy || quoteBusy || !totals || demoCatalog}
              className="w-full"
            >
              {busy ? (
                <>
                  <LoaderCircle size={18} className="spin" /> Opening secure
                  payment…
                </>
              ) : (
                <>
                  <LockKeyhole size={16} /> Continue to payment{" "}
                  {totals && money(totals.total_paise)}
                </>
              )}
            </Button>
            <span className="secure-note">
              Payments processed securely by Razorpay
            </span>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
