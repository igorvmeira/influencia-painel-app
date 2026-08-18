"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useComercial } from "@/lib/useComercial";
/**
 * ⚠️ SÓ `import type` DESTE MÓDULO. Ele importa `lib/comercial.ts`, que importa
 * `node:crypto` (hash do docId de pessoa) — um import de VALOR arrastaria a cadeia para o
 * bundle do cliente e o build quebra com `UnhandledSchemeError`. O typecheck passa nos
 * dois casos; só o `next build` acusa. Regras que a tela precisa vêm como DADO no
 * agregado (ex.: `cobraValor`), nunca como constante importada.
 */
import type { AgregadoComercial, SerieMes } from "@/lib/comercialAgregado";
import { TEMA, MOVIMENTO } from "@/lib/brand";
import { useEntrada, atrasoDe } from "@/lib/useEntrada";
import SecaoHeader from "./SecaoHeader";
import BarraDado from "./BarraDado";
import KpiCard from "./KpiCard";
import ColunasComMedia from "./ColunasComMedia";
import AvisoDadoVelho from "./AvisoDadoVelho";
import Modal from "./Modal";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const GOLD = TEMA.destaque;
const RED = TEMA.negativo;
const AMBER = TEMA.atencao;

/** Quantos meses as séries mostram por padrão. */
const MESES_VISIVEIS = 12;

/** Um nível do funil, como vem do agregado. Apelido para não repetir o caminho. */
type NivelDoFunil = AgregadoComercial["funil"]["niveis"][number];

/** Altura de cada faixa do funil, em px. FIXA e igual para todos os níveis — é o que
 *  faz a ÁREA de cada faixa ser proporcional ao valor. Num funil trapezoidal a área de
 *  uma faixa é (largura_de_cima + largura_de_baixo) ÷ 2, ou seja depende do nível
 *  SEGUINTE: nem fiel à largura, nem à área. Aqui largura e área dizem a mesma coisa. */
const ALTURA_FAIXA = 30;

