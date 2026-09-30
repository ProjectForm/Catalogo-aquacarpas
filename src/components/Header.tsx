import Link from "next/link";
import { SITE } from "@/lib/config";
import { CartPill } from "./CartPill";

export function Header() {
  return (
    <header className="topo">
      <div className="container">
        <Link href="/" className="marca" aria-label={`${SITE.nome} — início`}>
          <strong>{SITE.nome}</strong>
          <span>Nishikigoi</span>
        </Link>
        <nav className="nav" aria-label="Principal">
          <Link href="/#catalogo" className="link-texto">Catálogo</Link>
          <Link href="/entrega" className="link-texto">Entrega</Link>
          <CartPill />
        </nav>
      </div>
    </header>
  );
}
