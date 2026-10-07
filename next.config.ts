import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // テンプレートごとのページは廃止した。以前の URL はトップへ転送する
  async redirects() {
    return [
      { source: "/t/:path*", destination: "/", permanent: false },
      { source: "/new", destination: "/", permanent: false },
    ];
  },
  // create-next-app 16.4 の雛形は postcss.config を作らず、この loader で Tailwind を処理する
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
