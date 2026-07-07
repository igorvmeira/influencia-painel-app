import { TEMA } from "@/lib/brand";

// Bloco pulsante base. Respeita prefers-reduced-motion (sem pulsar).
function Bloco({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none ${className}`}
      style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, borderRadius: TEMA.raioCard, ...style }}
    />
  );
}

// Placeholder no formato real do painel enquanto os dados carregam (sem spinner).
export default function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando painel">
      {/* Cabeçalho */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Bloco className="h-6 w-40" />
        <div className="flex items-center gap-3">
          <Bloco className="h-8 w-40" />
          <Bloco className="h-8 w-28" />
        </div>
      </div>

      {/* KPIs (2 col no mobile, 4 no desktop) */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Bloco key={i} className="h-28" />)}
      </div>

      {/* Faixa "Precisa de atenção" */}
      <div className="mb-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <Bloco className="h-20" />
        <Bloco className="h-20" />
      </div>

      {/* Gráfico-herói */}
      <Bloco className="mb-10 h-80" />

      {/* Toggle de abas */}
      <div className="mb-3 flex gap-2">
        {[0, 1, 2, 3].map((i) => <Bloco key={i} className="h-8 w-24 rounded-full" />)}
      </div>

      {/* Bloco de ranking / tabela */}
      <Bloco className="h-64" />
    </div>
  );
}
