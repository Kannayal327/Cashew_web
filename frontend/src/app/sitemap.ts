import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const products = await getProducts();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.9 },
    ...products.map((product) => ({
      url: `${base}/products/${product.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