const n = (v: number) => v.toLocaleString("pt-BR");
const reais = (cent: number) =>
  "R$ " + (cent / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const { agregado, carregando, erro, recarregar } = useComercial();
  const [todosMeses, setTodosMeses] = useState(false);
  /** Nível cuja lista de pessoas está aberta na janela. null = fechada. */
  const [etapaAberta, setEtapaAberta] = useState<NivelDoFunil | null>(null);
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

  // ⚠️ O ERRO MANTÉM O TÍTULO DA TELA e oferece saída. Sem o título, a pessoa não
  // sabe se errou de página; sem o botão, a única saída é recarregar o navegador
  // inteiro e perder o resto da sessão.
  if (erro) {
    return (
      <div>
        <h1 className="mb-4 text-lg font-semibold text-brand-ink">Funil Comercial</h1>
        <div
          className="rounded-xl px-4 py-4"
          style={{ background: TEMA.erroFundo, color: RED, border: `1px solid ${TEMA.negativo}` }}
        >
          <div className="text-[13px] font-medium">Não foi possível carregar o funil.</div>
          <div className="mt-1 text-[12.5px] opacity-90">{erro}</div>
          <button
            type="button"
            onClick={recarregar}
            className="mt-3 rounded-full px-4 py-1.5 text-[12px] font-semibold transition hover:brightness-125"
            style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
          >
            Tentar de novo
          </button>
        </div>
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
  /**
   * ONDE A SILHUETA ALARGA — calculado, nunca escrito à mão.
   *
   * ⚠️ O funil de captação NÃO afunila (Follow-up 248, Negociação 23, Fechamento 88), e
   * a forma centrada mostra isso de cara. Sem uma linha explicando, quem bate o olho lê
   * "gráfico quebrado" — e o que está ali é o achado da tela.
   *
   * ⚠️ CALCULADO e não texto fixo: no dia em que o funil passar a afunilar de verdade, a
   * frase some sozinha. Afirmação fixa sobre dado vivo é a que ninguém revisa.
   */
  const alargamentos = funil.niveis.flatMap((nv, i) =>
    i > 0 && nv.pessoas > funil.niveis[i - 1].pessoas
      ? [{ de: funil.niveis[i - 1], para: nv, vezes: nv.pessoas / Math.max(1, funil.niveis[i - 1].pessoas) }]
      : []
  );
  const ultimo = funil.niveis[funil.niveis.length - 1];
  const penultimo = funil.niveis[funil.niveis.length - 2];
  const estacionaNoFim = !!ultimo && !!penultimo && ultimo.pessoas > penultimo.pessoas;
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

      {/* ⚠️ A data acima é carimbo, não garantia — ver AvisoDadoVelho. */}
      <AvisoDadoVelho geradoEm={agregado.geradoEm} oQue="o funil comercial" />

      {/* ================= O FUNIL ================= */}
      <Bloco
        titulo="Onde as pessoas estão agora"
        icone="◧"
        sub={`${n(funil.pessoasNoFunil)} pessoas no funil de captação · ${n(funil.oportunidadesAbertas)} oportunidades abertas no total`}
      >
        {/* ⚠️ REGRA DA CASA: nunca um número solto chamado "leads". Cada linha diz
            se está contando PESSOA ou OPORTUNIDADE — é a diferença entre 476 e 1.660. */}
        <FunilCentrado
          refBloco={refFunil}
          entrou={entrouFunil}
          niveis={funil.niveis}
          nomeEtapa={nomeEtapa}
          aoAbrir={setEtapaAberta}
        />

        {/*
          ⚠️ ESTADO PERMANENTE, NÃO ALERTA — dourado, nunca vermelho. Não é falha que
          alguém vá consertar: é como este funil é, e vai estar aqui em toda visita.

          ⚠️ A EXPLICAÇÃO SÓ APARECE ONDE ELA FOI MEDIDA. O alargamento no fim tem causa
          conhecida (a agência definiu que estar em Fechamento É venda feita, então ali
          as pessoas ficam). Nos outros pontos a tela diz QUE alarga e não inventa por
          quê — explicação que não fecha encerra a investigação sem resolver nada.
        */}
        {alargamentos.length > 0 && (
          <p className="mt-3 border-t pt-3 text-[12px] leading-relaxed" style={{ borderColor: LINE, color: MUTED }}>
            <b style={{ color: GOLD }}>A silhueta alarga</b> em{" "}
            {alargamentos.length === 1 ? "um ponto" : `${n(alargamentos.length)} pontos`} — e isso é o
            dado, não defeito de desenho:{" "}
            {alargamentos.map((a, i) => (
              <span key={a.para.nivel}>
                {i > 0 && ", "}
                <b style={{ color: TEMA.texto }}>{a.para.nome}</b> tem{" "}
                <b className="tabular-nums" style={{ color: TEMA.texto }}>{a.vezes.toFixed(1).replace(".", ",")}x</b>{" "}
                as pessoas de {a.de.nome}
              </span>
            ))}
            .
            {estacionaNoFim && (
              <> No fim isso tem causa conhecida: <b style={{ color: TEMA.texto }}>{penultimo.nome} é
              passagem, {ultimo.nome} é estacionamento</b> — a agência definiu que estar em{" "}
              {ultimo.nome} é negociação concluída, então a pessoa fica parada ali depois da venda.
              O gargalo deste funil não é o afunilamento, é o acúmulo no fim.</>
            )}
          </p>
        )}

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
        {/* ⚠️ OS DOIS NÚMEROS NÃO TÊM A MESMA BASE, e compactar em card é
            justamente o que faz a base sumir: dois cards lado a lado parecem
            comparáveis mesmo contando coisas diferentes.
            Um conta OPORTUNIDADE marcada como ganha (`status = 1`); o outro conta
            PESSOA parada na etapa [20]. Não somam, não se comparam, e cada um
            carrega a própria base escrita dentro do card. */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))" }}>
          <KpiCard
            rotulo="Vendas confirmadas"
            valor={fechamento.confirmadas.vendas}
            formatar={(v) => `${n(Math.round(v))}`}
            secundario={reais(fechamento.confirmadas.mrrCent)}
            base={`Oportunidades marcadas como ganhas no CRM. ${n(fechamento.confirmadas.comValor)} com valor informado, ${n(fechamento.confirmadas.semValor)} sem.`}
          />
          <KpiCard
            rotulo="Em Fechamento"
            valor={emFechamento.pessoas}
            formatar={(v) => `${n(Math.round(v))}`}
            secundario={reais(emFechamento.mrrCent)}
            base={`Pessoas paradas na etapa, contadas como venda por decisão da agência — não têm clique de ganho nem data. ${n(emFechamento.comValor)} com valor informado.`}
          />
        </div>

        {/* A COMPOSIÇÃO CONTINUA VISÍVEL, e é obrigatória: nunca um número solto
            chamado "MRR". A soma só existe com as duas parcelas ditas. */}
        <div
          className="mt-4 rounded-lg px-4 py-3"
          style={{ background: TEMA.chip }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: MUTED }}>
            MRR do que está vendido
          </div>
          <div className="mt-1 text-[14px] tabular-nums" style={{ color: TEMA.texto }}>
            <b style={{ color: TEMA.destaque }}>{reais(fechamento.confirmadas.mrrCent)}</b> confirmado
            {" + "}
            <b style={{ color: TEMA.destaque }}>{reais(emFechamento.mrrCent)}</b> em fechamento
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

      {/* ============ DINHEIRO PARADO E VALOR FALTANDO, POR ETAPA ============ */}
      <Bloco
        titulo="Dinheiro parado por etapa"
        icone="◫"
        sub="Da Negociação para frente — onde está o MRR e onde falta informar o valor."
      >
        <DinheiroPorEtapa itens={agregado.porEtapaAvancada ?? []} />
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

          {/* ⚠️ O LINK É A CONDIÇÃO DA VARIANTE B. As etapas de recuperação saíram do
              funil porque inflavam a leitura — mas tirar do funil e não dar caminho
              seria apagar. Botão, não link de texto: precisa se anunciar. */}
          <Link
            href="/comercial/recuperacao"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-semibold transition hover:brightness-125"
            style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
          >
            Ver a recuperação em detalhe →
          </Link>

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
        icone="↗"
        sub="Pessoa cujo PRIMEIRO contato foi no mês — não oportunidade criada no mês."
      >
        <SerieMensal itens={cortar(agregado.leadsNovos)} />
      </Bloco>

      <Bloco
        titulo="Perdas por mês"
        icone="↘"
        sub="Uma vez sincronizada, a oportunidade perdida não some mais — fica registrada com a data e a etapa."
      >
        <SerieMensal itens={cortar(agregado.perdas)} />
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

      {/*
        A JANELA DA ETAPA — abre ao clicar na faixa do funil.

        ⚠️ O MESMO `Modal` da /carteira, e a MESMA lista de antes. Nada foi refeito: o
        que mudou é por onde se chega. Uma segunda janela com outro comportamento de
        foco, ESC e tela cheia no celular seria o nono mecanismo de revelação desta base.

        ⚠️ MONTA E DESMONTA com a abertura (`{etapaAberta && ...}` dentro de um Modal que
        devolve null quando fechado), então o "mostrar todas" volta ao padrão a cada
        abertura — estado de revelação não persiste, que é o estilo da casa.
      */}
      <Modal
        aberto={etapaAberta !== null}
        aoFechar={() => setEtapaAberta(null)}
        titulo={etapaAberta ? `${etapaAberta.nome} — quem está parado aqui` : ""}
        subtitulo={etapaAberta
          ? `Nível ${etapaAberta.nivel} · ${n(etapaAberta.pessoas)} pessoas · ${n(etapaAberta.oportunidades)} oportunidades`
          : undefined}
      >
        {etapaAberta && <ListaDaEtapa nivel={etapaAberta} />}
      </Modal>
    </div>
  );
}

