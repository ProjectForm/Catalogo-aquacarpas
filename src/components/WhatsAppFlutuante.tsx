"use client";

import { usePathname } from "next/navigation";
import { linkWhatsApp } from "@/lib/config";
import { evento } from "@/lib/tracking";
import { useCart } from "./CartProvider";

/** Botão fixo no canto da tela, em todas as páginas, com link direto para o WhatsApp da Aquacarpas. */
export function WhatsAppFlutuante() {
  const path = usePathname();
  const { quantidadeTotal, pronto } = useCart();
  // Sobe um pouco quando a barra "Finalizar pedido" está visível, para não cobrir o botão dela.
  const comBarra = pronto && quantidadeTotal > 0 && !path.startsWith("/entrega") && !path.startsWith("/obrigado");
  const texto = path.startsWith("/p/")
    ? "Olá! Tenho interesse em um peixe do catálogo da Aquacarpas."
    : "Olá! Vim pelo catálogo da Aquacarpas e gostaria de ajuda.";

  return (
    <a
      href={linkWhatsApp(texto)}
      target="_blank"
      rel="noopener noreferrer"
      className={`whats-flutuante${comBarra ? " acima-barra" : ""}`}
      aria-label="Falar com a Aquacarpas no WhatsApp"
      onClick={() => evento("clique_whatsapp")}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.6-5.4A8.4 8.4 0 1 1 21 11.5z" />
        <path d="M8.8 8.9c.2-.5.6-.5.9-.5.2 0 .4.2.5.5l.6 1.4c.1.2 0 .4-.1.6l-.5.6c.6 1.2 1.6 2.1 2.8 2.7l.6-.7c.2-.2.4-.2.6-.1l1.4.7c.3.1.4.3.4.5-.1.8-.7 1.5-1.6 1.6-3 .1-6-3.1-5.6-6.3.1-.4.3-.7.5-1z" />
      </svg>
      <span>Falar no WhatsApp</span>
    </a>
  );
}
