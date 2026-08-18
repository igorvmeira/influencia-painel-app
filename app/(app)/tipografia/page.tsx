import { Poppins } from "next/font/google";
import { TEMA } from "@/lib/brand";

/**
 * PÁGINA DE COMPARAÇÃO TIPOGRÁFICA — TEMPORÁRIA.
 *
 * ⚠️ SAI NO FIM DA MIGRAÇÃO DE MARCA (commit 10). Ela existe por um motivo só: peso
 * óptico não se converte por tabela. O 600 da Poppins não é o 600 da Space Grotesk, e a
 * única forma de saber qual peso substitui qual é ver os DOIS renderizados no mesmo
 * tamanho, na mesma tela, nos fragmentos que o painel realmente usa.
 *
 * ⚠️ É A ÚNICA COISA QUE AINDA CARREGA A POPPINS. Quando esta página sair, a fonte antiga
 * sai do bundle junto — por isso ela está importada AQUI e não no layout.
 *
 * ⚠️ NENHUMA COR MUDA NESTE COMMIT. Tudo aqui usa os tokens do tema escuro atual, de
 * propósito: fonte e cor são dois eixos, e a comparação só vale se um deles estiver
 * parado. A paleta 2026 entra no commit seguinte.
 *
 * Fora do menu (lib/menu.ts) porque é ferramenta de trabalho, não tela do cliente. Quem
 * precisa dela digita /tipografia.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const PESOS_ANTIGOS = [400, 500, 600, 700] as const;
const PESOS_NOVOS = [400, 500, 700] as const;

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;

function Bloco({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-[15px] font-semibold" style={{ color: TEMA.texto }}>{titulo}</h2>
      {nota && <p className="mb-3 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>{nota}</p>}
      <div
        className="px-5 py-5"
        style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}
      >
        {children}
      </div>
    </section>
  );
}

/** Duas colunas: a fonte que sai à esquerda, a que entra à direita. */
function LadoALado({ esquerda, direita }: { esquerda: React.ReactNode; direita: React.ReactNode }) {
  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: MUTED }}>
          Poppins — sai
        </p>
        <div style={{ fontFamily: poppins.style.fontFamily }}>{esquerda}</div>
      </div>
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: TEMA.destaque }}>
          Space Grotesk — entra
        </p>
        <div className="font-sans">{direita}</div>
      </div>
    </div>
  );
}

/** O KPI de varredura: 34px é o maior número do painel, onde o peso mais aparece. */
function Kpi({ peso }: { peso: number }) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: MUTED }}>
        CPL médio da carteira
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-[34px] leading-none tabular-nums" style={{ fontWeight: peso, color: TEMA.texto }}>
          R$ 47,20
        </span>
        <span className="text-[12px]" style={{ color: TEMA.positivo }}>−12,4%</span>
      </div>
      <p className="mt-1 text-[11px]" style={{ color: MUTED }}>peso {peso}</p>
    </div>
  );
}

