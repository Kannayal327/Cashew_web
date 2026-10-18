"use client";

import Link from "next/link";
import { Plus, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { money, weight } from "@/lib/utils";
import { useCart } from "@/stores/cart";
import { ProductArtwork } from "./product-artwork";

export function ProductCard({ product }: { product: Product }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const variant =
    product.variants.find((v) => v.id === variantId) || product.variants[0];
  const add = useCart((state) => state.add);
  if (!variant) return null;
  return (
    <article className="product-card">
      <Link
        href={`/products/${product.slug}`}
        className="product-image-link"
        aria-label={`Explore ${product.name}`}
      >
        <ProductArtwork product={product} />
        {product.grade && <span className="grade-tag">{product.grade}</span>}
        <span className="product-explore">
          <ArrowUpRight size={19} />
        </span>
      </Link>
      <div className="product-info">
        <span className="eyebrow">{product.category.replaceAll("-", " ")}</span>
        <h3>
          <Link href={`/products/${product.slug}`}>{product.name}</Link>
        </h3>
        <p>{product.subtitle}</p>
        <div className="product-controls">
          <label className="sr-only" htmlFor={`weight-${product.id}`}>
            Pack weight for {product.name}
          </label>
          <select
            id={`weight-${product.id}`}
            value={variant.id}
            onChange={(event) => setVariantId(event.target.value)}
          >
            {product.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {weight(v.weight_grams)}
              </option>
            ))}
          </select>
          <strong>{money(variant.price_paise)}</strong>
          <button
            className="quick-add"
            onClick={() => add(product, variant)}
            disabled={variant.available_stock < 1}
            aria-label={`Add ${weight(variant.weight_grams)} ${product.name} to bag`}
          >
            <Plus size={21} />
          </button>
        </div>
        {variant.available_stock < 1 && (
          <span className="stock-label">Sold out for now</span>
        )}
      </div>
    </article>
  );
}
