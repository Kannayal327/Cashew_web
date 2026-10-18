"use client";

import Link from "next/link";
import { Leaf, ShoppingBag, Search, Menu, X, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "@/stores/cart";
import { demoCatalog } from "@/lib/api";

export function Header() {
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const lines = useCart((state) => state.lines);
  const hydrated = useCart((state) => state.hydrated);
  const setOpen = useCart((state) => state.setOpen);
  const count = hydrated
    ? lines.reduce((sum, line) => sum + line.quantity, 0)
    : 0;
  useEffect(() => {
    void Promise.resolve(useCart.persist.rehydrate()).finally(() =>
      useCart.getState().setHydrated(true),
    );
  }, []);
  return (
    <>
      <div className="announcement">
        <span>A little closer to the farm. A whole lot of goodness.</span>
        <Link href="/shop">
          Find your favourites <ArrowUpRight size={13} />
        </Link>
      </div>
      {demoCatalog && (
        <div className="demo-banner">
          Storefront preview · Sample catalog and prices · Checkout is disabled
        </div>
      )}
      <header className="site-header">
        <div className="container header-inner">
          <Link href="/" className="brand" aria-label="FarmDirect Cashews home">
            <span className="brand-mark">
              <Leaf size={27} strokeWidth={1.4} />
            </span>
            <span>
              FarmDirect<small>CASHEWS · STRAIGHT FROM THE SOURCE</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            <Link href="/shop">Shop cashews</Link>
            <Link href="/#our-story">Our roots</Link>
            <Link href="/#grade-guide">Know your cashews</Link>
            <Link href="/shop?category=festive-hampers">
              Gifting <span className="nav-new">WITH LOVE</span>
            </Link>
          </nav>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Search products"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search size={20} />
            </button>
            <button
              className="icon-button bag-button"
              aria-label={`Open shopping bag, ${count} items`}
              onClick={() => setOpen(true)}
            >
              <ShoppingBag size={21} />
              <span className="bag-count">{count}</span>
            </button>
            <button
              className="icon-button mobile-menu-toggle"
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={23} /> : <Menu size={23} />}
            </button>
          </div>
        </div>
        {searchOpen && (
          <form
            action="/shop"
            className="header-search container"
            onSubmit={() => setSearchOpen(false)}
          >
            <Search size={19} />
            <input
              name="q"
              autoFocus
              placeholder="Try whole cashews, pepper, or butter…"
              aria-label="Search the shop"
            />
            <button className="text-link" type="submit">
              Search →
            </button>
          </form>
        )}
        {menu && (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            {[
              ["/shop", "Shop all cashews"],
              ["/#our-story", "Our roots"],
              ["/#grade-guide", "Know your cashews"],
              ["/shop?category=festive-hampers", "Thoughtful gifting"],
              ["/track", "Track your order"],
            ].map(([href, label]) => (
              <Link key={href} href={href} onClick={() => setMenu(false)}>
                {label}
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </nav>
        )}
      </header>
    </>
  );
}
