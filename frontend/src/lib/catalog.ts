import "server-only";
import data from "@/data/catalog.json";
import { demoCatalog } from "./api";
import type { Product } from "./types";

const serverBase = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function getProducts(
  category?: string,
  grade?: string,
): Promise<Product[]> {
  if (demoCatalog)
    return (data as Product[]).filter(
      (p) =>
        (!category || category === "all" || p.category === category) &&
        (!grade || p.grade === grade),
    );
  const query = new URLSearchParams();
  if (category && category !== "all") query.set("category", category);
  if (grade) query.set("grade", grade);
  const response = await fetch(`${serverBase}/api/products?${query}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new Error(
      "The catalog is temporarily unavailable. Please try again shortly.",
    );
  return response.json();
}

export async function getProduct(slug: string): Promise<Product | null> {
  if (demoCatalog)
    return (data as Product[]).find((p) => p.slug === slug) ?? null;
  const response = await fetch(
    `${serverBase}/api/products/${encodeURIComponent(slug)}`,
    { cache: "no-store", signal: AbortSignal.timeout(8000) },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("This product is temporarily unavailable.");
  return response.json();
}
