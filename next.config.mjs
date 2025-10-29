/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {},
	serverExternalPackages: ["pdf-parse"],
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "avatar.vercel.sh",
			},
		],
	},
};

export default nextConfig;
