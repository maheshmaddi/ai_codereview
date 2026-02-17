/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@opencode-ai/sdk'],
  },
}

module.exports = nextConfig
