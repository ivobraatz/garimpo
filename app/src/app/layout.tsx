import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

// As fontes vêm do pacote, não de CDN: o CSP do Tauri bloqueia rede externa e
// o app precisa abrir sem conexão.
export const metadata: Metadata = {
  title: "Garimpo",
  description: "Separa o contato que vale do cadastro bruto de CNPJ",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      style={{
        "--fonte-sans": GeistSans.style.fontFamily,
        "--fonte-mono": GeistMono.style.fontFamily,
      } as React.CSSProperties}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
