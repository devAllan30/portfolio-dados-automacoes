export const metadata = {
  title: "Link de indicação inválido | Programa de Indicações",
};

export default function PaginaInicial() {
  return (
    <main className="pagina-centralizada">
      <section className="aviso-link" aria-labelledby="titulo-link-invalido">
        <span className="marca-texto">Programa de Indicações</span>
        <div className="icone-aviso" aria-hidden="true">!</div>
        <h1 id="titulo-link-invalido">Link de indicação incompleto</h1>
        <p>
          Acesse o formulário pelo link personalizado enviado pela sua
          consultora.
        </p>
        <div className="formato-link">
          indicacoes.exemplo.com/
          <strong>id_Banco=NomeParceiro</strong>/<strong>consultora</strong>
        </div>
      </section>
    </main>
  );
}
