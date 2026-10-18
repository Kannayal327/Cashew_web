"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, Search } from "lucide-react";
import type { Product } from "@/lib/types";
import { categories, cn } from "@/lib/utils";
import { ProductCard } from "./product-card";

export function Catalog({
  products,
  full = false,
  initialCategory = "all",
  initialGrade = "all",
  initialSearch = "",
}: {
  products: Product[];
  full?: boolean;
  initialCategory?: string;
  initialGrade?: string;
  initialSearch?: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [grade, setGrade] = useState(initialGrade);
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState("featured");
  const filtered = useMemo(() => {
    let items = products.filter(
      (product) =>
        (category === "all" || product.category === category) &&
        (grade === "all" || product.grade === grade) &&
        `${product.name} ${product.subtitle}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
    if (sort !== "featured")
      items = [...items].sort(
        (a, b) =>
          (a.variants[0]?.price_paise || 0) - (b.variants[0]?.price_paise || 0),
      );
    if (sort === "price-desc") items.reverse();
    return !full && category === "all" && grade === "all" && !search
      ? items.slice(0, 4)
      : items;
  }, [products, category, grade, search, sort, full]);
  return (
    <section id="catalog" className="section catalog-section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">GOODNESS, IN EVERY KIND</span>
            <h2>
              {full ? (
                "Find your kind of cashew."
              ) : (
                <>
                  Meet your everyday
                  <br className="desktop-break" /> little luxuries.
                </>
              )}
            </h2>
          </div>
          <p>
            Whole, roasted, blended, or ready to gift.
            <br />
            There’s a little goodness for every moment.
          </p>
        </div>
        <div
          className="category-tabs"
          role="group"
          aria-label="Filter by category"
        >
          {categories.map((item) => (
            <button
              key={item.slug}
              className={cn("category-tab", category === item.slug && "active")}
              onClick={() => setCategory(item.slug)}
              aria-pressed={category === item.slug}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="catalog-toolbar">
          <span className="result-count">
            {filtered.length} thoughtful picks
          </span>
          <div className="catalog-filters">
            {full && (
              <label className="search-field">
                <Search size={16} />
                <input
                  aria-label="Search cashews"
                  placeholder="Find your favourite"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            )}
            <label className="filter-label">
              <SlidersHorizontal size={15} />
              <span className="sr-only">Filter grade</span>
              <select
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                aria-label="Filter by grade"
              >
                <option value="all">All grades</option>
                {["W-180", "W-240", "W-320", "Splits"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            {full && (
              <select
                aria-label="Sort products"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
              </select>
            )}
          </div>
        </div>
        {filtered.length ? (
          <div className="product-grid">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No cashews found just yet.</h3>
            <p>Try another grade, category, or search.</p>
            <button
              className="text-link"
              onClick={() => {
                setCategory("all");
                setGrade("all");
                setSearch("");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
