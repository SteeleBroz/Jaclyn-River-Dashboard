/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow larger request bodies for image uploads (screenshots can be 3-5MB)
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        source: '/api/tasks/instagram-engagement/generate-comment',
        headers: [
          { key: 'x-vercel-max-request-size', value: '10mb' },
        ],
      },
    ]
  },
}
module.exports = nextConfig
