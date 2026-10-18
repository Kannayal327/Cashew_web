import { beforeEach, describe, expect, it } from "vitest";
import data from "@/data/catalog.json";
import type { Product } from "@/lib/types";
import { cartSubtotal, useCart } from "./cart";
import { money } from "@/lib/utils";

const product = data[0] as Product;
const variant = product.variants[0];

describe("shopping bag", () => {
  beforeEach(() => useCart.setState({ lines: [], open: false }));
  it("merges the same pack and keeps different weights separate", () => {
    useCart.getState().add(product, variant, 2);
    useCart.getState().add(product, variant, 1);
    useCart.getState().add(product, product.variants[1], 1);
    expect(useCart.getState().lines.map((line) => line.quantity)).toEqual([
      3, 1,
    ]);
    expect(cartSubtotal(useCart.getState().lines)).toBe(
      variant.price_paise * 3 + product.variants[1].price_paise,
    );
  });
  it("caps quantity by available stock and does not add sold-out packs", () => {
    useCart.getState().add(product, { ...variant, available_stock: 2 }, 5);
    expect(useCart.getState().lines[0].quantity).toBe(2);
    useCart
      .getState()
      .add(product, { ...product.variants[1], available_stock: 0 });
    expect(useCart.getState().lines).toHaveLength(1);
  });
  it("removes a line when quantity reaches zero", () => {
    useCart.getState().add(product, variant);
    useCart.getState().setQuantity(variant.id, 0);
    expect(useCart.getState().lines).toEqual([]);
  });
  it("keeps prices in paise and renders fractional rupees", () => {
    expect(money(32900)).toBe("₹329");
    expect(money(66120)).toBe("₹661.20");
  });
});
