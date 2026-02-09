const nextConfig = {
    devIndicators: {
        buildActivity: false,
        appIsrStatus: false,
    },
    experimental: {
        optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
    },
};

export default nextConfig;