/** Linha de tabela densa: 12,5px, onde peso demais vira mancha. */
function LinhaTabela({ peso }: { peso: number }) {
  return (
    <div className="flex items-baseline gap-3 border-b py-1.5 text-[12.5px]" style={{ borderColor: LINE }}>
      <span className="w-8 shrink-0 text-[11px] tabular-nums" style={{ color: MUTED }}>{peso}</span>
      <span className="min-w-0 flex-1 truncate" style={{ fontWeight: peso, color: TEMA.texto }}>
        BAUMAN TELECOM · Provedor
      </span>
      <span className="w-24 shrink-0 text-right tabular-nums" style={{ fontWeight: peso, color: TEMA.texto }}>
        R$ 12.480,00
      </span>
      <span className="w-16 shrink-0 text-right tabular-nums" style={{ color: TEMA.negativo }}>+8,3%</span>
    </div>
  );
}

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold" style={{ color: TEMA.texto }}>Comparação tipográfica</h1>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: MUTED }}>
          Página temporária da migração de marca 2026. Sai no fim. Nenhuma cor mudou aqui —
          só a fonte, para os dois eixos não se misturarem.
        </p>
      </div>

      <div
        className="mb-8 rounded-lg px-4 py-3 text-[12.5px] leading-relaxed"
        style={{ background: TEMA.avisoFundo, color: TEMA.destaque }}
      >
        <b>O que decidir aqui:</b> qual peso da Space Grotesk substitui cada peso da Poppins.
        O painel usa 500 e 600 na maior parte, e 700 só em número herói. Se o 600 for
        necessário, ele volta para o <code>weight</code> em <code>app/layout.tsx</code> —
        hoje carregamos 400, 500 e 700.
      </div>

      <Bloco
        titulo="1. Número herói (34px)"
        nota="O maior número do painel. É onde a diferença de peso mais aparece, e onde 700 pode virar mancha."
      >
        <LadoALado
          esquerda={PESOS_ANTIGOS.map((p) => <Kpi key={p} peso={p} />)}
          direita={PESOS_NOVOS.map((p) => <Kpi key={p} peso={p} />)}
        />
      </Bloco>

      <Bloco
        titulo="2. Linha de tabela (12,5px)"
        nota="O oposto do herói: aqui peso demais fecha o texto e a linha vira borrão numa lista de 20."
      >
        <LadoALado
          esquerda={PESOS_ANTIGOS.map((p) => <LinhaTabela key={p} peso={p} />)}
          direita={PESOS_NOVOS.map((p) => <LinhaTabela key={p} peso={p} />)}
        />
      </Bloco>

      <Bloco
        titulo="3. Rótulo em caps com tracking .13em (11px)"
        nota="O tracking foi medido e aprovado em 17/08 sobre a Poppins. Confira se ele ainda serve: a Space Grotesk já é mais aberta de origem, e .13em sobre ela pode ser demais."
      >
        <LadoALado
          esquerda={PESOS_ANTIGOS.map((p) => (
            <p key={p} className="mb-2 text-[11px] uppercase tracking-[0.13em]" style={{ fontWeight: p, color: MUTED }}>
              Gestores · evolução de CPL ({p})
            </p>
          ))}
          direita={PESOS_NOVOS.map((p) => (
            <p key={p} className="mb-2 text-[11px] uppercase tracking-[0.13em]" style={{ fontWeight: p, color: MUTED }}>
              Gestores · evolução de CPL ({p})
            </p>
          ))}
        />
      </Bloco>

      <Bloco
        titulo="4. Prosa com número dentro (12,5px)"
        nota="A frase que a régua protege: aqui o número acompanha o texto e NÃO vira Inconsolata."
      >
        <LadoALado
          esquerda={
            <p className="text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
              <b style={{ color: TEMA.texto }}>111</b> das <b style={{ color: TEMA.texto }}>210</b> que
              entraram ainda estão no funil · as outras <b style={{ color: TEMA.texto }}>99</b> fecharam,
              perderam ou saíram.
            </p>
          }
          direita={
            <p className="text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
              <b style={{ color: TEMA.texto }}>111</b> das <b style={{ color: TEMA.texto }}>210</b> que
              entraram ainda estão no funil · as outras <b style={{ color: TEMA.texto }}>99</b> fecharam,
              perderam ou saíram.
            </p>
          }
        />
      </Bloco>

      <Bloco
        titulo="5. Número em COLUNA: Space Grotesk vs Inconsolata"
        nota="A outra metade da régua. A Inconsolata é monoespaçada — a coluna alinha por natureza. Confira se o corpo dela combina no mesmo tamanho: monoespaçada costuma parecer menor."
      >
        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: MUTED }}>
              Space Grotesk + tabular-nums
            </p>
            <div className="font-sans">
              {["1.284,00", "97,50", "12.480,00", "8,30", "245.910,25"].map((v) => (
                <div key={v} className="border-b py-1 text-right text-[13px] tabular-nums"
                  style={{ borderColor: LINE, color: TEMA.texto }}>R$ {v}</div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: TEMA.destaque }}>
              Inconsolata (monoespaçada)
            </p>
            <div className="font-mono">
              {["1.284,00", "97,50", "12.480,00", "8,30", "245.910,25"].map((v) => (
                <div key={v} className="border-b py-1 text-right text-[13px]"
                  style={{ borderColor: LINE, color: TEMA.texto }}>R$ {v}</div>
              ))}
            </div>
          </div>
        </div>
      </Bloco>

      <Bloco
        titulo="6. Item de menu (13px) e botão (12px)"
        nota="Os dois controles que aparecem em toda tela."
      >
        <LadoALado
          esquerda={
            <div className="space-y-2">
              {PESOS_ANTIGOS.map((p) => (
                <div key={p} className="rounded-lg px-3 py-2 text-[13px]"
                  style={{ background: TEMA.navFundo, color: TEMA.navTexto, fontWeight: p }}>
                  Dashboard de Tráfego <span className="text-[11px]" style={{ color: MUTED }}>({p})</span>
                </div>
              ))}
            </div>
          }
          direita={
            <div className="space-y-2">
              {PESOS_NOVOS.map((p) => (
                <div key={p} className="rounded-lg px-3 py-2 text-[13px]"
                  style={{ background: TEMA.navFundo, color: TEMA.navTexto, fontWeight: p }}>
                  Dashboard de Tráfego <span className="text-[11px]" style={{ color: MUTED }}>({p})</span>
                </div>
              ))}
            </div>
          }
        />
      </Bloco>
    </div>
  );
}
