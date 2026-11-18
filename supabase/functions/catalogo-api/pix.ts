// Pix "copia e cola" (BR Code estático com valor), conforme o Manual de Padrões para Iniciação do Pix (Banco Central).
// Lógica pura, sem dependências: roda no Deno (Supabase) e no Node (testes em logica.test.ts).
//
// Atenção: um Pix estático NÃO avisa ninguém quando é pago (não há webhook). Quem confirma é a equipe, conferindo no
// banco, ou o pagamento pela InfinitePay (que avisa o servidor sozinha).

function tlv(id: string, valor: string): string {
  return id + String(valor.length).padStart(2, "0") + valor;
}

/** CRC16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Sem acentos, só letras/números/espaço, maiúsculas e no limite do campo (nome: 25, cidade: 15). */
function textoPix(v: string, max: number): string {
  return v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export interface DadosPix {
  chave: string; // CPF/CNPJ (só dígitos), e-mail, telefone (+55...) ou chave aleatória
  nome: string; // nome do recebedor
  cidade: string; // cidade do recebedor
  valor: number; // em reais
  txid?: string; // identificador do pedido (até 25 letras/números); aparece no extrato de alguns bancos
}

export function gerarPix(d: DadosPix): string {
  const chave = d.chave.trim();
  if (!chave || chave.length > 77) throw new Error("chave Pix inválida");
  if (!(d.valor > 0) || d.valor > 9999999) throw new Error("valor Pix inválido");
  const txid = (d.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  const conta = tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", chave));
  const corpo =
    tlv("00", "01") + // versão do payload
    tlv("01", "11") + // 11 = QR estático
    conta +
    tlv("52", "0000") + // categoria do comerciante
    tlv("53", "986") + // moeda: BRL
    tlv("54", d.valor.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", textoPix(d.nome, 25) || "RECEBEDOR") +
    tlv("60", textoPix(d.cidade, 15) || "BRASIL") +
    tlv("62", tlv("05", txid)) +
    "6304";
  return corpo + crc16(corpo);
}
