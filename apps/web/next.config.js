/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@sto-crm/shared'],
};

module.exports = nextConfig;
