import type {NextConfig} from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
    output: 'standalone',
    pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],
    typescript: {
        ignoreBuildErrors: true,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'avatars.githubusercontent.com',
                pathname: '/**',
            },
        ],
    },
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: isProd
                    ? 'http://your-production-api:8080/:path*'
                    : 'http://localhost:8080/:path*',
            },
        ];
    },
};

export default nextConfig;
