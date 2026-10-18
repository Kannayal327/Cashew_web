import Link from "next/link";
import { Check, Quote, Star } from "lucide-react";
import { demoCatalog } from "@/lib/api";

interface Review {
  id: string;
  customer_name: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
  verified_purchase: boolean;
}

export async function Reviews({ productSlug }: { productSlug?: string }) {
  let reviews: Review[] = [];
  let unavailable = false;
  if (!demoCatalog) {
    try {
      const base =
        process.env.API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:8000";
      const response = await fetch(
        `${base}/api/reviews?${productSlug ? `product_slug=${encodeURIComponent(productSlug)}&` : ""}limit=3`,
        { cache: "no-store", signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) throw new Error();
      reviews = await response.json();
    } catch {
      unavailable = true;
    }
  }
  return (
    <section className="reviews-section section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FROM THEIR TABLES TO YOURS</span>
            <h2>
              Little notes.
              <br />
              Real everyday moments.
            </h2>
          </div>
          <p>
            Reviews from delivered orders.
            <br />
            Every published review comes from a verified purchase.
          </p>
        </div>
        {reviews.length ? (
          <div className="review-grid">
            {reviews.map((review) => (
              <article key={review.id} className="review-card">
                <div
                  className="review-stars"
                  aria-label={`${review.rating} out of 5 stars`}
                >
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={14}
                      fill={star <= review.rating ? "currentColor" : "none"}
                    />
                  ))}
                </div>
                <h3>{review.title}</h3>
                <p>“{review.body}”</p>
                <div>
                  <strong>{review.customer_name}</strong>
                  <span>
                    <Check size={12} /> Verified purchase
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="review-empty">
            <Quote size={35} strokeWidth={1} />
            <div>
              <h3>
                {unavailable
                  ? "The little notes are taking a moment."
                  : "Your everyday moment could be the first."}
              </h3>
              <p>
                {unavailable
                  ? "Please check back shortly for customer reviews."
                  : "Enjoyed a FarmDirect delivery? Share your experience from your order tracking page."}
              </p>
            </div>
            <Link href="/track" className="text-link">
              Find your order →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
