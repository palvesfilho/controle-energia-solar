import type { Metadata } from "next";
import { Poppins, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

/**
 * Ícone da aba: a faísca da AURA, mesma marca do logo da sidebar. Gerado por
 * `npx tsx scripts/gen-aura-icons.ts`.
 *
 * 🔑 Não existe mais `app/favicon.ico`: o Next o injetava em TODA rota, e ele
 * vencia o ícone declarado no portal do cliente — que por isso nunca aparecia
 * na aba. Com os ícones só no metadata, cada área fica com o seu, porque o
 * `icons` de um layout aninhado substitui o do pai (ver
 * `app/portal-cliente/layout.tsx` e `app/visao-cliente/layout.tsx`, que trocam
 * a faísca pelo sol da Rede Brasil Solar).
 */
export const metadata: Metadata = {
  title: "AURA - Gestão de Energia Solar",
  description: "Portal de acompanhamento de resultados de energia solar para investidores",
  icons: {
    icon: [
      // O 32 é o que a aba usa; o 192 atende atalho e tela de alta densidade.
      { url: "/brand/aura-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/aura-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider signInUrl="/login-clerk" signInForceRedirectUrl="/portal" signInFallbackRedirectUrl="/portal">
      <html
        lang="pt-BR"
        className={`${poppins.variable} ${inter.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
