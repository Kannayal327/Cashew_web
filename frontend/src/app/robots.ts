import type { MetadataRoute } from "next";
import { demoCatalog } from "@/lib/api";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: demoCatalog ? undefined : "/",
      disallow: demoCatalog ? "/" : ["/admin", "/track"],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/sitemap.xml`,
  };
}
