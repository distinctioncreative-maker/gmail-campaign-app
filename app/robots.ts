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
        ],
      },
    ],
    sitemap: `${env.APP_BASE_URL.replace(/\/$/, "")}/sitemap.xml`,
  };
}
