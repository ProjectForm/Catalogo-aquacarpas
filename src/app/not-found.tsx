import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pagina">
      <div className="container">
        <p className="eyebrow">Página não encontrada</p>
        <h1>Esse peixe não está mais por aqui</h1>
        <p className="intro">O link pode ter mudado ou o peixe já ter ganhado um novo lago. Veja o que temos disponível agora.</p>
        <p style={{ marginTop: 24 }}>
          <Link href="/" className="btn btn-primario">Ver o catálogo</Link>
        </p>
      </div>
    </div>
  );
}
