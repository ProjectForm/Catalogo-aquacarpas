/** Evita quebrar faixas de tamanho ("28-30cm") no hífen quando o nome vai para a linha de baixo. */
export function NomeProduto({ nome }: { nome: string }) {
  const partes = nome.split(" ");
  return (
    <>
      {partes.map((parte, i) => (
        <span key={i}>
          {/\d-\d/.test(parte) ? <span className="nw">{parte}</span> : parte}
          {i < partes.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}
