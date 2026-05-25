/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: false,
  },
};

// Cloudflare Pages dev hook — wires next-on-pages preview bindings into
// `next dev` so wrangler-style platform features (env, kv, etc.) are
// available locally. Only runs in dev; no-op for production builds.
if (process.env.NODE_ENV === 'development') {
  await import('@cloudflare/next-on-pages/next-dev').then(({ setupDevPlatform }) =>
    setupDevPlatform().catch(() => {
      // Fallback to plain `next dev` if the platform shim fails (e.g. no
      // wrangler.toml present). Atlas's Supabase env vars work either way.
    })
  );
}

export default nextConfig;
