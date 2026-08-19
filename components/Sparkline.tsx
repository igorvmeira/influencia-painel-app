// Mini-linha discreta do dia a dia (sem eixos, sem preenchimento, sem dependência).
export default function Sparkline({
  dados, cor, largura = 96, altura = 28,
}: { dados: number[]; cor: string; largura?: number; altura?: number }) {
  if (!dados || dados.length < 2) return <div style={{ width: largura, height: altura }} aria-hidden="true" />;

  const max = Math.max(...dados);
  const min = Math.min(...dados);
  const span = max - min || 1;
  const n = dados.length;
  const pts = dados
    .map((v, i) => {
      const x = (i / (n - 1)) * largura;
      const y = altura - ((v - min) / span) * altura; // maior valor no topo
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" aria-hidden="true">
      {/*
        ⚠️ O `opacity={0.9}` SAIU, e não foi estética: ele fazia a linha pintar uma cor
        que NENHUMA régua media. A 90% sobre o card roxo, o `dadoNeutro` virava outra cor e
        caía para **2,91:1** — abaixo do piso de 3:1 da WCAG 1.4.11, que vale aqui porque
        a POSIÇÃO da linha codifica a tendência do CPL.

        O par declarado dizia 3,31:1 e estava certo sobre o token; errado sobre o que a
        tela pintava. É a mesma família do token em contexto errado, por outro mecanismo:
        não é a superfície que muda, é a TINTA que a opacidade transforma em outra cor.

        Sem opacidade, o que a tela pinta é o token — e a régua volta a descrever a tela.
      */}
      <polyline points={pts} fill="none" stroke={cor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
