"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, LockKeyhole, Package, Truck } from "lucide-react";
import { api } from "@/lib/api";
import type { TrackingOrder } from "@/lib/types";
import { money, weight } from "@/lib/utils";
import { Button } from "./ui/button";

export function Tracking({ initialId = "" }: { initialId?: string }) {
  const [id, setId] = useState(initialId);
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<TrackingOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const orderId =
      initialId || sessionStorage.getItem("farmdirect-last-order") || "";
    setId(orderId);
    setToken(sessionStorage.getItem(`farmdirect-order-${orderId}`) || "");
  }, [initialId]);
  async function track(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setOrder(null);
    try {
      const data = await api<TrackingOrder>(
        `/api/orders/${encodeURIComponent(id)}/track`,
        { headers: { "X-Order-Token": token } },
      );
      setOrder(data);
      sessionStorage.setItem(`farmdirect-order-${id}`, token);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not find this order.",
      );
    } finally {
      setBusy(false);
    }
  }
  const statuses = ["PLACED", "PACKED", "SHIPPED", "DELIVERED"];
  return (
    <div className="tracking-grid">
      <div>
        <form className="tracking-form" onSubmit={track}>
          <h2>Where’s your little bag of goodness?</h2>
          <p>
            Use the order ID and private access key shown after checkout.
            Details saved in this browser session are filled in for you.
          </p>
          <label>
            Order ID
            <input
              required
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setToken(
                  sessionStorage.getItem(
                    `farmdirect-order-${e.target.value}`,
                  ) || "",
                );
              }}
              placeholder="Full order ID from your confirmation"
            />
          </label>
          <label>
            Private tracking access key
            <input
              required
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Your 64-character access key"
            />
          </label>
          <Button disabled={busy}>
            {busy ? "Finding your order…" : "Find my order"} <Truck size={17} />
          </Button>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <span className="secure-note">
            <LockKeyhole size={13} /> Your address and contact details stay
            private.
          </span>
        </form>
      </div>
      {order && (
        <div className="tracking-result">
          <span className="eyebrow">{order.reference}</span>
          <h2>
            {order.payment_status === "PAID"
              ? order.status === "DELIVERED"
                ? "A little goodness, delivered."
                : "Your order is on its journey."
              : order.payment_status === "EXPIRED"
                ? "This checkout has expired."
                : order.payment_status === "REVIEW"
                  ? "Your payment needs a store review."
                  : "Awaiting payment confirmation."}
          </h2>
          <div className="tracking-payment">
            Payment: <strong>{order.payment_status}</strong> ·{" "}
            {money(order.total_paise)}
          </div>
          {order.payment_status === "PAID" && (
            <ol className="tracking-steps">
              {statuses.map((status, index) => (
                <li
                  key={status}
                  className={
                    index <= statuses.indexOf(order.status) ? "completed" : ""
                  }
                >
                  <span>
                    {index < statuses.indexOf(order.status) ? (
                      <Check size={14} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {status.toLowerCase()}
                </li>
              ))}
            </ol>
          )}
          {order.carrier && (
            <div className="shipment-info">
              <Truck size={20} />
              <div>
                <strong>{order.carrier}</strong>
                <p>Tracking number: {order.tracking_number}</p>
              </div>
            </div>
          )}
          <div className="tracking-items">
            {order.items.map((item, index) => (
              <div key={index}>
                <Package size={19} />
                <span>
                  {item.product_name}
                  <small>
                    {weight(item.weight_grams)} × {item.quantity}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <ul className="tracking-events">
            {order.events.map((event, i) => (
              <li key={i}>
                <span className="event-dot" />
                <div>
                  <p>{event.message}</p>
                  <time>
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(event.created_at))}
                  </time>
                </div>
              </li>
            ))}
          </ul>
          {order.status === "DELIVERED" && order.payment_status === "PAID" && (
            <ReviewForm order={order} token={token} />
          )}
          <Link href="/shop" className="text-link">
            Find a little more goodness →
          </Link>
        </div>
      )}
    </div>
  );
}

function ReviewForm({ order, token }: { order: TrackingOrder; token: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ message: string }>(
        `/api/products/${encodeURIComponent(String(data.get("product")))}/reviews`,
        {
          method: "POST",
          headers: { "X-Order-Token": token },
          body: JSON.stringify({
            order_id: order.id,
            rating: Number(data.get("rating")),
            title: data.get("title"),
            body: data.get("body"),
          }),
        },
      );
      setMessage(result.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not submit your review.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="review-form-panel">
      <summary>
        <CheckCircle2 size={19} /> Share a verified-purchase review
      </summary>
      <form className="review-form" onSubmit={submit}>
        <label>
          Your product
          <select name="product">
            {Array.from(
              new Map(
                order.items.map((item) => [item.product_slug, item]),
              ).values(),
            ).map((item) => (
              <option value={item.product_slug} key={item.product_slug}>
                {item.product_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Your rating
          <select name="rating" defaultValue="5">
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} out of 5
              </option>
            ))}
          </select>
        </label>
        <label>
          A few words
          <input
            name="title"
            required
            minLength={3}
            maxLength={100}
            placeholder="Your review title"
          />
        </label>
        <label>
          Your experience
          <textarea
            name="body"
            required
            minLength={10}
            maxLength={1000}
            rows={4}
          />
        </label>
        <p>
          Your first name will appear with your review after moderation. Please
          leave out private details.
        </p>
        <Button disabled={busy}>
          {busy ? "Sending…" : "Share your review"}
        </Button>
        <p aria-live="polite">{message}</p>
      </form>
    </details>
  );
}
