"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import type { CartLine, Product, ProductVariant } from "@/lib/types";

interface CartState {
  lines: CartLine[];
  open: boolean;
  hydrated: boolean;
  add: (product: Product, variant: ProductVariant, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
  setHydrated: (ready: boolean) => void;
}

const storedLines = z
  .array(
    z.object({
      variant_id: z.uuid(),
      product_slug: z.string().max(100),
      product_name: z.string().max(150),
      accent: z.string().max(20),
      weight_grams: z.number().int().positive(),
      price_paise: z.number().int().positive(),
      available_stock: z.number().int().nonnegative(),
      quantity: z.number().int().min(1).max(20),
    }),
  )
  .max(100);

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      open: false,
      hydrated: false,
      add: (product, variant, quantity = 1) =>
        set((state) => {
          const cap = Math.min(20, variant.available_stock);
          if (cap < 1) return {};
          const existing = state.lines.find(
            (line) => line.variant_id === variant.id,
          );
          if (existing)
            return {
              open: true,
              lines: state.lines.map((line) =>
                line.variant_id === variant.id
                  ? {
                      ...line,
                      price_paise: variant.price_paise,
                      available_stock: variant.available_stock,
                      quantity: Math.min(
                        cap,
                        line.quantity + Math.max(1, Math.floor(quantity)),
                      ),
                    }
                  : line,
              ),
            };
          return {
            open: true,
            lines: [
              ...state.lines,
              {
                variant_id: variant.id,
                product_slug: product.slug,
                product_name: product.name,
                accent: product.accent,
                weight_grams: variant.weight_grams,
                price_paise: variant.price_paise,
                available_stock: variant.available_stock,
                quantity: Math.min(cap, Math.max(1, Math.floor(quantity))),
              },
            ],
          };
        }),
      setQuantity: (id, quantity) =>
        set((state) => ({
          lines: state.lines.flatMap((line) =>
            line.variant_id !== id
              ? [line]
              : quantity <= 0
                ? []
                : [
                    {
                      ...line,
                      quantity: Math.max(
                        1,
                        Math.min(
                          20,
                          line.available_stock,
                          Math.floor(quantity),
                        ),
                      ),
                    },
                  ],
          ),
        })),
      remove: (id) =>
        set((state) => ({
          lines: state.lines.filter((line) => line.variant_id !== id),
        })),
      clear: () => set({ lines: [] }),
      setOpen: (open) => set({ open }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "farmdirect-bag-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lines: state.lines }),
      merge: (persisted, current) => {
        const result = storedLines.safeParse(
          (persisted as { lines?: unknown } | undefined)?.lines,
        );
        return { ...current, lines: result.success ? result.data : [] };
      },
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);

export const cartSubtotal = (lines: CartLine[]) =>
  lines.reduce((sum, line) => sum + line.price_paise * line.quantity, 0);
