"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
  Boxes,
  ClipboardList,
  LogOut,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { TrackingOrder } from "@/lib/types";
import { cn, money, weight } from "@/lib/utils";
import { Button } from "./ui/button";

interface Inventory {
  id: string;
  sku: string;
  product_name: string;
  weight_grams: number;
  price_paise: number;
  stock_on_hand: number;
  reserved_stock: number;
  available_stock: number;
}
interface AdminOrder extends TrackingOrder {
  email: string;
  address: {
    name: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
  };
}
interface Review {
  id: string;
  customer_name: string;
  rating: number;
  title: string;
  body: string;
  approved: boolean;
}
const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

export function AdminDashboard() {
  // Tokens deliberately stay in memory; a page refresh requires signing in.
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<"orders" | "inventory" | "reviews">("orders");
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [approved, setApproved] = useState(false);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    const options = { headers: { Authorization: `Bearer ${token}` } };
    try {
      if (tab === "orders")
        setOrders(
          await api<AdminOrder[]>(
            `/api/admin/orders?limit=20&offset=${offset}`,
            options,
          ),
        );
      else if (tab === "inventory")
        setInventory(
          await api<Inventory[]>(
            `/api/admin/inventory?limit=20&offset=${offset}`,
            options,
          ),
        );
      else
        setReviews(
          await api<Review[]>(
            `/api/admin/reviews?approved=${approved}&limit=20&offset=${offset}`,
            options,
          ),
        );
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) setToken("");
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load the farm desk.",
      );
    } finally {
      setBusy(false);
    }
  }, [token, tab, offset, approved]);
  useEffect(() => {
    void load();
  }, [load]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const credentials = loginSchema.safeParse({
      email: data.get("email"),
      password: data.get("password"),
    });
    if (!credentials.success) {
      setError("Enter a valid email and password.");
      setBusy(false);
      return;
    }
    try {
      const result = await api<{ access_token: string }>(
        "/api/admin/auth/login",
        { method: "POST", body: JSON.stringify(credentials.data) },
      );
      setToken(result.access_token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(path: string, body: unknown) {
    setError("");
    try {
      await api(path, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      await load();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) setToken("");
      setError(reason instanceof Error ? reason.message : "Could not save.");
      throw reason;
    }
  }

  if (!token)
    return (
      <div className="admin-login">
        <ShieldCheck size={30} strokeWidth={1.4} />
        <h2>A little care behind the scenes.</h2>
        <p>Sign in to manage inventory, orders, and customer reviews.</p>
        <form onSubmit={login}>
          <label>
            Administrator email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <Button disabled={busy}>
            {busy ? "Signing in…" : "Open the farm desk"}
          </Button>
        </form>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  const count =
    tab === "orders"
      ? orders.length
      : tab === "inventory"
        ? inventory.length
        : reviews.length;
  return (
    <div className="admin-dashboard">
      <div className="admin-toolbar">
        <div className="admin-tabs">
          {(
            [
              ["orders", "Orders", ClipboardList],
              ["inventory", "Inventory", Boxes],
              ["reviews", "Reviews", MessageSquare],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              className={cn(tab === value && "active")}
              onClick={() => {
                setTab(value);
                setOffset(0);
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <div className="admin-actions">
          <button
            className="icon-button"
            aria-label="Refresh data"
            onClick={load}
            disabled={busy}
          >
            <RefreshCw size={18} className={busy ? "spin" : ""} />
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setToken("");
              setOrders([]);
              setInventory([]);
              setReviews([]);
            }}
          >
            <LogOut size={15} /> Sign out
          </Button>
        </div>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {tab === "orders" && (
        <div className="admin-orders">
          {orders.length ? (
            orders.map((order) => (
              <AdminOrderCard
                order={order}
                key={order.id}
                update={(payload) =>
                  mutate(`/api/admin/orders/${order.id}/status`, payload)
                }
              />
            ))
          ) : (
            <p className="empty-state">No orders on this page.</p>
          )}
        </div>
      )}
      {tab === "inventory" && (
        <div className="table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Product / pack</th>
                <th>Price</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Update stock</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <InventoryRow
                  item={item}
                  key={`${item.id}-${item.stock_on_hand}`}
                  update={(stock) =>
                    mutate(`/api/admin/inventory/${item.id}`, {
                      stock_on_hand: stock,
                      expected_stock_on_hand: item.stock_on_hand,
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "reviews" && (
        <>
          <label className="admin-review-filter">
            Show
            <select
              value={String(approved)}
              onChange={(event) => {
                setApproved(event.target.value === "true");
                setOffset(0);
              }}
            >
              <option value="false">Unpublished reviews</option>
              <option value="true">Published reviews</option>
            </select>
          </label>
          <div className="admin-review-grid">
            {reviews.length ? (
              reviews.map((review) => (
                <article key={review.id} className="review-card">
                  <span className="eyebrow">
                    {review.rating}/5 · {review.customer_name}
                  </span>
                  <h3>{review.title}</h3>
                  <p>{review.body}</p>
                  <Button
                    size="sm"
                    onClick={() =>
                      void mutate(`/api/admin/reviews/${review.id}`, {
                        approved: !review.approved,
                      }).catch(() => {})
                    }
                  >
                    {review.approved ? "Unpublish review" : "Publish review"}
                  </Button>
                </article>
              ))
            ) : (
              <p>No reviews on this page.</p>
            )}
          </div>
        </>
      )}
      <div className="admin-pagination">
        <Button
          variant="outline"
          size="sm"
          disabled={!offset || busy}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Previous
        </Button>
        <span>Page {offset / 20 + 1}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={count < 20 || busy}
          onClick={() => setOffset(offset + 20)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function InventoryRow({
  item,
  update,
}: {
  item: Inventory;
  update: (stock: number) => Promise<void>;
}) {
  const [stock, setStock] = useState(item.stock_on_hand);
  const [saving, setSaving] = useState(false);
  return (
    <tr>
      <td>
        <strong>{item.product_name}</strong>
        <small>
          {weight(item.weight_grams)} · {item.sku}
        </small>
      </td>
      <td>{money(item.price_paise)}</td>
      <td>{item.stock_on_hand}</td>
      <td>{item.reserved_stock}</td>
      <td>
        <span
          className={
            item.available_stock < 10 ? "inventory-low" : "inventory-ok"
          }
        >
          {item.available_stock}
        </span>
      </td>
      <td>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await update(stock);
            } catch {
              /* Parent displays the error. */
            } finally {
              setSaving(false);
            }
          }}
        >
          <input
            aria-label={`New on-hand stock for ${item.sku}`}
            type="number"
            min={item.reserved_stock}
            max={1000000}
            required
            value={stock}
            onChange={(event) => setStock(Number(event.target.value))}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={saving || stock === item.stock_on_hand}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>
      </td>
    </tr>
  );
}

function AdminOrderCard({
  order,
  update,
}: {
  order: AdminOrder;
  update: (payload: unknown) => Promise<void>;
}) {
  const [carrier, setCarrier] = useState(order.carrier || "");
  const [tracking, setTracking] = useState(order.tracking_number || "");
  const [busy, setBusy] = useState(false);
  const next = (
    {
      PLACED: "PACKED",
      PACKED: "SHIPPED",
      SHIPPED: "DELIVERED",
      DELIVERED: "",
    } as const
  )[order.status];
  return (
    <article className="admin-order-card">
      <div className="admin-order-top">
        <div>
          <span className="eyebrow">{order.reference}</span>
          <h3>{order.address.name}</h3>
          <small>{new Date(order.created_at).toLocaleString("en-IN")}</small>
        </div>
        <div>
          <span
            className={`status-pill status-${order.payment_status.toLowerCase()}`}
          >
            {order.payment_status}
          </span>
          <strong>{money(order.total_paise)}</strong>
        </div>
      </div>
      <div className="admin-order-body">
        <div>
          <p>
            {order.address.line1},{" "}
            {order.address.line2 && `${order.address.line2}, `}
            {order.address.city}, {order.address.state} {order.address.pincode}
          </p>
          <p>
            {order.email} · {order.address.phone}
          </p>
          <ul>
            {order.items.map((item, index) => (
              <li key={index}>
                {item.product_name} · {weight(item.weight_grams)} ×{" "}
                {item.quantity}
              </li>
            ))}
          </ul>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await update({
                status: next,
                carrier: carrier || null,
                tracking_number: tracking || null,
              });
            } catch {
              /* Parent displays the error. */
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="eyebrow">FULFILMENT: {order.status}</span>
          {order.status === "PACKED" && (
            <>
              <label>
                Carrier
                <input
                  required
                  value={carrier}
                  maxLength={100}
                  onChange={(event) => setCarrier(event.target.value)}
                />
              </label>
              <label>
                Tracking number
                <input
                  required
                  value={tracking}
                  maxLength={100}
                  onChange={(event) => setTracking(event.target.value)}
                />
              </label>
            </>
          )}
          {next && (
            <Button
              size="sm"
              disabled={busy || order.payment_status !== "PAID"}
            >
              {busy ? "Saving…" : `Mark ${next.toLowerCase()}`}
            </Button>
          )}
          {order.payment_status === "REVIEW" && (
            <p className="error-message">
              Review captured payments and stock in the store and Razorpay
              dashboard. Refund or reconcile before fulfilment.
            </p>
          )}
        </form>
      </div>
    </article>
  );
}
