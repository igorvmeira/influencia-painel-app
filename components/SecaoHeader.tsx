import { TEMA } from "@/lib/brand";

/**
 * Cabeçalho de seção — barra vertical, chip de ícone, título, subtítulo e pill.
 *
 * ⚠️ ISTO É DESENHO NOSSO, NÃO TRADUÇÃO DA REFERÊNCIA. A inspeção mostrou que o
 * Grafana não tem barra vertical nem ícone no cabeçalho de painel: o que o Igor
 * viu nos prints era customização da instância. Como não há original para imitar,
 * as decisões abaixo respondem à nossa leitura, não à de ninguém.
 *
 * A PILL FICA À DIREITA porque é filtro, não título: quem lê o cabeçalho lê da
 * esquerda; quem quer trocar o período procura no canto oposto.
 */
export default function SecaoHeader({
  titulo, subtitulo, icone, pill, children,
}: {
  titulo: string;
  subtitulo?: string;
  /** Um caractere ou emoji. Decorativo — o título é quem informa. */
  icone?: string;
  /** Texto curto à direita (período, escopo). Só rótulo; controle vem em `children`. */
  pill?: string;
  /** Controles à direita, quando a seção tiver ação própria. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 mt-11 flex items-start gap-3 first:mt-0">
      {/* A barra é o único uso de `destaque` como forma vertical no app. Ela
          ancora a seção sem gastar cor no texto — o dourado marca ONDE começa,
          não O QUE está escrito. */}
      <div
        aria-hidden="true"
        className="w-[3px] shrink-0 self-stretch rounded-sm"
        style={{ background: TEMA.destaque, minHeight: 38 }}
      />

      {icone && (
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[14px] leading-none"
          style={{ background: TEMA.chipDourado, color: TEMA.destaque }}
        >
          {icone}
        </span>
      )}

      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-brand-ink">{titulo}</h2>
        {subtitulo && (
          <p className="mt-0.5 text-[12px]" style={{ color: TEMA.muted }}>{subtitulo}</p>
        )}
      </div>

      {(pill || children) && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {children}
          {pill && (
            <span
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium"
              style={{ background: TEMA.chip, color: TEMA.muted }}
            >
              {pill}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