/**
 * Série mensal em colunas, com valor no topo e linha de média.
 *
 * ⚠️ A COLUNA CONTA PESSOAS, e a contagem por OPORTUNIDADE não se perdeu: ela
 * está no tooltip de cada mês, no total abaixo do gráfico e no marcador ⚠ dos
 * meses em que a razão denuncia clonagem da automação. A regra da casa —
 * nunca um número solto chamado "leads" — continua valendo; o que mudou é que a
 * segunda contagem deixou de ocupar uma coluna própria.
 *
 * ⚠️ O QUE ISSO CUSTOU, validado na tela pelo Igor em 16/08/2026: com as duas
 * barras lado a lado, maio/2025 mostrava 11 contra 1.456 de relance. Em coluna,
 * o mês aparece marcado e o contraste só se lê no tooltip — e ele decidiu que
 * **o marcador âmbar com ⚠ basta**. A versão de barras duplas foi removida; o
 * histórico dela está no commit que trouxe as colunas, se um dia a comparação
 * visual voltar a pesar mais que a forma.
 */
/**
 * O FUNIL, EM BARRAS CENTRADAS — a forma que o dono pediu, sem a mentira que ela costuma
 * carregar. Aprovado em 18/08/2026.
 *
 * ⚠️ POR QUE NÃO O TRAPÉZIO. Nele o valor vira LARGURA e o olho lê ÁREA, e as duas não
 * batem: a área de uma faixa trapezoidal é (largura_de_cima + largura_de_baixo) ÷ 2, ou
 * seja **depende do nível seguinte**. Aqui cada faixa é um retângulo de altura FIXA
 * (ALTURA_FAIXA), então área e largura dizem exatamente a mesma coisa.
 *
 * ⚠️⚠️ E O MOTIVO QUE DECIDE: **ESTE FUNIL NÃO AFUNILA.** Medido em 17/08/2026 —
 * Follow-up 248, Negociação 23, Fechamento 88. Ele ALARGA em duas das quatro transições
 * (1→2 e 4→5), e a última é 3,8x. Uma forma que precisa estreitar não consegue desenhar
 * isso: ou estreita mentindo, ou incha e parece defeito.
 *
 * 🔑 **NEGOCIAÇÃO É PASSAGEM, FECHAMENTO É ESTACIONAMENTO.** É o achado, não o efeito
 * colateral do gráfico. A agência definiu que estar em Fechamento É venda feita, então
 * ali as pessoas se ACUMULAM — são as 88 com R$ 157.560 parados. O gargalo do comercial
 * não é o afunilamento, é o estacionamento no fim. A silhueta vai inchar ali todo dia, e
 * isso é informação: quem olhar e achar que o gráfico quebrou está lendo o dado certo.
 *
 * ⚠️ NENHUM PISO DE LARGURA. Barra mínima faria 1 pessoa parecer N, que é a mesma mentira
 * do trapézio em miniatura. A menor razão hoje é 23/248 = 9,3%, perfeitamente visível.
 */
