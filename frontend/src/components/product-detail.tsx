"use client";

import { useState } from "react";
import {
  Check,
  Leaf,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { api, demoCatalog } from "@/lib/api";
import type { Product } from "@/lib/types";
import { money, weight, cn } from "@/lib/utils";
import { useCart } from "@/stores/cart";
import { ProductArtwork } from "./product-artwork";
import { Button } from "./ui/button";

export function ProductDetail({ product }: { product: Product }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [pincode, setPincode] = useState("");
  const [delivery, setDelivery] = useState("");
  const [checking, setChecking] = useState(false);
  const add = useCart((state) => state.add);
  const variant =
    product.variants.find((v) => v.id === variantId) || product.variants[0];
  if (!variant) return <p>Pack options are temporarily unavailable.</p>;
  async function checkDelivery(event: React.FormEvent) {
    event.preventDefault();
    setChecking(true);
    if (demoCatalog) {
      setDelivery(
        "Delivery checks are available when the store backend is connected.",
      );
      setChecking(false);
      return;
    }
    try {
      const result = await api<{
        serviceable: boolean;
        estimate: string;
        shipping_fee_paise: number;
        free_shipping_threshold_paise: number;
      }>(`/api/delivery/${pincode}`);
      setDelivery(
        result.serviceable
          ? `We deliver here in ${result.estimate}. ${money(result.shipping_fee_paise)} delivery, free from ${money(result.free_shipping_threshold_paise)} after discounts.`
          : "We don’t deliver here just yet. Please try another PIN.",
      );
    } catch (error) {
      setDelivery(
        error instanceof Error ? error.message : "Could not check delivery.",
      );
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="product-detail-grid">
      <div className="detail-art">
        <ProductArtwork product={product} large />
        <div className="detail-image-caption">
          <Leaf size={15} /> Illustrative packaging. Refer to the actual pack
          for product details.
        </div>
      </div>
      <div className="detail-copy">
        <span className="eyebrow">
          {product.category.replaceAll("-", " ")}{" "}
          {product.grade && ` / ${product.grade}`}
        </span>
        <h1>{product.name}</h1>
        <p className="detail-subtitle">{product.subtitle}</p>
        <p>{product.description}</p>
        <div className="detail-price">
          <strong>{money(variant.price_paise)}</strong>
          <span>
            for {weight(variant.weight_grams)} · inclusive of applicable taxes
          </span>
        </div>
        <fieldset className="weight-selector">
          <legend>YOUR KIND OF HANDFUL</legend>
          {product.variants.map((item) => (
            <button
              type="button"
              key={item.id}
              className={cn(
                "weight-option",
                item.id === variant.id && "selected",
              )}
              aria-pressed={item.id === variant.id}
              onClick={() => {
                setVariantId(item.id);
                setQuantity(1);
              }}
              disabled={!item.available_stock}
            >
              <strong>{weight(item.weight_grams)}</strong>
              <span>{money(item.price_paise)}</span>
              {item.id === variant.id && <Check size={13} />}
            </button>
          ))}
        </fieldset>
        <div className="detail-add">
          <div className="quantity-control">
            <button
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => setQuantity(quantity - 1)}
            >
              <Minus size={16} />
            </button>
            <span aria-live="polite">{quantity}</span>
            <button
              aria-label="Increase quantity"
              disabled={quantity >= Math.min(20, variant.available_stock)}
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus size={16} />
            </button>
          </div>
          <Button
            onClick={() => add(product, variant, quantity)}
            disabled={!variant.available_stock}
          >
            <ShoppingBag size={18} />{" "}
            {variant.available_stock
              ? `Add to your bag · ${money(variant.price_paise * quantity)}`
              : "Sold out for now"}
          </Button>
        </div>
        <div className="detail-trust">
          <span>
            <ShieldCheck size={15} /> Secure payment
          </span>
          <span>
            <Leaf size={15} /> Single-origin collection
          </span>
        </div>
        <form className="delivery-check" onSubmit={checkDelivery}>
          <label htmlFor="product-pin">
            <Truck size={19} /> Is a little goodness on its way to you?
          </label>
          <div>
            <input
              id="product-pin"
              required
              inputMode="numeric"
              pattern="[1-9][0-9]{5}"
              maxLength={6}
              placeholder="Your 6-digit PIN code"
              value={pincode}
              onChange={(event) =>
                setPincode(event.target.value.replace(/\D/g, ""))
              }
            />
            <button disabled={checking}>
              {checking ? "Checking…" : "Check"}
            </button>
          </div>
          <p aria-live="polite">{delivery}</p>
        </form>
        <div className="product-accordion">
          <details open>
            <summary>
              Ingredients & allergens<span>+</span>
            </summary>
            <p>
              {product.ingredients}. Contains cashews (tree nuts). Check the
              actual pack for complete allergen and cross-contact declarations.
            </p>
          </details>
          <details>
            <summary>
              Storage & freshness<span>+</span>
            </summary>
            <p>
              Store tightly sealed in a cool, dry place, away from sunlight.
              Follow the best-before date and any additional instructions on
              your pack.
            </p>
          </details>
          <details>
            <summary>
              Shipping & order updates<span>+</span>
            </summary>
            <p>
              Check your PIN code above for availability. Delivery is estimated
              at checkout. Follow your order with its ID and private tracking
              access key.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
