import type { NextConfig } from "next";
const config: NextConfig = {
    devIndicators: false,
    serverExternalPackages: ["pdfjs-dist"],
};
export default config;
