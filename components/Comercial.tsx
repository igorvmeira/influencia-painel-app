"use client";

import { useMemo, useState } from "react";
import { useComercial } from "@/lib/useComercial";
import { TEMA, MOVIMENTO } from "@/lib/brand";
import { useEntrada, atrasoDe } from "@/lib/useEntrada";
import SecaoHeader from "./SecaoHeader";
import BarraDado from "./BarraDado";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const GOLD = TEMA.destaque;
const RED = TEMA.negativo;
const AMBER = TEMA.atencao;

/** Quantos meses as séries mostram por padrão. */
const MESES_VISIVEIS = 12;

const n = (v: number) => v.toLocaleString("pt-BR");
const mesCurto = (m: string) => {
  const [a, mm] = m.split("-");
  return `${["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(mm)]}/${a.slice(2)}`;
};

/**
 * Seção = cabeçalho FORA do card + card com o conteúdo.
 *
 * ⚠️ Mudou de forma: o título vivia DENTRO do card, o que fazia cada bloco
 * parecer um documento fechado em si. Com o `SecaoHeader` do lado de fora, a
 * barra dourada alinha as seções numa coluna só e a tela passa a ter ritmo
 * vertical — é o que dá a densidade da referência sem comprimir espaçamento.
 */
function Bloco({
  titulo, sub, icone, pill, children,
}: {
  titulo: string; sub?: string; icone?: string; pill?: string; children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <SecaoHeader titulo={titulo} subtitulo={sub} icone={icone} pill={pill} />
      <div
        className="px-5 py-5"
        style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}
      >
        {children}
      </div>
    </section>
  );
}

/** Faixa de aviso no CORPO, nunca em tooltip — para limitação que muda a leitura
 *  do número principal. Ver a regra em data/xmax-integracao.md. */
function Aviso({ children, tom = "ouro" }: { children: React.ReactNode; tom?: "ouro" | "amber" }) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12.5px] leading-relaxed"
      style={{
        background: tom === "ouro" ? TEMA.avisoFundo : TEMA.limiteFundo,
        color: tom === "ouro" ? TEMA.ouroTexto : AMBER,
      }}
    >
      {children}
    </div>
  );
}

