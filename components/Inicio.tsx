"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDadosPainel } from "@/lib/useDadosPainel";
import { useOrientacoes } from "@/lib/useOrientacoes";
import { useComercial } from "@/lib/useComercial";
import { montarPainel, montarNichos, destaquesVsNicho } from "@/lib/painel";
import { rankingEvolucaoGestores } from "@/lib/destaques";
import {
  limitesQuePedemAcao, contasComCplAlto, contasQueGastaramSemConverter,
  CPL_ALERTA, DIAS_ESTOURO_URGENTE, type ContaEmAlerta,
} from "@/lib/alertas";
import { intervaloLabel } from "@/lib/periodo";
import { haQuanto } from "@/lib/tempo";
import { brl, brlDec, num } from "@/lib/format";
import { TEMA } from "@/lib/brand";
import { useEntrada } from "@/lib/useEntrada";
import IndicadorFrescor from "./IndicadorFrescor";
import AvisoDadoVelho from "./AvisoDadoVelho";
import SecaoHeader from "./SecaoHeader";
import KpiCard from "./KpiCard";
import BarraDado from "./BarraDado";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;

/**
 * A Início como PAINEL-RESUMO — responde "como está a agência", não "onde clicar".
 *
 * ⚠️ CUSTO: 409 leituras, das quais 408 já eram pagas antes (o /api/painel e o
 * /api/orientacoes já vinham da versão anterior). O acréscimo é **1 documento**, o
 * pré-agregado do comercial. Todo o resto — KPIs, alertas, pódios, funil — é
 * função pura sobre o `daily` que a sessão já carregou. Nenhuma busca nova cara.
 *
 * ⚠️ Os três cards de navegação saíram: a sidebar já faz isso, e eles ocupavam a
 * dobra inteira com informação que o menu repete.
 */

/** Janela dos KPIs e dos alertas. 7 dias responde "esta semana", que é a pergunta
 *  de quem abre a tela de manhã — o Dashboard é quem tem seletor de período. */
const DIAS_KPI = 7;
/** Quantos nomes cada alerta mostra. Alerta sem nome vira "47 contas" que ninguém
 *  abre; nome demais vira lista, e lista é a tela de destino, não o resumo. */
const NOMES_POR_ALERTA = 3;
const TOP_DESTAQUES = 3;

