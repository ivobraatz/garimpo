/** @type {import('next').NextConfig} */
// Export estatico: o Tauri embute os arquivos de out/ no binario, entao nao ha
// servidor Node em producao.
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
