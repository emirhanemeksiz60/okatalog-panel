import type { NextConfig } from "next";

/** İstemci modülünde admin doğrulaması için build anında enjekte edilir. */
const nextConfig: NextConfig = {
  env: {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ibzqzeyptslotjujlthf.supabase.co",
        pathname: "/**",
      },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
