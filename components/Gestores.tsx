"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useDadosPainel } from "@/lib/useDadosPainel";
import { montarPainel } from "@/lib/painel";
import { janelaMesFechado, mesesDisponiveis, coberturaMes, ymdParaBR, rotuloMes } from "@/lib/periodo";
import type { MesDisponivel } from "@/lib/periodo";
import { usePeriodoGlobal, MES_NENHUM } from "./PeriodoGlobalProvider";
import { brl, brlDec, num } from "@/lib/format";
import { TEMA } from "@/lib/brand";
import { ContaMap, LinhaCliente } from "@/lib/types";
import {
  calcularDestaques, ContribuicaoConta, Destaques,
  serieCplDiaria, elegibilidadeDestaque, PISO_CONVERSOES_DESTAQUE, PISO_CONVERSOES_GESTOR,
} from "@/lib/destaques";
import { buscarCriativosMes, CriativoMes } from "@/lib/useCriativosMes";
import MiniCardCriativo from "./MiniCardCriativo";
import SecaoHeader from "./SecaoHeader";
import IndicadorFrescor from "./IndicadorFrescor";
import DeltaChip from "./DeltaChip";
import CardGestor from "./CardGestor";
import SlopeCpl from "./SlopeCpl";
import BarraSplit from "./BarraSplit";

// O waterfall é o ÚNICO ponto desta tela que usa recharts, e só aparece quando o
// usuário expande um gestor. Importado estaticamente, ele levava o First Load de
// 128 kB para 232 kB — quem só olha os cards pagava por um gráfico que não viu.
// Com dynamic, o recharts só desce na primeira expansão.
const Waterfall = dynamic(() => import("./Waterfall"), {
  ssr: false,
  loading: () => <div style={{ height: 220 }} aria-hidden="true" />,
});

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const RED = TEMA.negativo;
const AMBAR = TEMA.atencao;

// Uma conta entra na contagem de "mês incompleto" quando falta o começo do mês
// ANALISADO ou do mês de COMPARAÇÃO — nos dois casos a evolução dela é enganosa.
const TOOLTIP_INCOMPLETO =
  "Contas cuja série de dados começa depois do dia 1 do mês analisado ou do mês de "
  + "comparação. O total do mês delas fica subestimado, então a evolução não é "
  + "confiável. Expanda o gestor para ver quais são.";

// Mês anterior a (ano, mes), tratando a virada de ano.
const mesAnteriorDe = (ano: number, mes: number) => (mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 });

