import type { Metadata } from "next";
import { Catalog } from "@/components/catalog";
import { getProducts } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shop the collection" };
export default async function Shop({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; grade?: string; q?: string }>;
}) {
  const [products, params] = await Promise.all([getProducts(), searchParams]);
  return (
    <Catalog
      products={products}
      full
      initialCategory={params.category || "all"}
      initialGrade={params.grade || "all"}
      initialSearch={params.q || ""}
    />
  );
}
