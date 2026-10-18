import Image from "next/image";
import { Leaf } from "lucide-react";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProductArtwork({
  product,
  large = false,
}: {
  product: Pick<Product, "category" | "accent" | "grade" | "name">;
  large?: boolean;
}) {
  const butter = product.category === "cashew-butter";
  const hamper = product.category === "festive-hampers";
  return (
    <div
      className={cn(
        "product-artwork",
        `art-${product.accent}`,
        large && "art-large",
      )}
      role="img"
      aria-label={`Illustrative ${product.name} packaging`}
    >
      <div className="art-orbit" />
      <div className="art-shadow" />
      <div className={cn("pack", butter && "pack-jar", hamper && "pack-box")}>
        <div className="pack-seal" />
        <div className="pack-brand">
          <Leaf size={17} strokeWidth={1.4} />
          <span>
            FarmDirect<span>CASHEWS</span>
          </span>
        </div>
        <div className="pack-label">
          <span>
            {butter
              ? "Naturally smooth"
              : hamper
                ? "From the farm, with love"
                : "From one origin"}
          </span>
          <strong>
            {butter ? (
              <>
                Cashew
                <br />
                Butter
              </>
            ) : hamper ? (
              <>
                A little box
                <br />
                of goodness.
              </>
            ) : (
              <>
                Pure cashew
                <br />
                goodness.
              </>
            )}
          </strong>
        </div>
        <div className="pack-window">
          <Image
            src="/images/cashews-hero.png"
            alt=""
            fill
            sizes={large ? "200px" : "120px"}
            className="object-cover"
          />
        </div>
        <div className="pack-bottom">
          {product.grade ||
            (butter
              ? "100% CASHEWS"
              : hamper
                ? "THE FARMHOUSE COLLECTION"
                : "SEASONED WITH CARE")}
          <span>FARMDIRECT</span>
        </div>
      </div>
      <span className="art-note">Packaging illustration</span>
    </div>
  );
}
