import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { CartBar } from "@/components/CartBar";
import { CartProvider } from "@/components/CartProvider";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Medicao } from "@/components/Medicao";
import { Rastreio } from "@/components/Rastreio";
import { Roleta } from "@/components/Roleta";
import { WhatsAppFlutuante } from "@/components/WhatsAppFlutuante";
import { SITE, SITE_URL } from "@/lib/config";
import "./globals.css";

// Todas as páginas se refazem a cada 60 s: é assim que os avisos da Black Friday somem sozinhos depois do prazo,
// inclusive nas páginas sem dados do banco (/entrega, /obrigado).
export const revalidate = 60;

// 300 é o traço leve do título da primeira tela; 500 e 600 são os títulos e preços do resto do site.
const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["300", "500", "600"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const descricao =
  "Carpas Nishikigoi criadas e selecionadas em São José do Rio Preto - SP. Catálogo online, entrega em até 3 dias úteis e garantia de envio.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE.nome} — ${SITE.tagline}`, template: `%s | ${SITE.nome}` },
  description: descricao,
  openGraph: { type: "website", locale: "pt_BR", siteName: SITE.nome, title: `${SITE.nome} — ${SITE.tagline}`, description: descricao },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0e0e0e", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <CartProvider>
          <Header />
          <main>{children}</main>
          <Footer />
          <CartBar />
          <WhatsAppFlutuante />
          <Rastreio />
          <Roleta />
          <Medicao />
        </CartProvider>
        <Analytics />
      </body>
    </html>
  );
}
