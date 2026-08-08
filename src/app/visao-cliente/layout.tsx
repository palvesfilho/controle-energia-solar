import type { Metadata, Viewport } from "next";

/**
 * A Visão do cliente mora fora de `/portal-cliente`, então não herda o manifest
 * pendurado no layout de lá. Sem manifest o Chrome não considera a página
 * instalável e nunca dispara o `beforeinstallprompt` — ou seja, o botão
 * "Instalar app" da barra de prévia ficaria morto. Por isso o manifest é
 * repetido aqui.
 *
 * É o MESMO manifest do portal: o `start_url` continua sendo `/portal-cliente`,
 * então instalar por aqui cria o ícone do portal real, não da prévia.
 *
 * O painel administrativo em si segue sem manifest, de propósito — só o portal
 * do cliente e esta prévia dele viram app.
 */
export const metadata: Metadata = {
  title: "Visão do cliente — Rede Brasil Solar",
  // A prévia é uma tela interna: não deve aparecer em busca.
  robots: { index: false, follow: false },
  manifest: "/pwa/manifest.webmanifest",
  applicationName: "Brasil Solar",
  // Sol da Rede Brasil Solar também aqui: a prévia tem que parecer com o que o
  // cliente vê, inclusive na aba.
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
};

export default function VisaoClienteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
