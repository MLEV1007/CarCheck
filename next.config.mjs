/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        // A Supabase Storage-ban tárolt fotók/videók (hibák, borítókép) engedélyezett domain-je.
        // Cseréld le a saját Supabase projekt referenciádra.
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
