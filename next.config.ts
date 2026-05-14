import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist precisa carregar dinamicamente pdf.worker.mjs relativo ao
  // módulo. O bundler do Next quebra esse resolve, então o mantemos external.
  serverExternalPackages: ["pdfjs-dist"],
  allowedDevOrigins: ["192.168.2.166"],
};

export default nextConfig;