export default function Comercial() {
  const { agregado, carregando, erro } = useComercial();
  const [todosMeses, setTodosMeses] = useState(false);
  // Cada bloco animado tem o próprio observador: a cascata do funil não deve
  // esperar o usuário chegar nas faixas de idade, lá embaixo.
  const { ref: refFunil, entrou: entrouFunil } = useEntrada<HTMLDivElement>();
  const { ref: refIdade, entrou: entrouIdade } = useEntrada<HTMLDivElement>();

  const nomeEtapa = useMemo(
    () => new Map<number, string>([
      [15, "Novo Lead — TRÁFEGO"], [114, "LEADS OUTBOUND"],
      [118, "LEADS FUTUROS"], [138, "PROSPECÇÃO M&A"],
      [134, "COMPRA E VENDA"], [61, "Nutrição Negociação"],
    ]),
    []
  );

  if (erro) {
    return (
      <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: RED }}>
        {erro}
      </div>
    );
  }
  if (carregando) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse motion-reduce:animate-none"
            style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }} />
        ))}
      </div>
    );
  }
  // ⚠️ Sem agregado a tela AVISA. Nunca número de exemplo — número falso na tela
  // do cliente é pior que tela fora do ar (CLAUDE.md).
  if (!agregado) {
    return (
      <Aviso tom="amber">
        <b>Funil ainda não sincronizado.</b> O painel comercial lê um documento pré-agregado
        que é gravado pelo sync do Xmax, e ele ainda não rodou. Nenhum número é exibido até lá —
        por decisão de projeto, esta tela nunca mostra dado de exemplo.
      </Aviso>
    );
  }

  const { funil, recuperacao, negociacao, conversaAvancada, foraDoFunil, fechamento } = agregado;
  const maxNivel = Math.max(1, ...funil.niveis.map((x) => x.pessoas));
  const cortar = <T,>(a: T[]) => (todosMeses ? a : a.slice(-MESES_VISIVEIS));
  const emFechamento = fechamento.emFechamento;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-brand-ink">Funil Comercial</h1>
        <p className="text-[13px]" style={{ color: MUTED }}>
          Captação de novos clientes, na ordem definida pela agência. Sincronizado em{" "}
          {new Date(agregado.geradoEm).toLocaleString("pt-BR", { timeZone: agregado.fuso, dateStyle: "short", timeStyle: "short" })}.
        </p>
      </div>

      {/* ================= O FUNIL ================= */}
      <Bloco
        titulo="Onde as pessoas estão agora"
        icone="◧"
        sub={`${n(funil.pessoasNoFunil)} pessoas no funil de captação · ${n(funil.oportunidadesAbertas)} oportunidades abertas no total`}
      >
        {/* ⚠️ REGRA DA CASA: nunca um número solto chamado "leads". Cada linha diz
            se está contando PESSOA ou OPORTUNIDADE — é a diferença entre 476 e 1.660. */}
        <div ref={refFunil} className="space-y-2.5">
          {funil.niveis.map((nv, i) => (
            <div key={nv.nivel}>
              <div className="flex items-baseline gap-2">
                <span className="w-5 text-[11px] tabular-nums" style={{ color: MUTED }}>{nv.nivel}</span>
                <span className="flex-1 text-[13px] font-medium text-brand-ink">{nv.nome}</span>
                <span className="text-[15px] font-semibold tabular-nums text-brand-ink">{n(nv.pessoas)}</span>
                <span className="text-[11.5px]" style={{ color: MUTED }}>pessoas</span>
              </div>
              <div className="ml-7 mt-1 flex items-center gap-2">
                {/* Degradê só aqui: o dourado tem folga de contraste (9,44:1) e
                    aguenta escurecer; o neutro das outras barras não teria. */}
                <BarraDado
                  pct={(nv.pessoas / maxNivel) * 100}
                  cor={GOLD}
                  degrade
                  entrou={entrouFunil}
                  indice={i}
                  titulo={`${n(nv.pessoas)} pessoas no nível ${nv.nivel}`}
                />
                <span className="w-28 text-right text-[11.5px] tabular-nums" style={{ color: MUTED }}>
                  {n(nv.oportunidades)} oportunidades
                </span>
              </div>

              {/* ⚠️ O EMPATE DO NÍVEL 1, explicado na tela: tráfego e outbound são
                  duas PORTAS do mesmo degrau, não degraus diferentes. */}
              {nv.porEtapa ? (
                <div className="ml-7 mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                  {nv.porEtapa.map((e) => (
                    <span key={e.etapaId} className="text-[11.5px]" style={{ color: MUTED }}>
                      <b className="tabular-nums" style={{ color: TEMA.texto }}>{n(e.oportunidades)}</b>{" "}
                      {nomeEtapa.get(e.etapaId) ?? `etapa ${e.etapaId}`}
                    </span>
                  ))}
                  <span className="text-[11.5px]" style={{ color: MUTED }}>— mesmo degrau, duas portas de entrada</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t pt-3 text-[12.5px]" style={{ borderColor: LINE }}>
          {/* ⚠️ Havia um `opacity-70` nestes parênteses. Sobre texto que JÁ é `muted`,
              no escuro isso dá 3,59:1 — reprova a AA. No claro passava porque o
              blend ia na direção do branco. Opacidade sobre texto secundário é
              exatamente o tipo de coisa que inverte com o tema; o parêntese já
              separa hierarquia sem precisar apagar o texto. */}
          <span style={{ color: MUTED }}>
            <b className="tabular-nums" style={{ color: TEMA.texto }}>{n(negociacao.pessoas)}</b> em negociação
            <span> (Negociação + Fechamento)</span>
          </span>
          {/* Não é "a versão antiga de negociação": responde outra pergunta. */}
          <span style={{ color: MUTED }}>
            <b className="tabular-nums" style={{ color: TEMA.texto }}>{n(conversaAvancada.pessoas)}</b> em conversa avançada
            <span> (inclui Reunião agendada)</span>
          </span>
        </div>
      </Bloco>

      {/* ================= FECHAMENTO ================= */}
      <Bloco
        titulo="Fechamento — o que já está vendido"
        sub="A agência definiu que estar em Fechamento é negociação concluída, ou seja, venda feita."
      >
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div>
            <div className="text-[22px] font-semibold tabular-nums text-brand-ink">{n(emFechamento.pessoas)}</div>
            <div className="text-[12px]" style={{ color: MUTED }}>pessoas em Fechamento</div>
          </div>
          <div>
            <div className="text-[22px] font-semibold tabular-nums text-brand-ink">{n(fechamento.confirmadas.vendas)}</div>
            <div className="text-[12px]" style={{ color: MUTED }}>vendas marcadas como ganhas</div>
          </div>
        </div>

        {/* ⚠️ NO CORPO, NÃO EM TOOLTIP. É o número principal do dono, e a limitação
            muda como ele deve ser lido. Ver data/xmax-integracao.md. */}
        <div className="mt-3">
          <Aviso tom="amber">
            <b>Estas vendas não têm data.</b> O painel sabe que aconteceram, mas não em que mês:
            marcar &ldquo;ganhou&rdquo; no CRM é uma ação manual que ainda não virou rotina, e sem
            ela não existe data de fechamento. Por isso <b>não existe &ldquo;vendas em julho&rdquo;</b> —
            e o único jeito de esse número passar a existir é o comercial marcar a venda na hora.
          </Aviso>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[12.5px] font-medium text-brand-ink">Há quanto tempo estão paradas na etapa</div>
          {/* A idade é o que separa negociação viva de venda não registrada. */}
          <div ref={refIdade} className="space-y-1.5">
            {emFechamento.porIdade.map((f, i) => {
              const max = Math.max(1, ...emFechamento.porIdade.map((x) => x.pessoas));
              const velho = f.chave === "d181a365" || f.chave === "mais365";
              return (
                <div key={f.chave} className="flex items-center gap-3">
                  <span className="w-32 text-[12px]" style={{ color: MUTED }}>{f.rotulo}</span>
                  {/* Sem degradê: o âmbar não foi medido para escurecer, e misturar
                      barra chapada com barra em degradê na MESMA lista faria a
                      diferença parecer significado. Aqui o significado é a cor. */}
                  <BarraDado
                    pct={(f.pessoas / max) * 100}
                    cor={velho ? AMBER : GOLD}
                    entrou={entrouIdade}
                    indice={i}
                    titulo={`${n(f.pessoas)} pessoas — ${f.rotulo}`}
                  />
                  <span className="w-8 text-right text-[12.5px] font-medium tabular-nums text-brand-ink">{n(f.pessoas)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Bloco>

      {/* ================= FORA DO FUNIL — visível, nunca sumiço ================= */}
      <Bloco
        titulo="Fora do funil de captação"
        sub="Estas pessoas não entram nos números acima — e é justamente por isso que aparecem aqui."
      >
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-brand-ink">Em recuperação</div>
              <div className="text-[12px]" style={{ color: MUTED }}>
                Lead que não deu para trabalhar e está sendo retomado — {n(recuperacao.oportunidades)} oportunidades
                para {n(recuperacao.pessoas)} pessoas, porque a automação cria uma nova a cada disparo.
              </div>
            </div>
            <div className="text-right">
              <div className="text-[20px] font-semibold tabular-nums text-brand-ink">{n(recuperacao.pessoas)}</div>
              <div className="text-[11.5px]" style={{ color: MUTED }}>pessoas</div>
            </div>
          </div>

          {/* ⚠️ A recuperação é MAIOR que o funil. Dizer isso na tela é o ponto da
              Variante B — se ficasse escondida numa aba, a leitura do funil mentiria. */}
          {recuperacao.pessoas > funil.pessoasNoFunil ? (
            <Aviso>
              A recuperação tem <b>mais gente que o funil inteiro</b> ({n(recuperacao.pessoas)} contra{" "}
              {n(funil.pessoasNoFunil)}). Ler o funil sem olhar para cá dá a impressão de uma operação
              menor do que ela é.
            </Aviso>
          ) : null}

          <div className="border-t pt-3" style={{ borderColor: LINE }}>
            <div className="flex items-baseline justify-between">
              <div className="text-[13px] font-medium text-brand-ink">Em etapas fora deste funil</div>
              <div className="text-[15px] font-semibold tabular-nums text-brand-ink">{n(foraDoFunil.pessoas)}</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {foraDoFunil.porEtapa.map((e) => (
                <span key={e.etapaId} className="text-[12px]" style={{ color: MUTED }}>
                  <b className="tabular-nums" style={{ color: TEMA.texto }}>{n(e.pessoas)}</b>{" "}
                  {nomeEtapa.get(e.etapaId) ?? `etapa ${e.etapaId}`}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Bloco>

      {/* ================= SÉRIES ================= */}
      <Bloco
        titulo="Leads novos por mês"
        sub="Pessoa cujo PRIMEIRO contato foi no mês — não oportunidade criada no mês."
      >
        <SerieDupla itens={cortar(agregado.leadsNovos)} rotuloA="pessoas" rotuloB="oportunidades" />
      </Bloco>

      <Bloco
        titulo="Perdas por mês"
        sub="Uma vez sincronizada, a oportunidade perdida não some mais — fica registrada com a data e a etapa."
      >
        <SerieDupla itens={cortar(agregado.perdas)} rotuloA="pessoas" rotuloB="oportunidades" />
        {/* O painel mostra ONDE o lead morreu, nunca POR QUÊ: o Xmax não devolve o
            motivo da perda. Dito na tela em vez de coluna omitida em silêncio. */}
        <div className="mt-3">
          <Aviso>
            O CRM <b>não devolve o motivo da perda</b>, então o painel mostra quando e em que etapa
            o lead morreu — nunca por quê.
          </Aviso>
        </div>
      </Bloco>

      <button
        type="button"
        onClick={() => setTodosMeses((v) => !v)}
        className="text-[12.5px] underline underline-offset-2"
        style={{ color: MUTED }}
      >
        {todosMeses ? `Mostrar só os últimos ${MESES_VISIVEIS} meses` : "Mostrar o histórico completo"}
      </button>
    </div>
  );
}

/**
 * As duas contagens lado a lado, sempre. ⚠️ Quando a razão denuncia clonagem da
 * automação, o mês é MARCADO em vez de escondido — o dado é real, o que engana é
 * lê-lo como negócio. Ver o contraexemplo de 05/02/2026: volume alto com pessoas
 * distintas é campanha de verdade, e um filtro por volume a apagaria.
 */
function SerieDupla({
  itens, rotuloA, rotuloB,
}: {
  itens: { mes: string; pessoas: number; oportunidades: number; clonagem: boolean }[];
  rotuloA: string;
  rotuloB: string;
}) {
  const { ref, entrou } = useEntrada<HTMLDivElement>();
  if (!itens.length) return <p className="text-[12.5px]" style={{ color: MUTED }}>Sem dados no período.</p>;
  const max = Math.max(1, ...itens.map((x) => x.pessoas));
  return (
    <div ref={ref}>
      <div className="mb-2 flex justify-end gap-4 text-[11.5px]" style={{ color: MUTED }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: GOLD }} /> {rotuloA}
        </span>
        <span>{rotuloB} ao lado</span>
      </div>
      <div className="space-y-1">
        {itens.map((m, i) => (
          <div key={m.mes} className="flex items-center gap-3">
            <span className="w-14 text-[11.5px] tabular-nums" style={{ color: MUTED }}>{mesCurto(m.mes)}</span>
            {/* ⚠️ Série longa: o escalonamento tem teto de 240ms, senão 28 meses
                fariam a última barra começar 1,1s depois da primeira. */}
            <BarraDado
              pct={(m.pessoas / max) * 100}
              cor={GOLD}
              degrade
              entrou={entrou}
              indice={i}
              titulo={`${mesCurto(m.mes)}: ${n(m.pessoas)} pessoas`}
            />
            <span className="w-10 text-right text-[12.5px] font-medium tabular-nums text-brand-ink">{n(m.pessoas)}</span>
            <span className="w-24 text-right text-[11.5px] tabular-nums" style={{ color: MUTED }}>
              {n(m.oportunidades)} oport.
            </span>
            <span className="w-4">
              {m.clonagem ? (
                <span
                  title={`${n(m.oportunidades)} oportunidades para ${n(m.pessoas)} pessoas — a automação de recuperação criou várias para os mesmos contatos. O número de pessoas é o que vale.`}
                  className="cursor-help text-[12px]"
                  style={{ color: AMBER }}
                >
                  ⚠
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
