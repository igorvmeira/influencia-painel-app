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
      <polyline points={pts} fill="none" stroke={cor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}
