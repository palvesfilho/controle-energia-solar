import type { Metadata, Viewport } from "next";

/**
 * O manifest do PWA fica pendurado só aqui, e não no layout raiz, para que
 * apenas o Portal do Cliente seja instalável. O painel administrativo divide o
 * mesmo domínio e não deve virar app.
 */
export const metadata: Metadata = {
  title: "Portal do Cliente — Rede Brasil Solar",
  description:
    "Acompanhe a geração da sua usina solar, sua economia e seus relatórios mensais.",
  manifest: "/pwa/manifest.webmanifest",
  applicationName: "Brasil Solar",
  appleWebApp: {
    capable: true,
    title: "Brasil Solar",
    statusBarStyle: "default",
  },
  // Troca a faísca da AURA (layout raiz) pelo sol da Rede Brasil Solar: na aba,
  // no atalho e no iOS. O 32 é o tamanho que o navegador usa na aba.
  icons: {
    icon: [
      { url: "/pwa/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2E9B87",
  width: "device-width",
  initialScale: 1,
  // Ocupa a área do notch quando aberto como app instalado.
  viewportFit: "cover",
};

export default function PortalClienteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
