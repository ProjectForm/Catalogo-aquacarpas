import { GARANTIA_CURTA } from "@/lib/config";

/**
 * Selos discretos no resumo do pedido: pagamento pela InfinitePay e garantia de envio.
 * `online`: true/null = pagamento pela InfinitePay (null = CEP ainda não informado); false = o CEP já foi calculado e
 * o pagamento deste pedido é combinado com a equipe pelo WhatsApp (não prometemos InfinitePay onde não vale).
 */
export function ConfiancaPedido({ online }: { online: boolean | null }) {
  return (
    <ul className="selos-pedido" aria-label="Pagamento e garantia">
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
        <div>
          {online === false ? (
            <>
              <strong>Pagamento combinado com a nossa equipe</strong>
              <span>Depois de enviar, confirmamos tudo com você pelo WhatsApp.</span>
            </>
          ) : (
            <>
              <strong>Pagamento confiável pela InfinitePay</strong>
              <span>Pix ou cartão de crédito, em ambiente seguro.</span>
            </>
          )}
        </div>
      </li>
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3 4.5 6v5.5c0 4.5 3 7.7 7.5 9.5 4.5-1.8 7.5-5 7.5-9.5V6z" />
          <path d="m8.8 12 2.4 2.4 4.2-4.6" />
        </svg>
        <div>
          <strong>Garantia de envio</strong>
          <span>{GARANTIA_CURTA}</span>
        </div>
      </li>
    </ul>
  );
}