// Normaliza `desde` do gestorHistorico: pode vir como Timestamp serializado pelo
// /api/painel ({_seconds}) ou como ISO (gravado pelo import-contas). null = "desde
// sempre" (registro semente) e nunca conta como troca dentro do mês.
function desdeParaYmd(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v === "object" && "_seconds" in (v as object)) {
    const s = (v as { _seconds: number })._seconds;
    return new Date(s * 1000).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * A conta trocou de gestor DENTRO do mês analisado?
 *
 * A regra da agência é trocar só na virada do mês — então, dentro de um mês fechado,
 * cada conta tem um dono só e o campo `gestor` atual vale. Isto aqui é a DEFESA
 * contra o furo dessa regra: se alguém trocar no meio do mês, os números do mês
 * inteiro vão para o dono atual, e o mês do outro gestor some sem aviso.
 *
 * A regra passou a valer A PARTIR DE AGOSTO/2026 (decisão da agência). JULHO/2026
 * fica como está: mês inteiro atribuído ao gestor atual, inclusive nas contas que
 * trocaram de dono no dia 27 — por isso o selo aparece nelas, e é assim que deve ser.
 *
 * LIMITE CONHECIDO: o histórico só existe a partir de 29/07/2026 (quando a tela
 * /carteira entrou), e o import só passou a registrar na Etapa A. Trocas anteriores
 * a isso não têm registro — ausência de selo NÃO prova que não houve troca.
 */
function trocaNoMes(conta: ContaMap, ano: number, mes: number): string | null {
  const hist = conta.gestorHistorico;
  if (!Array.isArray(hist)) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ini = `${ano}-${pad(mes)}-01`;
  const fim = `${ano}-${pad(mes)}-31`; // limite superior lexicográfico basta
  for (const h of hist) {
    const d = desdeParaYmd((h as { desde?: unknown })?.desde);
    if (d && d >= ini && d <= fim) return d;
  }
  return null;
}

/**
 * POR QUE O MÊS RECEBIDO NÃO SERVE — derivado da própria lista, nunca chutado.
 *
 * ⚠️ Três motivos DIFERENTES levam ao mesmo aparo, e dizer "não dá" para os três seria
 * esconder a única informação útil: o que a pessoa faz a seguir muda em cada caso.
 * Mês que ainda não fechou volta a servir sozinho no dia 1º; mês fora da janela de
 * tráfego não volta nunca (a retenção é móvel); mês sem anterior é o limite da
 * comparação, não do dado.
 */
function motivoDoAparo(
  pedido: { ano: number; mes: number },
  meses: MesDisponivel[]
): string {
  const chave = (m: { ano: number; mes: number }) => m.ano * 12 + m.mes;
  if (!meses.length) return "não há mês fechado na janela de dados de tráfego";
  const p = chave(pedido);
  if (p > chave(meses[0])) return "ele ainda não fechou";
  if (p < chave(meses[meses.length - 1])) return "ele está fora da janela de dados de tráfego (~95 dias)";
  return "ele não tem o mês anterior inteiro na janela, então não haveria comparação";
}

export default function Gestores() {
  const { dados, erro } = useDadosPainel();

  // Regra única da casa: conta pausada fica FORA de tudo.
  const contasAtivas = useMemo(() => (dados ? dados.contas.filter((c) => !c.pausado) : []), [dados]);
  const daily = dados?.daily ?? [];

  // Meses fechados que a retenção alcança. Só é OFERECIDO o mês que tem o anterior
  // inteiro na janela — sem ele não há comparação, só número solto.
  const meses = useMemo(() => mesesDisponiveis(daily, contasAtivas), [daily, contasAtivas]);
  const comparaveis = useMemo(() => meses.filter((m) => m.cobreMesAnterior), [meses]);

  /**
   * ETAPA 2 do período compartilhado — a metade que existe.
   *
   * ⚠️ Esta é a ÚNICA tela do painel que ESCOLHE um mês. A /comercial mostra uma
   * SÉRIE de meses (o interruptor dela decide quantos aparecem, não qual vale), e
   * a /recuperacao não tem mês nenhum — então não existe, hoje, a segunda ponta
   * do compartilhamento. O que sobra é real e vale por si: o mês volta ao sair e
   * voltar para cá dentro da sessão, em vez de reiniciar no mais recente.
   *
   * ⚠️ LER É TOLERANTE (ver PeriodoGlobalProvider.tsx): o valor compartilhado só é
   * aceito se estiver entre os COMPARÁVEIS. Um mês fora da lista faria
   * `janelaMesFechado` devolver null e a tela cairia no vazio de "não há dois meses
   * fechados" — que é uma frase FALSA quando há, e o que faltou foi o mês pedido.
   *
   * ⚠️ E o fallback NÃO é gravado de volta. Se ele voltasse, a escolha do usuário
   * seria apagada por uma tela que só passou por ela.
   */
  const { mes: mesCompartilhado, escolherMes } = usePeriodoGlobal();
  const [sel, setSel] = useState<{ ano: number; mes: number } | null>(null);
  /** O mês que veio de outra tela e não coube aqui. null = não houve aparo. */
  const [aparo, setAparo] = useState<{ pedido: string; motivo: string; usado: string } | null>(null);
  useEffect(() => {
    if (sel || !comparaveis.length) return;
    const padrao = { ano: comparaveis[0].ano, mes: comparaveis[0].mes };
    // ⚠️ "nenhum mês em particular" (a /comercial em "todos os períodos") NÃO é um mês.
    // Esta tela não tem esse modo — mês fechado é sempre um mês — então ela ignora o
    // valor e segue no padrão dela, que é o que a régua das duas casas manda fazer com
    // o que não se entende.
    if (!mesCompartilhado || mesCompartilhado === MES_NENHUM) { setSel(padrao); return; }
    const pedido = mesCompartilhado;
    if (comparaveis.some((m) => m.ano === pedido.ano && m.mes === pedido.mes)) {
      setSel(pedido);
      return;
    }
    /**
     * ⚠️ APARA E DIZ QUE APAROU. Sem a segunda metade, quem veio da /comercial vendo a
     * safra de agosto cai numa tela de julho com todos os números diferentes e nada na
     * interface explicando — e a pergunta "por que mudou?" não tem onde ser respondida.
     *
     * ⚠️ E NÃO GRAVA o padrão de volta no estado compartilhado: se gravasse, voltar para
     * a /comercial te tiraria da safra que você estava vendo, sem clique nenhum.
     */
    setSel(padrao);
    setAparo({
      pedido: rotuloMes(pedido.ano, pedido.mes),
      motivo: motivoDoAparo(pedido, meses),
      usado: rotuloMes(padrao.ano, padrao.mes),
    });
  }, [comparaveis, meses, sel, mesCompartilhado]);

  const janela = useMemo(
    () => (sel ? janelaMesFechado(daily, contasAtivas, sel.ano, sel.mes) : null),
    [daily, contasAtivas, sel]
  );

  const painel = useMemo(
    () => (janela ? montarPainel(daily, contasAtivas, janela.D, janela.espec) : null),
    [daily, contasAtivas, janela]
  );

  // Mês ANTERIOR montado à parte, para a evolução CONTA A CONTA. O painel do mês
  // selecionado só traz a janela atual; aqui reaproveitamos a mesma janelaMesFechado
  // apontada para o mês anterior e usamos só a parte "atual" dela.
  const painelAnterior = useMemo(() => {
    if (!sel) return null;
    const a = mesAnteriorDe(sel.ano, sel.mes);
    const j = janelaMesFechado(daily, contasAtivas, a.ano, a.mes);
    return j ? montarPainel(daily, contasAtivas, j.D, j.espec) : null;
  }, [daily, contasAtivas, sel]);

  // accountId -> números do mês anterior (para o Δ por conta).
  const anteriorPorConta = useMemo(() => {
    const m = new Map<string, { gasto: number; conversas: number; cpl: number }>();
    for (const d of painelAnterior?.detalhes ?? []) {
      for (const c of d.clientes) {
        m.set(c.accountId, { gasto: c.gasto, conversas: c.conversas, cpl: c.cplSemanal });
      }
    }
    return m;
  }, [painelAnterior]);

  const [expandido, setExpandido] = useState<string | null>(null);
  const contaPorId = useMemo(() => new Map(contasAtivas.map((c) => [c.accountId, c])), [contasAtivas]);

  // Contagem de contas com mês incompleto, POR GESTOR. Aparece já nesta etapa: sem
  // isso alguém bate o olho no comparativo e tira conclusão de base incompleta.
  const incompletasPorGestor = useMemo(() => {
    const mapa = new Map<string, { total: number; incompletas: number; nomes: string[] }>();
    if (!sel) return mapa;
    const ant = mesAnteriorDe(sel.ano, sel.mes);
    for (const c of contasAtivas) {
      const a = coberturaMes(daily, c.accountId, sel.ano, sel.mes);
      const b = coberturaMes(daily, c.accountId, ant.ano, ant.mes);
      const semDadoNenhum = a.primeiroDiaSerie === null;
      const incompleta = !semDadoNenhum && (!a.completo || !b.completo);
      const reg = mapa.get(c.gestor) ?? { total: 0, incompletas: 0, nomes: [] };
      reg.total++;
      if (incompleta) { reg.incompletas++; reg.nomes.push(c.cliente); }
      mapa.set(c.gestor, reg);
    }
    return mapa;
  }, [daily, contasAtivas, sel]);

  // Cobertura por CONTA (accountId → detalhe), consumida pela expansão.
  const coberturaPorConta = useMemo(() => {
    const m = new Map<string, { incompleta: boolean; desde: string | null; semDado: boolean }>();
    if (!sel) return m;
    const ant = mesAnteriorDe(sel.ano, sel.mes);
    for (const c of contasAtivas) {
      const a = coberturaMes(daily, c.accountId, sel.ano, sel.mes);
      const b = coberturaMes(daily, c.accountId, ant.ano, ant.mes);
      const semDado = a.primeiroDiaSerie === null;
      m.set(c.accountId, {
        semDado,
        incompleta: !semDado && (!a.completo || !b.completo),
        // Mostra a partir de quando existe dado — o "desde" que a tela exibe.
        desde: a.completo ? (b.completo ? null : b.primeiroDiaSerie) : a.primeiroDiaSerie,
      });
    }
    return m;
  }, [daily, contasAtivas, sel]);

  // ---- Cálculo POR GESTOR, elevado para cá ----
  // Fica no topo por dois motivos: o premiado só se decide olhando todos, e assim
  // os destaques são computados UMA vez (a expansão recebe pronto, não recalcula).
  const porGestor = useMemo(() => {
    const m = new Map<string, {
      destaques: Destaques | null;
      elegivel: boolean;
      motivoInelegivel: string | null;
      serieCpl: number[];
      incompletasIds: Set<string>;
    }>();
    if (!sel || !painel || !janela) return m;

    for (const g of painel.gestores) {
      const contasG = contasAtivas.filter((c) => c.gestor === g.nome);
      const incompletasIds = new Set<string>();
      for (const c of contasG) {
        if (coberturaPorConta.get(c.accountId)?.incompleta) incompletasIds.add(c.accountId);
      }
      const detA = painel.detalhes.find((d) => d.gestor === g.nome);
      const anteriores = new Map<string, { gasto: number; conversas: number }>();
      for (const c of painelAnterior?.detalhes.find((d) => d.gestor === g.nome)?.clientes ?? []) {
        anteriores.set(c.accountId, { gasto: c.gasto, conversas: c.conversas });
      }
      const destaques = calcularDestaques(detA?.clientes ?? [], anteriores, incompletasIds);
      const el = elegibilidadeDestaque(g.conversas, destaques);
      m.set(g.nome, {
        destaques,
        elegivel: el.elegivel,
        motivoInelegivel: el.motivo,
        serieCpl: serieCplDiaria(daily, contasG, janela),
        incompletasIds,
      });
    }
    return m;
  }, [sel, painel, painelAnterior, janela, contasAtivas, coberturaPorConta, daily]);

  // O selo vai para o melhor em evolução ENTRE OS ELEGÍVEIS. Se o 1º do ranking é
  // inelegível, ele é pulado (e mostra o aviso no card) e o selo desce para o próximo.
  const premiado = useMemo(() => {
    if (!painel) return null;
    const ord = [...painel.gestores]
      .filter((g) => g.conversas > 0)
      .sort((a, b) => a.cplVar - b.cplVar); // menor variação = melhor evolução
    return ord.find((g) => porGestor.get(g.nome)?.elegivel)?.nome ?? null;
  }, [painel, porGestor]);

  // Pontos do slope. TODOS os gestores entram, inclusive os de volume baixo — o piso
  // de conversões vale só para a elegibilidade do SELO, não para a exibição aqui.
  // Quem está abaixo do piso vai marcado (linha tracejada + ⚠ + motivo no tooltip),
  // e a escala logarítmica do gráfico é o que mantém as linhas normais legíveis
  // mesmo com um CPL uma ordem de grandeza acima.
  const pontosSlope = useMemo(() => {
    if (!painel) return [];
    return painel.gestores.map((g) => {
      const ant = painelAnterior?.gestores.find((x) => x.nome === g.nome);
      return {
        nome: g.nome,
        cplAnterior: ant?.cpl ?? 0,
        cplAtual: g.cpl,
        volumeBaixo: g.conversas < PISO_CONVERSOES_GESTOR,
        conversas: g.conversas,
      };
    });
  }, [painel, painelAnterior]);

  // ORDEM DOS CARDS: por EVOLUÇÃO (maior queda de CPL primeiro), não por gasto.
  // A métrica do bônus é a evolução do CPL contra o mês anterior, então a ordem da
  // tela espelha o critério da premiação. Gestor sem conversão no mês não tem
  // evolução definida e vai para o fim.
  const gestoresPorEvolucao = useMemo(() => {
    if (!painel) return [];
    return [...painel.gestores].sort((a, b) => {
      if (a.conversas === 0 && b.conversas === 0) return b.gasto - a.gasto;
      if (a.conversas === 0) return 1;
      if (b.conversas === 0) return -1;
      return a.cplVar - b.cplVar; // menor variação = maior queda = melhor
    });
  }, [painel]);

  const [visao, setVisao] = useState<"cards" | "tabela">("cards");
  const carregando = !dados && !erro;
  const mesSelecionado = sel ? meses.find((m) => m.ano === sel.ano && m.mes === sel.mes) : null;
  // Meses fechados que existem mas NÃO podem ser comparados (mês anterior fora da janela).
  const semComparacao = meses.filter((m) => !m.cobreMesAnterior);
  const labelAnterior = janela?.labelAnterior ?? "";
  const labelAtual = janela?.labelAtual ?? "";

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-brand-ink">Análise de Gestores</h1>
          <p className="text-[13px]" style={{ color: MUTED }}>
            Mês fechado contra mês fechado — o recorte usado para avaliar o mês do gestor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IndicadorFrescor ultimaSync={dados?.ultimaSync ?? null} />
          {comparaveis.length > 0 && sel && (
            <select
              value={`${sel.ano}-${sel.mes}`}
              onChange={(e) => {
                const [a, m] = e.target.value.split("-").map(Number);
                setSel({ ano: a, mes: m });
                // O aviso descreve o que aconteceu NA CHEGADA. Depois de um clique aqui,
                // ele passaria a explicar uma escolha que não é mais a que está na tela.
                setAparo(null);
                // ⚠️ ESCREVER É SÓ POR CLIQUE: este onChange é o único ponto do app
                // que grava o mês compartilhado. O useEffect acima LÊ e pode cair no
                // padrão — e não devolve nada para cá.
                escolherMes({ ano: a, mes: m });
              }}
              className="rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: CARD, color: TEMA.texto, border: `1px solid ${LINE}` }}
            >
              {comparaveis.map((m) => (
                <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>{m.label}</option>
              ))}
              {/* Meses sem comparação aparecem DESABILITADOS e com o motivo: melhor
                  mostrar que existem e por que não servem do que sumir sem explicação. */}
              {semComparacao.map((m) => (
                <option key={`x-${m.ano}-${m.mes}`} disabled value="">
                  {m.label} — sem mês anterior na janela
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {erro ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: RED }}>
          {erro}
        </div>
      ) : carregando ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse motion-reduce:animate-none"
              style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }} />
          ))}
        </div>
      ) : !comparaveis.length || !janela || !painel ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}>
          Ainda não há dois meses fechados completos na janela de dados (~95 dias).
          A comparação fica disponível quando o histórico alcançar o mês anterior inteiro.
        </div>
      ) : (
        <>
          {/* Avisos honestos da janela ativa */}
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: TEMA.chip, color: MUTED }}>
              {painel.periodoLabel}
            </span>
            {/* ⚠️ ÂMBAR, não vermelho: nada quebrou. É um limite da janela de dados de
                tráfego encontrando uma escolha feita numa tela que tem outra régua. */}
            {aparo && (
              <span className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}>
                ⚠ você vinha de <b>{aparo.pedido}</b> em outra tela, mas {aparo.motivo} — mostrando <b>{aparo.usado}</b>
              </span>
            )}
            {janela.parcial && (
              <span className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}
                title="A série disponível não cobre um dos meses inteiro. Os totais podem estar subestimados.">
                ⚠ janela parcial — série não cobre os dois meses inteiros
              </span>
            )}
            {mesSelecionado && !mesSelecionado.cobreInicio && (
              <span className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}>
                ⚠ o mês analisado começa antes do histórico disponível
              </span>
            )}
          </div>

          {/* Slope: a evolução dos 8 num relance, antes do detalhe.
              ⚠️ A legenda vira SUBTÍTULO do cabeçalho em vez de texto solto à direita:
              ela explica como LER o gráfico, então pertence ao título, não ao canto. */}
          <SecaoHeader
            titulo="Evolução do CPL"
            icone="↗"
            subtitulo="verde = caiu (bom) · vermelho = subiu · passe o mouse para isolar uma linha"
            pill={`${labelAnterior} → ${labelAtual}`}
          />
          <div className="mb-6 p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
            <SlopeCpl pontos={pontosSlope} labelAnterior={labelAnterior} labelAtual={labelAtual} />
          </div>

          {/* Toggle de visão: cards para varredura, tabela densa para conferência. */}
          <div className="mb-4 flex items-center gap-1 rounded-full p-1"
            style={{ background: CARD, border: `1px solid ${LINE}`, width: "fit-content" }}>
            {(["cards", "tabela"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
                style={visao === v
                  ? { background: TEMA.destaque, color: TEMA.textoSobreDestaque }
                  : { background: "transparent", color: MUTED }}
              >
                {v === "cards" ? "Cards" : "Tabela"}
              </button>
            ))}
          </div>

          {visao === "cards" ? (
            <div className="mb-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              {gestoresPorEvolucao.map((g) => {
                const info = porGestor.get(g.nome);
                const cob = incompletasPorGestor.get(g.nome);
                const aberto = expandido === g.nome;
                return (
                  <Fragment key={g.nome}>
                    <CardGestor
                      nome={g.nome}
                      cpl={g.cpl}
                      cplVar={g.cplVar}
                      conversas={g.conversas}
                      gasto={g.gasto}
                      serieCpl={info?.serieCpl ?? []}
                      premiado={premiado === g.nome}
                      motivoInelegivel={info?.motivoInelegivel ?? null}
                      contasTotal={cob?.total ?? 0}
                      contasIncompletas={cob?.incompletas ?? 0}
                      aberto={aberto}
                      onClick={() => setExpandido(aberto ? null : g.nome)}
                    />
                    {aberto && (
                      // Ocupa a linha inteira do grid para o detalhe respirar.
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div className="p-4" style={{ background: TEMA.zebra, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
                          <DetalheGestor
                            clientes={painel.detalhes.find((d) => d.gestor === g.nome)?.clientes ?? []}
                            anteriorPorConta={anteriorPorConta}
                            coberturaPorConta={coberturaPorConta}
                            contaPorId={contaPorId}
                            ano={sel!.ano}
                            mes={sel!.mes}
                            destaques={info?.destaques ?? null}
                            b2b={g.b2b}
                            b2c={g.b2c}
                            labelAnterior={labelAnterior}
                            labelAtual={labelAtual}
                          />
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          ) : (
          <div className="overflow-x-auto rounded-xl" style={{ background: CARD, boxShadow: TEMA.sombraCard }}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr style={{ color: MUTED }} className="text-left">
                  <th className="px-4 py-3 font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Gestor</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Gasto</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Conversões</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>CPL</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>
                    <span className="inline-flex items-center gap-1">
                      Δ CPL
                      <span title="Variação contra o mês anterior. CPL caindo é BOM (verde)."
                        style={{ cursor: "help", color: MUTED }} className="text-[11px]">ⓘ</span>
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Carteira</th>
                </tr>
              </thead>
              <tbody>
                {painel.gestores.map((g, i) => {
                  const cob = incompletasPorGestor.get(g.nome);
                  const aberto = expandido === g.nome;
                  const det = painel.detalhes.find((d) => d.gestor === g.nome);
                  return (
                    <Fragment key={g.nome}>
                    <tr
                      onClick={() => setExpandido(aberto ? null : g.nome)}
                      className="cursor-pointer transition-colors hover:bg-brand-hover"
                      style={i % 2 === 1 && !aberto ? { background: TEMA.zebra } : undefined}
                    >
                      <td className="px-4 py-3 font-medium" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>
                        <span className="mr-1.5 inline-block text-[10px]" style={{ color: MUTED }}>{aberto ? "▼" : "▶"}</span>
                        {g.nome}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>
                        {brl(g.gasto)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>
                        {num(g.conversas)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>
                        {g.conversas > 0 ? brlDec(g.cpl) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ borderBottom: `1px solid ${LINE}` }}>
                        {/* menorMelhor: CPL caindo é bom → verde */}
                        <DeltaChip delta={g.conversas > 0 ? g.cplVar : null} menorMelhor
                          motivo={g.conversas > 0 ? null : "sem conversões no mês — CPL indefinido"} />
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid ${LINE}`, color: MUTED }}>
                        <span className="tabular-nums">{cob?.total ?? 0}</span> contas
                        {!!cob?.incompletas && (
                          <span className="ml-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                            style={{ background: TEMA.limiteFundo, color: AMBAR, cursor: "help" }}
                            title={`${TOOLTIP_INCOMPLETO}\n\n${cob.nomes.join(", ")}`}>
                            {cob.incompletas} com mês incompleto
                          </span>
                        )}
                      </td>
                    </tr>
                    {aberto && (
                      <tr>
                        <td colSpan={6} className="px-4 pb-5 pt-1" style={{ borderBottom: `1px solid ${LINE}`, background: TEMA.zebra }}>
                          <DetalheGestor
                            clientes={det?.clientes ?? []}
                            anteriorPorConta={anteriorPorConta}
                            coberturaPorConta={coberturaPorConta}
                            contaPorId={contaPorId}
                            ano={sel!.ano}
                            mes={sel!.mes}
                            destaques={porGestor.get(g.nome)?.destaques ?? null}
                            b2b={g.b2b}
                            b2c={g.b2c}
                            labelAnterior={labelAnterior}
                            labelAtual={labelAtual}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          <p className="mt-4 text-[12px]" style={{ color: MUTED }}>
            Clique num gestor para ver a carteira conta a conta. Criativos do mês entram na próxima etapa.
            {dados?.ultimaSync && ` Dados até ${ymdParaBR(dados.ultimaSync.slice(0, 10))}.`}
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalhe de um gestor: a carteira conta a conta, no mês selecionado.
// ---------------------------------------------------------------------------
function DetalheGestor({
  clientes, anteriorPorConta, coberturaPorConta, contaPorId, ano, mes,
  destaques, b2b, b2c, labelAnterior, labelAtual,
}: {
  clientes: LinhaCliente[];
  anteriorPorConta: Map<string, { gasto: number; conversas: number; cpl: number }>;
  coberturaPorConta: Map<string, { incompleta: boolean; desde: string | null; semDado: boolean }>;
  contaPorId: Map<string, ContaMap>;
  ano: number;
  mes: number;
  /** Já calculado no topo — a expansão não recalcula. */
  destaques: Destaques | null;
  b2b: number;
  b2c: number;
  labelAnterior: string;
  labelAtual: string;
}) {
  const todas = [...clientes].sort((a, b) => b.gasto - a.gasto);
  // Quanto do gasto do gestor vem de contas com base de comparação quebrada.
  const gastoTotal = todas.reduce((s, c) => s + c.gasto, 0);
  const gastoIncompleto = todas.reduce(
    (s, c) => s + (coberturaPorConta.get(c.accountId)?.incompleta ? c.gasto : 0), 0
  );

  // Contas sem veiculação nos DOIS meses saem da tabela e viram um rodapé discreto:
  // linha cheia de traços não informa nada e só empurra o que importa para baixo.
  const semVeiculacao = new Set((destaques?.semVeiculacao ?? []).map((c) => c.accountId));
  const linhas = todas.filter((c) => !semVeiculacao.has(c.accountId));
  const nomesSemVeiculacao = (destaques?.semVeiculacao ?? []).map((c) => c.cliente);

  if (!todas.length) {
    return <p className="py-3 text-[13px]" style={{ color: MUTED }}>Nenhuma conta com dado no período.</p>;
  }

  return (
    <div className="pt-2">
      {destaques && destaques.deltaCpl !== null && (
        <>
          <BlocoDestaques d={destaques} />
          {/* Waterfall: a mesma decomposição do bloco acima, desenhada. Do CPL do mês
              anterior ao atual, uma barra por conta — fecha exatamente porque o
              shift-share é exato (ver lib/destaques.ts). */}
          <div className="mb-4 rounded-lg p-3" style={{ background: TEMA.card, border: `1px solid ${LINE}` }}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
              Como o CPL saiu de {brlDec(destaques.cplAnterior!)} para {brlDec(destaques.cplAtual!)}
            </p>
            <Waterfall
              cplAnterior={destaques.cplAnterior!}
              cplAtual={destaques.cplAtual!}
              contribuicoes={destaques.contribuicoes}
              labelAnterior={labelAnterior}
              labelAtual={labelAtual}
            />
          </div>
        </>
      )}

      <div className="mb-4 rounded-lg p-3" style={{ background: TEMA.card, border: `1px solid ${LINE}` }}>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          Origem das conversões
        </p>
        <BarraSplit b2b={b2b} b2c={b2c} />
      </div>

      <BlocoCriativos contas={todas} ano={ano} mes={mes} />
      {gastoIncompleto > 0 && (
        <p className="mb-3 rounded-lg px-3 py-1.5 text-[12px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}>
          {brl(gastoIncompleto)} de {brl(gastoTotal)} ({Math.round((gastoIncompleto / gastoTotal) * 100)}%)
          vêm de contas sem mês completo — a evolução delas não é comparável.
        </p>
      )}
      {/* A tabela ESCONDE as contas sem veiculação (viram rodapé), então contar as
          linhas não bate com o total do card do gestor. Esta linha fecha a conta —
          sem ela, numerar convidaria justamente à conferência que dá errado. */}
      <p className="mb-1.5 text-[11px]" style={{ color: MUTED }}>
        <span className="tabular-nums">{linhas.length}</span> conta{linhas.length === 1 ? "" : "s"} com veiculação
        {nomesSemVeiculacao.length > 0 && (
          <> · <span className="tabular-nums">{nomesSemVeiculacao.length}</span> sem veiculação (no rodapé)</>
        )}
        {" · "}<span className="tabular-nums">{todas.length}</span> no total
      </p>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr style={{ color: MUTED }} className="text-left">
            {/* Mesma regra das outras telas: posição na lista como está na tela. */}
            <th className="w-8 py-2 pr-3 text-right font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Conta</th>
            <th className="py-2 pr-3 text-right font-medium">Gasto</th>
            <th className="py-2 pr-3 text-right font-medium">Conv.</th>
            <th className="py-2 pr-3 text-right font-medium">CPL</th>
            <th className="py-2 pr-3 text-right font-medium">Δ CPL</th>
            <th className="py-2 font-medium">Observação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c, i) => {
            const ant = anteriorPorConta.get(c.accountId);
            const cob = coberturaPorConta.get(c.accountId);
            const conta = contaPorId.get(c.accountId);
            const troca = conta ? trocaNoMes(conta, ano, mes) : null;

            // Δ só existe com base comparável: mês completo dos DOIS lados e
            // conversões nos dois meses. Fora disso é "—" com o motivo — nunca
            // número limpo sobre base quebrada.
            const temBase = !cob?.incompleta && !!ant && ant.conversas > 0 && c.conversas > 0;
            const delta = temBase ? Math.round(((c.cplSemanal - ant!.cpl) / ant!.cpl) * 100) : null;
            const motivo = cob?.incompleta
              ? `Mês incompleto${cob.desde ? ` — dados a partir de ${ymdParaBR(cob.desde)}` : ""}. Sem base de comparação confiável.`
              : !ant || ant.conversas === 0
                ? "Sem conversões no mês anterior — não há CPL para comparar."
                : c.conversas === 0
                  ? "Sem conversões neste mês — CPL indefinido."
                  : null;

            return (
              <tr key={c.accountId}>
                <td className="py-2 pr-3 text-right tabular-nums" style={{ color: MUTED }}>{i + 1}</td>
                <td className="py-2 pr-3" style={{ color: TEMA.texto }}>{c.cliente}</td>
                <td className="py-2 pr-3 text-right tabular-nums" style={{ color: TEMA.texto }}>{brl(c.gasto)}</td>
                <td className="py-2 pr-3 text-right tabular-nums" style={{ color: TEMA.texto }}>{num(c.conversas)}</td>
                <td className="py-2 pr-3 text-right tabular-nums" style={{ color: TEMA.texto }}>
                  {c.conversas > 0 ? brlDec(c.cplSemanal) : "—"}
                </td>
                <td className="py-2 pr-3 text-right">
                  <DeltaChip delta={delta} menorMelhor motivo={motivo} />
                </td>
                <td className="py-2">
                  <span className="flex flex-wrap gap-1">
                    {cob?.incompleta && (
                      <span className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                        style={{ background: TEMA.limiteFundo, color: AMBAR }}>
                        {cob.desde ? `dados a partir de ${ymdParaBR(cob.desde)}` : "mês incompleto"}
                      </span>
                    )}
                    {troca && (
                      <span className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                        style={{ background: TEMA.erroFundo, color: TEMA.negativo, cursor: "help" }}
                        title="A regra da agência é trocar gestor só na virada do mês. Esta conta trocou DENTRO do mês, então os números do mês inteiro estão atribuídos ao gestor atual.">
                        trocou de gestor em {ymdParaBR(troca)}
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {nomesSemVeiculacao.length > 0 && (
        <p className="mt-3 text-[11px]" style={{ color: MUTED }}>
          {nomesSemVeiculacao.length} conta{nomesSemVeiculacao.length > 1 ? "s" : ""} sem veiculação no período
          (gasto zero nos dois meses): {nomesSemVeiculacao.join(", ")}.
        </p>
      )}
    </div>
  );
}

/**
 * Melhor e pior criativo do mês — SOB DEMANDA.
 *
 * Não carrega junto com a tela: são ~9 chamadas para um gestor médio, e a maioria
 * das visitas nem abre este bloco. A partir da segunda vez o servidor responde do
 * cache permanente, sem custar chamada de insights.
 */
function BlocoCriativos({
  contas, ano, mes,
}: {
  contas: LinhaCliente[];
  ano: number;
  mes: number;
}) {
  const [estado, setEstado] = useState<"inicial" | "carregando" | "pronto" | "erro">("inicial");
  const [dados, setDados] = useState<{ criativos: CriativoMes[]; falhas: number; deCache: number } | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  async function carregar() {
    setEstado("carregando");
    setErroMsg(null);
    try {
      const alvo = contas.map((c) => ({ accountId: c.accountId, cliente: c.cliente }));
      setDados(await buscarCriativosMes(alvo, ano, mes));
      setEstado("pronto");
    } catch (e) {
      setErroMsg((e as Error).message);
      setEstado("erro");
    }
  }

  // Mesmo piso do ranking de criativos do Dashboard: anúncio com 1 conversão
  // produz CPL extremo sem significado, e numa tela de bonificação isso viraria
  // "pior criativo" injustamente.
  const elegiveis = (dados?.criativos ?? [])
    .filter((c) => c.conversas >= PISO_CONVERSOES_DESTAQUE)
    .sort((a, b) => a.cpl - b.cpl);
  const melhor = elegiveis[0] ?? null;
  const pior = elegiveis.length > 1 ? elegiveis[elegiveis.length - 1] : null;

  return (
    <div className="rounded-lg p-3" style={{ background: TEMA.card, border: `1px solid ${LINE}` }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          Criativos do mês
        </p>
        {estado === "inicial" && (
          <button
            onClick={carregar}
            className="rounded-full px-3 py-1 text-[12px] font-medium"
            style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
          >
            Carregar
          </button>
        )}
        {estado === "pronto" && dados && (
          <span className="text-[11px]" style={{ color: MUTED }}>
            {dados.criativos.length} anúncios · {elegiveis.length} com ≥{PISO_CONVERSOES_DESTAQUE} conversões
            {dados.deCache > 0 && ` · ${dados.deCache} conta(s) do cache`}
            {dados.falhas > 0 && ` · ${dados.falhas} conta(s) falharam`}
          </span>
        )}
      </div>

      {estado === "inicial" && (
        <p className="text-[12px]" style={{ color: MUTED }}>
          Consulta a Meta na primeira vez; depois vem do cache (mês fechado não muda).
        </p>
      )}
      {estado === "carregando" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl motion-reduce:animate-none" style={{ background: TEMA.chip }} />
          ))}
        </div>
      )}
      {estado === "erro" && (
        <p className="text-[12px]" style={{ color: RED }}>{erroMsg}</p>
      )}
      {estado === "pronto" && (
        elegiveis.length === 0 ? (
          <p className="text-[12px]" style={{ color: MUTED }}>
            Nenhum anúncio com pelo menos {PISO_CONVERSOES_DESTAQUE} conversões no mês.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniCardCriativo c={melhor!} rotulo="melhor CPL" bom />
            {pior && <MiniCardCriativo c={pior} rotulo="pior CPL" bom={false} />}
          </div>
        )
      )}
    </div>
  );
}

// Destaques calculados por regra: o "por que o CPL mudou" em números conferíveis.
function BlocoDestaques({ d }: { d: NonNullable<ReturnType<typeof calcularDestaques>> }) {
  const seta = d.melhorou ? "▼" : "▲";
  const cor = d.melhorou ? TEMA.positivo : TEMA.negativo;
  const fundo = d.melhorou ? TEMA.positivoFundo : TEMA.negativoFundo;

  const Item = ({ c }: { c: ContribuicaoConta }) => (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span style={{ color: TEMA.texto }}>{c.cliente}</span>
      <span className="tabular-nums font-medium" style={{ color: c.contribuicao < 0 ? TEMA.positivo : TEMA.negativo }}>
        {c.contribuicao > 0 ? "+" : "−"}{brlDec(Math.abs(c.contribuicao))}
      </span>
      <span className="tabular-nums" style={{ color: MUTED }}>({Math.round(c.pesoPct)}%)</span>
      {c.incompleta && (
        <span className="rounded px-1 py-0.5 text-[10px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}>
          mês incompleto
        </span>
      )}
    </span>
  );

  return (
    <div className="mb-4 rounded-lg p-3" style={{ background: TEMA.card, border: `1px solid ${LINE}` }}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-semibold uppercase tracking-wider text-[11px]" style={{ color: MUTED }}>Destaques</span>
        <span style={{ color: MUTED }}>
          CPL {brlDec(d.cplAnterior!)} → <strong style={{ color: TEMA.texto }}>{brlDec(d.cplAtual!)}</strong>
        </span>
        <span className="rounded-md px-1.5 py-0.5 font-medium tabular-nums" style={{ background: fundo, color: cor }}>
          {seta} {d.deltaCpl! > 0 ? "+" : "−"}{brlDec(Math.abs(d.deltaCpl!))}
        </span>
        <span style={{ color: MUTED }}>
          · <strong style={{ color: TEMA.texto }}>{d.contasPara80Pct}</strong>
          {d.contasPara80Pct === 1 ? " conta explica" : " contas explicam"} 80% do movimento
        </span>
      </div>

      {d.aFavor.length > 0 && (
        <p className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <span style={{ color: MUTED }}>{d.melhorou ? "Puxaram para baixo:" : "Puxaram para cima:"}</span>
          {d.aFavor.slice(0, 3).map((c) => <Item key={c.accountId} c={c} />)}
        </p>
      )}

      {d.contrarias.length > 0 && (
        <p className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <span style={{ color: MUTED }}>Na direção contrária:</span>
          {d.contrarias.slice(0, 3).map((c) => <Item key={c.accountId} c={c} />)}
        </p>
      )}

      {(d.entradas.length > 0 || d.saidas.length > 0) && (
        <p className="text-[12px]" style={{ color: MUTED }}>
          {d.entradas.length > 0 && <>Entraram no período: {d.entradas.map((c) => c.cliente).join(", ")}. </>}
          {d.saidas.length > 0 && <>Pararam: {d.saidas.map((c) => c.cliente).join(", ")}.</>}
        </p>
      )}
    </div>
  );
}