function FunilCentrado({
  refBloco, entrou, niveis, nomeEtapa, aoAbrir,
}: {
  refBloco: React.RefObject<HTMLDivElement>;
  entrou: boolean;
  niveis: NivelDoFunil[];
  nomeEtapa: Map<number, string>;
  aoAbrir: (nv: NivelDoFunil) => void;
}) {
  const max = Math.max(1, ...niveis.map((x) => x.pessoas));

  return (
    <div ref={refBloco} className="space-y-1">
      {niveis.map((nv, i) => {
        const pct = Math.max(0, Math.min(100, (nv.pessoas / max) * 100));
        const atraso = atrasoDe(i, MOVIMENTO.escalonamentoMs, MOVIMENTO.escalonamentoTetoMs);
        const temLista = (nv.pessoasNaEtapa ?? []).length > 0;
        return (
          <div key={nv.nivel}>
            {/*
              ⚠️ A LINHA INTEIRA É O ALVO, e não a barra. O nível 4 tem 23 de 248 — uma
              lasca de 9% da largura. Alvo de clique de 9% é alvo que ninguém acerta, e
              seria justamente o nível onde está o dinheiro.

              ⚠️ FUNDO DO HOVER EM CLASSE (`hover:bg-brand-hover`), NUNCA em `style`
              inline: estilo inline vence stylesheet, e o hover simplesmente não pintaria
              — sem erro e sem aviso. Três hovers desta base já morreram assim.
            */}
            <button
              type="button"
              disabled={!temLista}
              onClick={() => temLista && aoAbrir(nv)}
              className="group flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-brand-hover disabled:cursor-default disabled:hover:bg-transparent"
              title={temLista ? `Ver as ${n(nv.pessoas)} pessoas do nível ${nv.nivel}` : undefined}
            >
              <span className="w-4 shrink-0 text-[11px] tabular-nums" style={{ color: MUTED }}>{nv.nivel}</span>
              <span className="w-40 shrink-0 truncate text-[13px] font-medium text-brand-ink">{nv.nome}</span>

              {/*
                A SILHUETA. Cresce do CENTRO para os dois lados — é o que dá a forma de
                funil sem trocar a codificação: a largura continua linear no valor.

                ⚠️ O HOVER NÃO MEXE NO TAMANHO. A largura É o dado; crescer no hover faria
                a barra mentir por um instante. O destaque vem de `brightness` (que no
                escuro é como se comunica profundidade — sombra não eleva onde não há luz
                para bloquear) e do fundo da linha. Nunca da escala.
              */}
              <span className="flex flex-1 justify-center" style={{ height: ALTURA_FAIXA }}>
                <span
                  className="block rounded-md group-hover:brightness-125"
                  style={{
                    width: entrou ? `${pct}%` : "0%",
                    height: "100%",
                    background: TEMA.gradDestaqueH,
                    transition: `width ${MOVIMENTO.barraMs}ms ${MOVIMENTO.ease}, filter 150ms ${MOVIMENTO.ease}`,
                    transitionDelay: `${atraso}ms`,
                  }}
                />
              </span>

              <span className="w-32 shrink-0 text-right">
                <b className="text-[15px] font-semibold tabular-nums text-brand-ink">{n(nv.pessoas)}</b>
                <span className="ml-1 text-[11.5px]" style={{ color: MUTED }}>pessoas</span>
              </span>
              <span className="w-28 shrink-0 text-right text-[11.5px] tabular-nums" style={{ color: MUTED }}>
                {n(nv.oportunidades)} oportunidades
              </span>
            </button>

            {/* ⚠️ O EMPATE DO NÍVEL 1, explicado na tela: tráfego e outbound são duas
                PORTAS do mesmo degrau, não degraus diferentes. Fica FORA do botão: é
                leitura, não alvo de clique. */}
            {nv.porEtapa ? (
              <div className="mb-1 ml-9 flex flex-wrap gap-x-5 gap-y-1">
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
        );
      })}
    </div>
  );
}

/** Quantas linhas a lista mostra antes do botão. 248 no maior nível — rolagem que
 *  ninguém lê. Carrega tudo (é o mesmo documento) e revela sob demanda. */
const LINHAS_VISIVEIS = 20;

/**
 * QUEM ESTÁ PARADO NA ETAPA — demanda 3 do dono (17/08/2026), agora dentro da JANELA que
 * abre ao clicar na faixa do funil (18/08/2026).
 *
 * ⚠️ CUSTO ZERO: a lista já veio no documento que a tela leu. Nenhuma leitura nova.
 *
 * ⚠️ ORDEM VEM DO AGREGADO, não daqui: sem valor primeiro, depois por MRR decrescente.
 * Reordenar na tela criaria uma segunda definição da mesma regra.
 *
 * ⚠️ O ACORDEÃO INLINE QUE ISTO ERA **SAIU**, não virou um segundo caminho. Clique na
 * faixa e botão "Ver as N pessoas" abrindo a mesma lista seriam dois mecanismos para a
 * mesma coisa — e este painel já tinha oito mecanismos de revelação inventados um a um.
 * A contagem, que era o que aquele gatilho anunciava, está na própria faixa do funil.
 */
function ListaDaEtapa({ nivel }: { nivel: NivelDoFunil }) {
  const [tudo, setTudo] = useState(false);
  const lista = nivel.pessoasNaEtapa ?? [];
  if (!lista.length) return null;

  const semValor = lista.filter((p) => p.mrrCent === null).length;
  const total = lista.reduce((t, p) => t + (p.mrrCent ?? 0), 0);
  const mostradas = tudo ? lista : lista.slice(0, LINHAS_VISIVEIS);

  /**
   * ⚠️ A MARCAÇÃO SÓ VALE ONDE A RÉGUA COBRA VALOR — e o limiar NÃO mora aqui: vem como
   * dado do agregado, calculado no mesmo lugar que ordenou a lista. Assim os dois não
   * podem divergir, e a tela não importa nada do módulo do servidor.
   *
   * Abaixo da Negociação, ausência de valor é o esperado: o Follow-up tem 248 pessoas e
   * ZERO com valor, e pintar tudo de âmbar mostraria 248 pendências que ninguém pode
   * resolver. Ali vai "—" neutro.
   */
  const cobraValor = !!nivel.cobraValor;

  return (
    // ⚠️ Sem o fundo `zebra` que existia quando isto era acordeão embutido: dentro da
    // janela o Modal já É a superfície, e um segundo tom empilhado só adicionaria um
    // degrau de elevação que não significa nada.
    <div>
          {/*
            ⚠️ A LIMITAÇÃO VEM ANTES DA LISTA, no corpo e não em tooltip. O relógio é o
            `stagebegintime` do CRM: ele diz desde quando a pessoa está na etapa ATUAL e
            ZERA se ela voltou atrás e avançou de novo, porque o CRM não guarda o caminho.
            É a mesma ressalva que a tela já faz sobre o histórico de etapas, na mesma
            formulação — quem lê as duas precisa reconhecer que é o mesmo limite.
          */}
          <p className="mb-2 text-[11px] leading-relaxed" style={{ color: MUTED }}>
            <b style={{ color: TEMA.texto }}>Parado nesta etapa desde</b> — não é há quanto tempo
            está no funil. O CRM não guarda por onde o lead passou, então quem voltou atrás e
            avançou de novo aparece com o relógio zerado.
          </p>

          <div className="space-y-1">
            {mostradas.map((p, i) => (
              <div key={`${p.nome}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate" style={{ color: TEMA.texto }} title={p.tituloCrm ?? p.nome}>
                  {p.tituloCrm ?? p.nome}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums" style={{ color: MUTED }}>
                  {p.diasParado === null ? "—" : `${n(p.diasParado)} dias`}
                </span>
                {/* ⚠️ NUNCA "R$ 0" — zero é um valor real e desconhecido não é, a mesma
                    regra do `mrrCent: null` no agregado. O que muda com o nível é só o
                    PESO: pendência (âmbar) onde a régua cobra, ausência neutra onde não. */}
                <span className="w-32 shrink-0 text-right tabular-nums"
                  style={{ color: p.mrrCent === null ? (cobraValor ? AMBER : MUTED) : TEMA.destaque }}>
                  {p.mrrCent === null ? (cobraValor ? "sem valor informado" : "—") : reais(p.mrrCent)}
                </span>
              </div>
            ))}
          </div>

          {lista.length > LINHAS_VISIVEIS && (
            <button
              type="button"
              onClick={() => setTudo((v) => !v)}
              className="mt-2 text-[11.5px] underline underline-offset-2"
              style={{ color: MUTED }}
            >
              {tudo ? `Mostrar só as primeiras ${LINHAS_VISIVEIS}` : `Mostrar todas as ${n(lista.length)}`}
            </button>
          )}

          {/* O total daqui TEM que fechar com o bloco "Dinheiro parado por etapa" —
              dois lugares mostrando o mesmo número que não batem é pior que um só. */}
          <p className="mt-2 border-t pt-2 text-[11px] leading-relaxed" style={{ borderColor: LINE, color: MUTED }}>
            <b style={{ color: TEMA.destaque }}>{reais(total)}</b> somando as{" "}
            <b style={{ color: TEMA.texto }}>{n(lista.length - semValor)}</b> com valor informado
            {semValor > 0 && (cobraValor ? (
              <> · <b style={{ color: AMBER }}>{n(semValor)}</b> ainda sem valor, e aparecem primeiro
              porque são o que falta preencher</>
            ) : (
              /* Sem cor e sem "falta": aqui não falta nada — a régua da agência só pede
                 valor a partir da Negociação, e dizer "falta" seria inventar pendência. */
              <> · as outras <b style={{ color: TEMA.texto }}>{n(semValor)}</b> ainda não têm valor,
              o que é o esperado antes da Negociação</>
            ))}
            .
          </p>
    </div>
  );
}

/**
 * As demandas 4 e 5 do dono, numa seção só — porque são a mesma forma: MRR parado e
 * valor faltando, etapa por etapa, da Negociação para frente.
 *
 * ⚠️⚠️ A PREMISSA DO DONO NÃO SE CONFIRMOU, e isso mudou o que a tela É. A régua dele era
 * "95% das vezes vai ter valor a partir dali", o que faria de valor faltando uma EXCEÇÃO
 * — coisa de alerta vermelho. Medido em 17/08/2026, POR PESSOA (a unidade da tela):
 * **79 de 111 = 71,2%** têm valor. São **32 sem valor**.
 *
 * 32 não é exceção, é FILA DE TRABALHO. Então isto aparece como pendência a preencher, em
 * `atencao`, e nunca como alarme: alarme que acende em 29% dos casos é o alarme diário que
 * ninguém lê. A régua MEDIDA vai escrita na tela, sempre com o denominador — percentual
 * sem denominador é a armadilha do "sobre o que ele é percentual".
 *
 * 🛑 E O MRR É PISO, NUNCA TOTAL. Ele soma só quem tem valor informado; as pessoas sem
 * valor têm MRR **desconhecido**, não zero. Escrever "R$ 226.530 parados" afirmaria que
 * 29% da fila vale zero — que é a família do "ausência de dado não é evidência de ausência
 * do fato". Por isso o número vem sempre com o denominador ao lado.
 */
function DinheiroPorEtapa({ itens }: { itens: NonNullable<AgregadoComercial["porEtapaAvancada"]> }) {
  if (!itens.length) {
    return <p className="text-[12.5px]" style={{ color: MUTED }}>Rode o sync do comercial para esta seção aparecer.</p>;
  }
  const pessoas = itens.reduce((t, e) => t + e.pessoas, 0);
  const comValor = itens.reduce((t, e) => t + e.comValor, 0);
  const semValor = itens.reduce((t, e) => t + e.semValor, 0);
  const mrr = itens.reduce((t, e) => t + e.mrrCent, 0);
  const pctCom = pessoas > 0 ? (comValor / pessoas) * 100 : 0;

  return (
    <div>
      <div className="space-y-2">
        {itens.map((e) => (
          <div key={e.etapaId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2.5"
            style={{ background: TEMA.zebra }}>
            <div className="text-[13px] font-medium text-brand-ink">
              {e.nome}
              <span className="ml-2 text-[11px] font-normal" style={{ color: MUTED }}>etapa {e.etapaId}</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
              <span style={{ color: MUTED }}>
                <b className="tabular-nums" style={{ color: TEMA.texto }}>{n(e.pessoas)}</b> pessoas
              </span>
              <span className="tabular-nums" style={{ color: TEMA.destaque }}>
                <b>{reais(e.mrrCent)}</b>
                <span className="ml-1 text-[11px] font-normal" style={{ color: MUTED }}>
                  de {n(e.comValor)}
                </span>
              </span>
              {e.semValor > 0 && (
                <span className="tabular-nums" style={{ color: AMBER }}>
                  <b>{n(e.semValor)}</b> sem valor
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ⚠️ O PISO DITO POR EXTENSO, no corpo e não em tooltip. */}
      <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
        Os <b style={{ color: TEMA.destaque }}>{reais(mrr)}</b> são um <b style={{ color: TEMA.texto }}>piso</b>,
        não o total: somam só as <b style={{ color: TEMA.texto }}>{n(comValor)}</b> pessoas com valor
        informado. As outras <b style={{ color: AMBER }}>{n(semValor)}</b> têm MRR{" "}
        <b style={{ color: TEMA.texto }}>desconhecido</b> — não zero. O dinheiro real parado aqui é
        maior, e não dá para dizer quanto.
      </p>
      {/**
        * A régua MEDIDA, com o denominador — nunca só o percentual.
        *
        * ⚠️ NÃO CITE A RÉGUA SUPOSTA AQUI. Uma versão anterior escrevia "não os 95% que a
        * régua supunha", e o Igor tirou com um motivo que vale registrar: a divergência
        * precisa chegar ao dono, mas **a tela é lida por outras pessoas**, e citar a régua
        * dele na interface vira correção pública. O número vai na conversa, que é onde ela
        * pertence; a divergência fica registrada em data/xmax-integracao.md.
        *
        * A régua da casa por trás disso: número na tela informa, não argumenta.
        */}
      {semValor > 0 && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
          Medido: <b style={{ color: TEMA.texto }}>{n(comValor)} de {n(pessoas)}</b> pessoas daqui
          para frente têm valor informado ({pctCom.toFixed(0)}%). Preencher as{" "}
          <b style={{ color: AMBER }}>{n(semValor)}</b> que faltam é o que faz este número virar
          total em vez de piso.
        </p>
      )}
    </div>
  );
}

function SerieMensal({ itens }: { itens: SerieMes[] }) {
  if (!itens.length) return <p className="text-[12.5px]" style={{ color: MUTED }}>Sem dados no período.</p>;
  const totalPessoas = itens.reduce((t, m) => t + m.pessoas, 0);
  const totalOps = itens.reduce((t, m) => t + m.oportunidades, 0);
  const clonados = itens.filter((m) => m.clonagem);
  const parciais = itens.filter((m) => m.parcial);

  return (
    <div>
      <ColunasComMedia
        colunas={itens.map((m) => ({
          rotulo: mesCurto(m.mes),
          valor: m.pessoas,
          alerta: m.clonagem,
          parcial: m.parcial,
          titulo: `${mesCurto(m.mes)} · ${n(m.pessoas)} pessoas · ${n(m.oportunidades)} oportunidades`
            // ⚠️ O PARCIAL VEM PRIMEIRO no tooltip, antes da clonagem: se o mês está
            // incompleto, isso muda como se lê TODOS os outros números da linha.
            + (m.parcial
              ? ` — MÊS PARCIAL: a base cobre ${m.diasCobertos} de ${m.diasNoMes} dias, então a coluna está abaixo do mês inteiro. Não é queda.`
              : "")
            + (m.clonagem
              ? ` — a automação criou ${(m.oportunidades / Math.max(1, m.pessoas)).toFixed(0)}× mais oportunidades que pessoas. O número de pessoas é o que vale.`
              : ""),
        }))}
        formatar={(v) => n(Math.round(v))}
      />
      <p className="mt-3 text-[11.5px]" style={{ color: MUTED }}>
        Colunas contam <b style={{ color: TEMA.texto }}>pessoas</b>: {n(totalPessoas)} no período,
        contra {n(totalOps)} oportunidades — a diferença é o retrabalho da automação.
        {clonados.length > 0 && (
          <> Os meses com <span style={{ color: AMBER }}>⚠</span> têm razão alta o bastante para
          denunciar clonagem; passe o mouse para ver as duas contagens.</>
        )}
      </p>
      {/* ⚠️ O AVISO DO PARCIAL É SEPARADO do da clonagem, mesmo motivo do estado ser
          separado: são fatos diferentes. E ele NOMEIA os meses, porque a hachura diz
          "este está incompleto" e não diz de quanto — 17 de 31 dias e 30 de 31 pedem
          leituras muito diferentes. */}
      {parciais.length > 0 && (
        <p className="mt-1.5 text-[11.5px]" style={{ color: MUTED }}>
          As colunas <b style={{ color: TEMA.texto }}>hachuradas</b> são meses que a base não cobre
          inteiros e por isso aparecem menores do que são:{" "}
          {parciais.map((m, i) => (
            <span key={m.mes}>
              {i > 0 && " · "}
              <b style={{ color: TEMA.texto }}>{mesCurto(m.mes)}</b> ({m.diasCobertos} de {m.diasNoMes} dias)
            </span>
          ))}
          . Não são queda.
        </p>
      )}
    </div>
  );
}
