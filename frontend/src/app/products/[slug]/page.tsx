import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getProducts } from "@/lib/catalog";
import { ProductDetail } from "@/components/product-detail";
import { ProductCard } from "@/components/product-card";
import { Reviews } from "@/components/reviews";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  return {
    title: product?.name || "Product not found",
    description: product?.description,
  };
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const related = (await getProducts())
    .filter((item) => item.id !== product.id)
    .slice(0, 4);
  return (
    <>
      <div className="container product-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/shop">The collection</Link>
          <span>/</span>
          <span>{product.name}</span>
        </nav>
        <ProductDetail product={product} />
      </div>
      <Reviews productSlug={product.slug} />
      <section className="section">
        <div className="container">
          <span className="eyebrow">A FEW MORE GOOD THINGS</span>
          <h2>Make a little room.</h2>
          <div className="product-grid related-products">
            {related.map((item) => (
              <ProductCard product={item} key={item.id} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
