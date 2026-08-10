import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/campaigns/",
          "/home/",
          "/leads/",
          "/onboarding/",
          "/replies/",
          "/reports/",
          "/sequences/",
          "/settings/",
          "/suppressions/",
          "/system-health/",
          "/team/",
          "/templates/",
          // /owner is deliberately absent. Every path above is guessable from
          // the product's own navigation, so listing it costs nothing and stops
          // a crawler indexing a signed-in page. The operator portal is the one
          // path whose name is not otherwise discoverable, and robots.txt is
          // public: adding it here would publish the location of the most
          // privileged surface in the system to anyone who reads this file.
          // app/owner/layout.tsx sets a noindex, nofollow, nocache meta instead,
          // which is the stronger signal to any crawler that actually reaches it.
        ],
      },
    ],
    sitemap: `${env.APP_BASE_URL.replace(/\/$/, "")}/sitemap.xml`,
  };
}