export default function Inicio() {
  const { dados, erro } = useDadosPainel();
  const { mapa: orientacoes } = useOrientacoes();
  const { agregado, erro: erroComercial } = useComercial();

  // Regra única da casa: conta pausada fica FORA de tudo.
  const contasAtivas = useMemo(() => (dados ? dados.contas.filter((c) => !c.pausado) : []), [dados]);
  const daily = dados?.daily ?? [];

  const painel = useMemo(
    () => (dados ? montarPainel(daily, contasAtivas, DIAS_KPI) : null),
    [dados, daily, contasAtivas]
  );

  /**
   * Uma linha por CONTA, com os números da mesma janela dos KPIs.
   *
   * ⚠️ Sai de `painel.detalhes` de propósito: a definição de janela e de âncora
   * (último dia COM DADO, nunca o relógio) já existe em lib/painel, e recalcular
   * aqui criaria uma segunda definição que divergiria na primeira mudança.
   */
  const linhasConta: ContaEmAlerta[] = useMemo(() => {
    if (!painel) return [];
    return painel.detalhes.flatMap((d) =>
      d.clientes.map((c) => ({
        accountId: c.accountId,
        cliente: c.cliente,
        gestor: d.gestor,
        gasto: c.gasto,
        conversas: c.conversas,
        // ⚠️ null, não zero: sem conversa o CPL é INDEFINIDO. `cplSemanal` devolve
        // 0 nesse caso, e 0 aqui faria a conta parecer a mais barata da carteira.
        cpl: c.conversas > 0 ? c.gasto / c.conversas : null,
      }))
    );
  }, [painel]);

  const limites = useMemo(() => {
    if (!dados) return { jaBateram: [], estouramEmBreve: [] };
    const gastoPorConta = new Map(linhasConta.map((l) => [l.accountId, l.gasto]));
    return limitesQuePedemAcao(contasAtivas, dados.limites, gastoPorConta, DIAS_KPI);
  }, [dados, contasAtivas, linhasConta]);

  const cplAlto = useMemo(() => contasComCplAlto(linhasConta), [linhasConta]);
  const semConversao = useMemo(() => contasQueGastaramSemConverter(linhasConta), [linhasConta]);

  // Orientações: quantas contas ativas ninguém comentou, e a mais antiga.
  const ori = useMemo(() => {
    if (!orientacoes || !contasAtivas.length) return null;
    const sem = contasAtivas.filter((c) => !orientacoes[c.accountId]);
    const comData = contasAtivas
      .map((c) => ({ cliente: c.cliente, em: orientacoes[c.accountId]?.em }))
      .filter((x): x is { cliente: string; em: string } => !!x.em)
      .sort((a, b) => a.em.localeCompare(b.em));
    return { sem: sem.length, total: contasAtivas.length, maisAntiga: comData[0] ?? null };
  }, [orientacoes, contasAtivas]);

  const evolucao = useMemo(
    () => (dados ? rankingEvolucaoGestores(daily, contasAtivas) : null),
    [dados, daily, contasAtivas]
  );

  const destaquesNicho = useMemo(
    () => (dados ? destaquesVsNicho(montarNichos(daily, contasAtivas, DIAS_KPI)) : []),
    [dados, daily, contasAtivas]
  );

  const janelaAtual = intervaloLabel(daily, contasAtivas, DIAS_KPI);
  const janelaAnterior = intervaloLabel(daily, contasAtivas, DIAS_KPI, DIAS_KPI);
  const contexto = janelaAnterior ? `vs ${janelaAnterior}` : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-brand-ink">Início</h1>
          <p className="text-[13px]" style={{ color: MUTED }}>O que precisa da sua atenção hoje.</p>
        </div>
        <IndicadorFrescor ultimaSync={dados?.ultimaSync ?? null} />
      </div>

      {/* Os dois syncs alimentam blocos diferentes desta tela, então cada um avisa
          pelo seu — mandar conferir o workflow errado é pior que não mandar. */}
      <AvisoDadoVelho geradoEm={dados?.ultimaSync} oQue="os dados de tráfego" workflow="sync-meta" />
      <AvisoDadoVelho geradoEm={agregado?.geradoEm} oQue="o funil comercial" workflow="sync-comercial" />

      {erro && (
        <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>
          {erro}
        </div>
      )}

      {/* ================================ KPIs ================================ */}
      {!dados ? (
        <Esqueleto altura={128} n={3} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              rotulo="Gasto"
              valor={painel!.totais.gasto}
              formatar={brl}
              delta={painel!.totais.gastoVar}
              contexto={contexto}
              base={`Soma das ${contasAtivas.length} contas ativas em ${janelaAtual ?? "—"}.`}
            />
            <KpiCard
              rotulo="Conversas"
              sub="formulário + WhatsApp"
              valor={painel!.totais.conversas}
              formatar={num}
              delta={painel!.totais.conversasVar}
              contexto={contexto}
              base={`${num(painel!.totais.b2b)} de formulário · ${num(painel!.totais.b2c)} de WhatsApp.`}
            />
            <KpiCard
              rotulo="CPL da carteira"
              valor={painel!.totais.cpl}
              formatar={brlDec}
              delta={painel!.totais.cplVar}
              // ⚠️ CPL subindo é RUIM: a cor segue o SIGNIFICADO, nunca o sinal.
              menorMelhor
              contexto={contexto}
              base="Gasto total ÷ conversas totais — não é a média dos CPLs das contas."
            />
          </div>
          <p className="mt-2 text-[11.5px]" style={{ color: MUTED }}>
            {janelaAtual ?? "—"}
            {janelaAnterior ? ` comparado com ${janelaAnterior}` : ""} · ancorado no último dia com
            dado, não no relógio.
          </p>
        </>
      )}

      {/* ⚠️ ORDEM DO DOM = ORDEM NO CELULAR. Alertas vêm antes dos destaques de
          propósito: numa coluna só, quem abre no celular precisa do que pede ação
          primeiro. No desktop o grid põe os dois lado a lado. */}
      <div className="mt-2 grid gap-6 lg:grid-cols-3">
        {/* ============================ PEDE AÇÃO ============================ */}
        <div className="lg:col-span-2">
          <SecaoHeader
            titulo="Precisa de ação"
            subtitulo={`Contas ativas, ${janelaAtual ?? "período atual"}.`}
            icone="⚠"
          />
          {!dados ? (
            <Esqueleto altura={64} n={4} />
          ) : (
            <div className="space-y-2">
              <LinhaAlerta
                n={limites.jaBateram.length}
                cor={TEMA.atencao}
                texto={limites.jaBateram.length === 1 ? "conta já bateu o teto de gasto" : "contas já bateram o teto de gasto"}
                detalhe="A veiculação está parada agora — a ação é subir o teto, não vigiar."
                nomes={limites.jaBateram.map((a) => a.cliente)}
                href="/dashboard"
              />
              <LinhaAlerta
                n={limites.estouramEmBreve.length}
                cor={TEMA.atencao}
                texto={`${limites.estouramEmBreve.length === 1 ? "conta bate" : "contas batem"} o teto em menos de ${DIAS_ESTOURO_URGENTE} dias`}
                detalhe="No ritmo de gasto dos últimos 7 dias."
                nomes={limites.estouramEmBreve.map(
                  (a) => `${a.cliente} (${Math.max(1, Math.round(a.diasAteEstourar ?? 0))}d)`
                )}
                href="/dashboard"
              />
              <LinhaAlerta
                n={cplAlto.length}
                cor={TEMA.negativo}
                texto={`${cplAlto.length === 1 ? "conta com CPL" : "contas com CPL"} acima de ${brlDec(CPL_ALERTA)}`}
                detalhe="Por conta, não por gestor — a média do gestor esconde a conta ruim."
                nomes={cplAlto.map((c) => `${c.cliente} ${brlDec(c.cpl ?? 0)}`)}
                href="/dashboard"
              />
              {/* ⚠️ LINHA PRÓPRIA, e não junto do CPL alto: CPL sem conversão é
                  INDEFINIDO, não é um número grande — nenhum filtro de "CPL ≥ X"
                  as pega, por mais que gastem. Ver lib/alertas.ts. */}
              <LinhaAlerta
                n={semConversao.length}
                cor={TEMA.negativo}
                texto={`${semConversao.length === 1 ? "conta gastou" : "contas gastaram"} e não converteram nada`}
                detalhe={`${brlDec(semConversao.reduce((s, c) => s + c.gasto, 0))} sem nenhuma conversa. Não aparecem no alerta de CPL: sem conversão, o CPL é indefinido, não é alto.`}
                nomes={semConversao.map((c) => `${c.cliente} ${brlDec(c.gasto)}`)}
                href="/dashboard"
              />
              <LinhaAlerta
                n={ori?.sem ?? 0}
                cor={TEMA.muted}
                texto={`de ${ori?.total ?? 0} contas ativas estão sem orientação`}
                detalhe={ori?.maisAntiga
                  ? `A orientação mais antiga é de ${haQuanto(ori.maisAntiga.em)} (${ori.maisAntiga.cliente}).`
                  : undefined}
                nomes={[]}
                href="/orientacoes"
              />
              {limites.jaBateram.length === 0 && limites.estouramEmBreve.length === 0
                && cplAlto.length === 0 && semConversao.length === 0 && (
                <div className="rounded-xl px-4 py-6 text-center text-[13px]"
                  style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, color: MUTED }}>
                  <span style={{ color: TEMA.positivo }}>✓</span> Nenhuma conta pedindo ação
                  em {janelaAtual ?? "período atual"}.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================= MELHORES + COMERCIAL ===================== */}
        <div>
          <SecaoHeader
            titulo="Melhores do mês"
            subtitulo={evolucao
              ? `CPL de ${mesBR(evolucao.mes)} contra ${mesBR(evolucao.mesAnterior)}.`
              : "Sem dois meses fechados na janela."}
            icone="★"
          />
          <div className="p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: MUTED }}>
              Gestores · evolução de CPL
            </p>
            {!evolucao ? (
              <p className="text-[12.5px]" style={{ color: MUTED }}>
                A janela de dados ainda não cobre dois meses fechados.
              </p>
            ) : (
              <>
                {evolucao.linhas.filter((l) => l.elegivel).slice(0, TOP_DESTAQUES).map((l) => (
                  <div key={l.gestor} className="flex items-baseline justify-between gap-2 py-1 text-[12.5px]">
                    <span style={{ color: TEMA.texto }}>{l.gestor}</span>
                    {/* COLUNA: três gestores empilhados, valores alinhados à direita. */}
              <span className="tabular-nums font-mono" style={{ color: MUTED }}>
                      {brlDec(l.cplAnterior)} → <b style={{ color: TEMA.texto }}>{brlDec(l.cplAtual)}</b>{" "}
                      <b style={{ color: l.variacaoPct < 0 ? TEMA.positivo : TEMA.negativo }}>
                        {l.variacaoPct < 0 ? "−" : "+"}{Math.abs(Math.round(l.variacaoPct))}%
                      </b>
                    </span>
                  </div>
                ))}
                {/* ⚠️ O INELEGÍVEL APARECE, com o motivo. Sumir com ele faria o pódio
                    parecer completo e esconderia que alguém ficou de fora por base
                    furada — que é justamente o que a régua existe para dizer. */}
                {evolucao.linhas.filter((l) => !l.elegivel).slice(0, 2).map((l) => (
                  <p key={l.gestor} className="mt-1.5 text-[11px] leading-snug" style={{ color: MUTED }}>
                    <b>{l.gestor}</b> fora do pódio: {l.motivoInelegivel}
                  </p>
                ))}
              </>
            )}

            <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: MUTED }}>
              Contas · CPL vs média do nicho
            </p>
            {destaquesNicho.length === 0 ? (
              <p className="text-[12.5px]" style={{ color: MUTED }}>
                Nenhuma conta com volume suficiente em {janelaAtual ?? "período atual"}.
              </p>
            ) : (
              destaquesNicho.slice(0, TOP_DESTAQUES).map((d) => (
                <div key={d.accountId} className="py-1 text-[12.5px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate" style={{ color: TEMA.texto }}>{d.cliente}</span>
                    {/* COLUNA: três clientes empilhados, o % alinhado à direita. */}
                <b className="tabular-nums font-mono" style={{ color: TEMA.positivo }}>
                      −{Math.abs(Math.round(d.desvioPct))}%
                    </b>
                  </div>
                  <div className="text-[11px] tabular-nums" style={{ color: MUTED }}>
                    {brlDec(d.cpl)} vs {brlDec(d.cplNicho)} do nicho {d.nicho} · {num(d.conversas)} conversas
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ========================== COMERCIAL ========================== */}
          <SecaoHeader titulo="Comercial de relance" icone="◇" />
          <Comercial agregado={agregado} erro={erroComercial} />
        </div>
      </div>
    </div>
  );
}

const mesBR = ({ ano, mes }: { ano: number; mes: number }) => `${String(mes).padStart(2, "0")}/${ano}`;

/**
 * Uma linha de alerta: número + o que é + os piores casos NOMEADOS + link.
 *
 * ⚠️ OS NOMES SÃO O PONTO. "47 contas" é um número que ninguém abre — foi o
 * defeito da versão anterior desta tela. Com três nomes a pessoa já sabe se o
 * alerta é sobre a carteira dela antes de clicar.
 *
 * Local a esta tela de propósito: vira componente compartilhado quando a segunda
 * tela precisar, não antes.
 */
function LinhaAlerta({ n, texto, detalhe, nomes, href, cor }: {
  n: number;
  texto: string;
  detalhe?: string;
  nomes: string[];
  href: string;
  cor: string;
}) {
  if (n === 0) return null;
  const mostrados = nomes.slice(0, NOMES_POR_ALERTA);
  const resto = nomes.length - mostrados.length;
  return (
    <Link
      href={href}
      // ⚠️ O fundo vai em CLASSE (`bg-brand-card`), nunca em `style` inline: estilo
      // inline vence stylesheet, e `background` inline + `hover:bg-` faz o hover
      // NUNCA pintar — sem erro, sem aviso, e a linha parece só não responder ao
      // mouse. Escrevi errado aqui e o `scripts/audita-tema.js` pegou; é o mesmo
      // defeito que ficou três meses vivo no painel antes da migração de tema.
      className="block bg-brand-card p-2.5 transition-colors hover:bg-brand-hover"
      style={{ border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}
    >
      <p className="text-[13px]" style={{ color: TEMA.texto }}>
        <strong className="font-semibold tabular-nums" style={{ color: cor }}>{n}</strong> {texto}
      </p>
      {mostrados.length > 0 && (
        <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
          {mostrados.join(" · ")}
          {resto > 0 && ` · +${resto}`}
        </p>
      )}
      {detalhe && (
        <p className="mt-1 text-[11px] leading-snug" style={{ color: MUTED }}>{detalhe}</p>
      )}
    </Link>
  );
}

/** O funil e o fechamento de relance — tudo do mesmo documento já carregado. */
function Comercial({ agregado, erro }: {
  agregado: ReturnType<typeof useComercial>["agregado"];
  erro: string | null;
}) {
  const { ref, entrou } = useEntrada<HTMLDivElement>();

  if (erro || !agregado) {
    return (
      <div className="p-4 text-[12.5px]" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, color: MUTED }}>
        {erro ? "Funil comercial indisponível no momento." : "O sync do comercial ainda não rodou."}
      </div>
    );
  }

  const { funil, fechamento, leadsNovosPorDia } = agregado;
  const maxNivel = Math.max(1, ...funil.niveis.map((n) => n.pessoas));
  const emFech = fechamento.emFechamento;

  /**
   * Leads dos últimos 7 dias, somados da série DIÁRIA do agregado.
   * ⚠️ A janela termina em `leadsNovosPorDia.ate` — o dia do sync —, nunca em
   * "hoje". Se o sync falhar, o rótulo mostra a data real e ninguém lê uma janela
   * deslocada achando que é a de agora.
   */
  const ultimos7 = leadsNovosPorDia?.dias.slice(-7) ?? [];
  const leads7 = ultimos7.reduce((s, d) => s + d.pessoas, 0);

  return (
    <div ref={ref} className="p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
      {funil.niveis.map((n, i) => (
        <div key={n.nivel} className="flex items-center gap-2 py-1 text-[12px]">
          <span className="w-[92px] shrink-0 truncate" style={{ color: MUTED }} title={n.nome}>{n.nome}</span>
          <BarraDado
            pct={(n.pessoas / maxNivel) * 100}
            cor={TEMA.destaque}
            degrade
            entrou={entrou}
            indice={i}
            titulo={`${n.pessoas} pessoas em ${n.nome}`}
            className="h-2.5 flex-1 overflow-hidden rounded-full"
          />
          <span className="w-8 shrink-0 text-right tabular-nums font-mono" style={{ color: TEMA.texto }}>{n.pessoas}</span>
        </div>
      ))}

      {/*
        ⚠️ "NO FUNIL DE CAPTAÇÃO", NUNCA "PESSOAS". Os cinco níveis somam
        `pessoasNoFunil`; existem `pessoasComAberta` com oportunidade aberta, e a
        diferença são recuperação e fora do funil. Um número solto aqui faria
        alguém somar duas populações diferentes. O link existe para quem estranhar
        a diferença entender num clique.
      */}
      <p className="mt-2 text-[11.5px]" style={{ color: MUTED }}>
        <b className="tabular-nums" style={{ color: TEMA.texto }}>{num(funil.pessoasNoFunil)}</b> pessoas
        no funil de captação — de {num(funil.pessoasComAberta)} com oportunidade aberta.{" "}
        <Link href="/comercial" className="underline" style={{ color: TEMA.ouroTexto }}>ver o funil</Link>
      </p>

      <div className="mt-4 border-t pt-3" style={{ borderColor: LINE }}>
        <p className="text-[12.5px]" style={{ color: TEMA.texto }}>
          <b className="tabular-nums">{num(emFech.pessoas)}</b> pessoas em fechamento ·{" "}
          <b className="tabular-nums" style={{ color: TEMA.destaque }}>{brl(emFech.mrrCent / 100)}</b>/mês
        </p>
        {/* O rótulo honesto da /comercial, palavra por palavra: são pessoas paradas
            na etapa, contadas como venda por decisão da agência. */}
        <p className="mt-1 text-[11px] leading-snug" style={{ color: MUTED }}>
          Pessoas paradas na etapa, contadas como venda por decisão da agência — não têm clique de
          ganho nem data. O MRR vem de {num(emFech.comValor)} delas; {num(emFech.semValor)} estão sem
          valor informado.
        </p>
      </div>

      {leadsNovosPorDia && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: LINE }}>
          <p className="text-[12.5px]" style={{ color: TEMA.texto }}>
            <b className="tabular-nums">{num(leads7)}</b> leads novos em 7 dias
          </p>
          <p className="mt-1 text-[11px]" style={{ color: MUTED }}>
            Pessoas cujo primeiro contato caiu na janela — nunca oportunidades criadas.
            Até {ultimos7.length ? ymdBR(ultimos7[ultimos7.length - 1].dia) : "—"}, data do último sync.
          </p>
        </div>
      )}
    </div>
  );
}

const ymdBR = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

function Esqueleto({ altura, n }: { altura: number; n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="animate-pulse motion-reduce:animate-none"
          style={{ height: altura, background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }} />
      ))}
    </div>
  );
}
