"use client";

import { evento } from "@/lib/tracking";

export function WhatsAppLink({
  href,
  children,
  className,
  itemCodigo,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  itemCodigo?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => evento("clique_whatsapp", itemCodigo)}
    >
      {children}
    </a>
  );
}
