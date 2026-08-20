"use client";

import { useEffect, useMemo, useState } from "react";
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
// ⚠️ Import de VALOR, e pode: @/lib/etapas não importa nada. Os ids e nomes NÃO
// podiam vir de @/lib/comercial, que puxa `node:crypto` e mataria o build.
import { nomeEtapa } from "@/lib/etapas";
import { TEMA, MOVIMENTO } from "@/lib/brand";
import { useEntrada, atrasoDe } from "@/lib/useEntrada";
import SecaoHeader from "./SecaoHeader";
import BarraDado from "./BarraDado";
import KpiCard from "./KpiCard";
import ColunasComMedia from "./ColunasComMedia";
import AvisoDadoVelho from "./AvisoDadoVelho";
import Modal from "./Modal";
import { usePeriodoGlobal, MES_NENHUM } from "./PeriodoGlobalProvider";

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
/** "2026-07" -> "julho/2026". Para rótulo que a pessoa lê por inteiro (o <select> da
 *  safra); o `mesCurto` continua servindo eixo de gráfico, onde espaço é escasso. */
const mesLongo = (m: string) => {
  const [a, mm] = m.split("-");
  const nomes = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[Number(mm)] ?? mm}/${a}`;
};
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
  /**
   * SAFRA SELECIONADA ("YYYY-MM"). `null` = todos os períodos, que é o padrão e é o
   * funil completo de hoje.
   *
   * ⚠️ A LEITURA É "QUEM ENTROU EM X, ONDE ESTÁ AGORA" — nunca "como o funil estava em
   * X". O painel não tem histórico de etapas: o CRM não guarda por onde o lead passou.
   * Todo rótulo desta tela precisa carregar a diferença, porque as duas frases se
   * parecem e só uma é verdade aqui.
   */
  const [safra, setSafra] = useState<string | null>(null);

  /**
   * A SEGUNDA PONTA DO MÊS COMPARTILHADO — esta tela lê e escreve.
   *
   * ⚠️ SEMEIA UMA VEZ, quando o agregado chega (`semeado`), e nunca mais. Depois disso o
   * <select> manda: mudar o mês na /gestores com esta tela aberta não pode mexer nela.
   *
   * ⚠️ LEITURA TOLERANTE: só aceita o mês se ALGUÉM daquela safra ainda estiver no funil.
   * Um mês cuja gente toda já fechou existe no calendário e não existe aqui — filtrar por
   * ele daria um funil vazio com cinco zeros, que qualquer pessoa lê como tela quebrada.
   *
   * ⚠️ E "nenhum mês em particular" NÃO é aparo: é a /comercial no padrão dela, que já é
   * "todos os períodos". Nada a avisar.
   */
  const { mes: mesCompartilhado, escolherMes } = usePeriodoGlobal();
  const [semeado, setSemeado] = useState(false);
  /** O que a chegada fez com o mês recebido — vira a linha de aviso no topo do funil. */
  const [daOutraTela, setDaOutraTela] = useState<{ mes: string; aparado: boolean } | null>(null);
  useEffect(() => {
    if (semeado || !agregado) return;
    setSemeado(true);
    if (!mesCompartilhado || mesCompartilhado === MES_NENHUM) return;
    const alvo = `${mesCompartilhado.ano}-${String(mesCompartilhado.mes).padStart(2, "0")}`;
    const temGente = agregado.funil.niveis.some((nv) =>
      (nv.pessoasNaEtapa ?? []).some((pe) => pe.mesEntrada === alvo)
    );
    if (temGente) setSafra(alvo);
    setDaOutraTela({ mes: alvo, aparado: !temGente });
  }, [agregado, semeado, mesCompartilhado]);
  // Cada bloco animado tem o próprio observador: a cascata do funil não deve
  // esperar o usuário chegar nas faixas de idade, lá embaixo.
  const { ref: refFunil, entrou: entrouFunil } = useEntrada<HTMLDivElement>();
  const { ref: refIdade, entrou: entrouIdade } = useEntrada<HTMLDivElement>();


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
          {/* negativo a 90% sobre erroFundo. audita-tema: medido 5,05 */}
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
   * AS SAFRAS OFERECIDAS — os meses que o funil realmente CONSEGUE mostrar.
   *
   * ⚠️ Sai do `mesEntrada` das listas, não do `leadsNovos`: oferecer um mês cuja gente
   * toda já saiu do funil daria uma tela vazia sem explicação. O `leadsNovos` entra do
   * outro lado — como DENOMINADOR, para a tela poder dizer "111 das N que entraram".
   *
   * ⚠️ ORDEM: mais recente primeiro. A cauda antiga tem safras de 1 a 10 pessoas e
   * ninguém abre a tela para procurar junho/2025.
   *
   * ⚠️ TODOS OS MESES ENTRAM, inclusive os de 1 pessoa. O rótulo carrega o tamanho, então
   * ninguém escolhe no escuro — e esconder um mês por ser pequeno seria a tela decidindo
   * o que se pode perguntar, com um limiar que eu teria inventado.
   */
  const safras = (() => {
    const conta = new Map<string, number>();
    let semMes = 0;
    for (const nv of funil.niveis) {
      for (const pe of nv.pessoasNaEtapa ?? []) {
        if (!pe.mesEntrada) { semMes++; continue; }
        conta.set(pe.mesEntrada, (conta.get(pe.mesEntrada) ?? 0) + 1);
      }
    }
    const itens = [...conta.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([mes, noFunil]) => {
        const serie = agregado.leadsNovos.find((x) => x.mes === mes) ?? null;
        /**
         * ⚠️ O DENOMINADOR SÓ VALE SE CONTIVER O NUMERADOR. Quem está no funil tem
         * oportunidade ABERTA no funil 4, e quem entrou no mês está no `leadsNovos` do
         * mesmo mês pela MESMA `primeiroContato` — então `entraram >= noFunil` é
         * identidade, não sorte. Se ela quebrar (alguém mexeu numa das duas réguas), a
         * tela mostra o número sozinho em vez de uma fração invertida: 111 de 40 seria
         * lido como erro de leitura, não como bug.
         */
        const entraram = serie && serie.pessoas >= noFunil ? serie.pessoas : null;
        return { mes, noFunil, entraram, parcial: !!serie?.parcial };
      });
    return { itens, semMes, anos: [...new Set(itens.map((x) => x.mes.slice(0, 4)))] };
  })();
  const safraAtual = safra ? safras.itens.find((x) => x.mes === safra) ?? null : null;

  /**
   * O FUNIL FILTRADO. A contagem de cada nível vira o TAMANHO DA PRÓPRIA LISTA que a
   * janela vai mostrar — é o que torna impossível o funil dizer 6 e a janela mostrar 47.
   *
   * ⚠️ `oportunidades` e `porEtapa` continuam aqui com o valor do funil INTEIRO, e por
   * isso NÃO são renderizados sob safra (ver `mostrarOportunidades`). O nível conta
   * oportunidade pelas ETAPAS dele, enquanto a pessoa conta no nível MAIS ALTO que
   * alcançou — uma versão por safra seria outra definição do mesmo rótulo, e o número
   * mudaria ao alternar o filtro por motivo nenhum. Zerar seria pior: zero é um valor.
   */
  const niveisVisiveis = safra
    ? funil.niveis.map((nv) => {
        const lista = (nv.pessoasNaEtapa ?? []).filter((pe) => pe.mesEntrada === safra);
        return { ...nv, pessoasNaEtapa: lista, pessoas: lista.length };
      })
    : funil.niveis;

  /**
   * ONDE A SILHUETA ALARGA — calculado, nunca escrito à mão.
   *
   * ⚠️ O funil de captação NÃO afunila (Follow-up 248, Negociação 23, Fechamento 88), e
   * a forma centrada mostra isso de cara. Sem uma linha explicando, quem bate o olho lê
   * "gráfico quebrado" — e o que está ali é o achado da tela.
   *
   * ⚠️ CALCULADO e não texto fixo: no dia em que o funil passar a afunilar de verdade, a
   * frase some sozinha. Afirmação fixa sobre dado vivo é a que ninguém revisa.
   *
   * ⚠️ SOBRE OS NÍVEIS VISÍVEIS, não sobre o funil inteiro: a frase descreve a forma que
   * está NA TELA. Sob uma safra de 3 pessoas a silhueta é outra, e uma nota herdada do
   * funil completo estaria descrevendo um gráfico que ninguém está vendo.
   */
  const alargamentos = niveisVisiveis.flatMap((nv, i) =>
    i > 0 && nv.pessoas > niveisVisiveis[i - 1].pessoas
      ? [{ de: niveisVisiveis[i - 1], para: nv, vezes: nv.pessoas / Math.max(1, niveisVisiveis[i - 1].pessoas) }]
      : []
  );
  const ultimo = niveisVisiveis[niveisVisiveis.length - 1];
  const penultimo = niveisVisiveis[niveisVisiveis.length - 2];
  const estacionaNoFim = !!ultimo && !!penultimo && ultimo.pessoas > penultimo.pessoas;
  const pessoasNaSafra = niveisVisiveis.reduce((t, nv) => t + nv.pessoas, 0);
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
        sub={safra
          ? `Só quem entrou no comercial em ${mesLongo(safra)} — onde essas pessoas estão HOJE`
          : `${n(funil.pessoasNoFunil)} pessoas no funil de captação · ${n(funil.oportunidadesAbertas)} oportunidades abertas no total`}
      >
        {/*
          O SELETOR DE SAFRA.

          ⚠️ "ENTROU NO COMERCIAL", nunca "entrou no funil de captação". O `mesEntrada`
          vem de `primeiroContato`, que cobre os funis 4 E 23 — quem chegou direto como
          desqualificado nunca esteve no funil de captação e mesmo assim tem mês de
          entrada. Duas frases parecidas, populações diferentes.

          ⚠️ AGRUPADO POR ANO, não por tamanho. Separar "safra significativa" de "cauda"
          exigiria um limiar que eu inventaria (o corte natural de hoje, 53 contra 10,
          muda com a base). O ano existe independentemente do dado e nunca precisa ser
          recalibrado — dá a separação visual sem inventar régua.
        */}
        {/*
          ⚠️ O FILTRO QUE VEIO DE OUTRA TELA SE ANUNCIA NA CHEGADA, não só no <select>.
          Um funil de 111 pessoas onde havia 492 é lido como "o funil encolheu" por quem
          não reparou no seletor — e a pessoa não fez nada nesta tela para explicar a
          diferença. O controle mostra o ESTADO; esta linha explica a ORIGEM dele.

          ⚠️ Âmbar, nunca vermelho: nada falhou. E some no primeiro clique do seletor,
          porque a partir daí a escolha é desta tela.
        */}
        {daOutraTela && (
          <div
            className="mb-4 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed"
            style={{ background: TEMA.limiteFundo, color: AMBER }}
          >
            {daOutraTela.aparado ? (
              <>
                ⚠ Você vinha de <b>{mesLongo(daOutraTela.mes)}</b> em outra tela, mas ninguém que
                entrou nesse mês ainda está no funil — mostrando <b>todos os períodos</b>.
              </>
            ) : (
              <>
                ⚠ O funil está filtrado por <b>{mesLongo(daOutraTela.mes)}</b> porque foi o mês que
                você escolheu em outra tela — não é o funil completo.
              </>
            )}
          </div>
        )}

        {safras.itens.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="text-[12px]" style={{ color: MUTED }} htmlFor="safra-funil">
              Filtrar por quem entrou em:
            </label>
            <select
              id="safra-funil"
              value={safra ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setSafra(v);
                // ⚠️ ESCREVER É SÓ POR CLIQUE. E "todos os períodos" TAMBÉM é escolha:
                // sem gravar MES_NENHUM, o slot ficaria com o último mês e voltar para
                // esta tela reaplicaria o filtro que a pessoa acabou de desligar.
                escolherMes(v ? { ano: Number(v.slice(0, 4)), mes: Number(v.slice(5, 7)) } : MES_NENHUM);
                // O aviso descreve a CHEGADA. Depois de um clique aqui ele passaria a
                // explicar um filtro que não é mais o que está na tela.
                setDaOutraTela(null);
              }}
              className="rounded-xl px-3 py-2 text-[13px] outline-none"
              style={{ background: TEMA.chip, color: TEMA.texto, border: `1px solid ${LINE}` }}
            >
              <option value="">Todos os períodos — o funil completo de hoje</option>
              {safras.anos.map((ano) => (
                <optgroup key={ano} label={ano}>
                  {safras.itens.filter((x) => x.mes.startsWith(ano)).map((x) => (
                    <option key={x.mes} value={x.mes}>
                      {mesLongo(x.mes)} — {n(x.noFunil)} no funil
                      {x.entraram !== null ? `, de ${n(x.entraram)} que entraram` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {safra && (
              <button
                type="button"
                onClick={() => {
                  setSafra(null);
                  escolherMes(MES_NENHUM);
                  setDaOutraTela(null);
                }}
                className="rounded-full px-3 py-1.5 text-[12px] font-medium transition hover:brightness-125"
                style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
              >
                Ver todos os períodos
              </button>
            )}
          </div>
        )}

        {/*
          ⚠️⚠️ O DENOMINADOR É OBRIGATÓRIO, NÃO ENFEITE. O funil só mostra quem tem
          oportunidade ABERTA — quem entrou em julho e já fechou, perdeu ou saiu não
          aparece. Sem esta linha, alguém lê a safra filtrada como a safra INTEIRA e
          conclui que julho foi fraco, quando está olhando o resto dela.

          ⚠️ E o título diz POSIÇÃO ATUAL, nunca "funil de julho". O painel não tem
          histórico de etapas (o CRM não guarda o caminho), então "como o funil estava em
          julho" é uma frase que esta tela não pode dizer.
        */}
        {safraAtual && (
          <div
            className="mb-4 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed"
            style={{ background: TEMA.chip, color: MUTED }}
          >
            <b style={{ color: TEMA.texto }}>
              Pessoas que entraram no comercial em {mesLongo(safraAtual.mes)} — posição ATUAL no funil.
            </b>
            <br />
            {safraAtual.entraram !== null ? (
              <>
                <b className="tabular-nums" style={{ color: GOLD }}>{n(pessoasNaSafra)}</b> das{" "}
                <b className="tabular-nums" style={{ color: TEMA.texto }}>{n(safraAtual.entraram)}</b> que
                entraram ainda estão no funil · as outras{" "}
                <b className="tabular-nums" style={{ color: TEMA.texto }}>{n(safraAtual.entraram - pessoasNaSafra)}</b>{" "}
                fecharam, perderam ou saíram.
              </>
            ) : (
              <>
                <b className="tabular-nums" style={{ color: GOLD }}>{n(pessoasNaSafra)}</b> desta safra ainda
                estão no funil. O total que entrou no mês não está disponível nesta leitura, então a
                tela não mostra a fração.
              </>
            )}
            {safraAtual.parcial && (
              <> <span style={{ color: AMBER }}>⚠</span> {mesLongo(safraAtual.mes)} ainda está em curso na
              base — a safra continua crescendo.</>
            )}
          </div>
        )}

        {/* ⚠️ REGRA DA CASA: nunca um número solto chamado "leads". Cada linha diz
            se está contando PESSOA ou OPORTUNIDADE — é a diferença entre 476 e 1.660. */}
        <FunilCentrado
          refBloco={refFunil}
          entrou={entrouFunil}
          niveis={niveisVisiveis}
          aoAbrir={setEtapaAberta}
          mostrarOportunidades={!safra}
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
                  <span className="w-8 text-right text-[12.5px] font-medium tabular-nums font-mono text-brand-ink">{n(f.pessoas)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Bloco>

      {/* ==================== QUALIFICAÇÃO POR PORTE ==================== */}
      <SecaoPorte porte={agregado.porte} niveis={agregado.funil.niveis} />

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
                  {nomeEtapa(e.etapaId)}
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
        {/* O painel mostra ONDE o lead morreu, nunca POR QUÊ. Dito na tela em vez de
            coluna omitida em silêncio.

            ⚠️ A SEGUNDA FRASE NÃO É ENFEITE — sem ela o aviso é lido como "o CRM não
            registra motivo", e a conclusão prática vira "é inútil preencher". Medido em
            20/08/2026: o funil 4 TEM 6 motivos cadastrados (`lossreasons`) e a escrita
            aceita `closereason`; são 12 oportunidades perdidas lidas, união de 53 campos,
            e nenhum traz o motivo de volta. O dado pode existir lá dentro — é a nossa via
            de acesso que não alcança. Falta da FONTE e falta da NOSSA LEITURA levam a
            ações opostas: a primeira manda desistir, a segunda manda perguntar.

            ⚠️ E SE A LEITURA ABRIR UM DIA, NÃO SAI GRÁFICO DE GRAÇA: `closereason` é
            `type: string` na spec — TEXTO LIVRE, não FK para os 6 motivos cadastrados.
            Agrupar por motivo exigiria normalizar ("Sumiu" / "sumiu" / "sumiu sem dar
            retorno" são a mesma coisa para uma pessoa e três para um `groupBy`). Isso se
            descobre ANTES de prometer a tela, não depois de o suporte liberar o campo. */}
        <div className="mt-3">
          <Aviso>
            O CRM <b>não devolve o motivo da perda</b>, então o painel mostra quando e em que etapa
            o lead morreu — nunca por quê. O funil <b>tem 6 motivos cadastrados</b> e o CRM aceita
            registrá-los; a API é que não os devolve. Se estão sendo preenchidos, daqui não dá para saber.
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
        // ⚠️ Sob safra o subtítulo NÃO cita oportunidades, pelo mesmo motivo da faixa: o
        // número do nível conta o funil INTEIRO e viraria uma afirmação errada ao lado de
        // uma lista filtrada. E ele DIZ de que safra é a lista — janela sem o recorte no
        // título é janela que alguém lê como se fosse o total.
        subtitulo={etapaAberta
          ? (safra
            ? `Nível ${etapaAberta.nivel} · ${n(etapaAberta.pessoas)} pessoas que entraram no comercial em ${mesLongo(safra)}`
            : `Nível ${etapaAberta.nivel} · ${n(etapaAberta.pessoas)} pessoas · ${n(etapaAberta.oportunidades)} oportunidades`)
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
  refBloco, entrou, niveis, aoAbrir, mostrarOportunidades = true,
}: {
  refBloco: React.RefObject<HTMLDivElement>;
  entrou: boolean;
  niveis: NivelDoFunil[];
  aoAbrir: (nv: NivelDoFunil) => void;
  /**
   * ⚠️ FALSO SOB SAFRA, e não é economia de espaço: o nível conta OPORTUNIDADE pelas
   * etapas dele, enquanto a PESSOA conta no nível mais alto que alcançou. Filtrar por
   * safra recontaria as oportunidades com outra definição do mesmo rótulo, e o número
   * mudaria ao ligar o filtro por motivo nenhum. Sumir é honesto; mudar de régua em
   * silêncio não é. O mesmo vale para o detalhe `porEtapa`.
   */
  mostrarOportunidades?: boolean;
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
              <span className="w-4 shrink-0 text-[11px] tabular-nums font-mono" style={{ color: MUTED }}>{nv.nivel}</span>
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
                <b className="text-[15px] font-semibold tabular-nums font-mono text-brand-ink">{n(nv.pessoas)}</b>
                <span className="ml-1 text-[11.5px]" style={{ color: MUTED }}>pessoas</span>
              </span>
              {mostrarOportunidades && (
                <span className="w-28 shrink-0 text-right text-[11.5px] tabular-nums font-mono" style={{ color: MUTED }}>
                  {n(nv.oportunidades)} oportunidades
                </span>
              )}
            </button>

            {/* ⚠️ O EMPATE DO NÍVEL 1, explicado na tela: tráfego e outbound são duas
                PORTAS do mesmo degrau, não degraus diferentes. Fica FORA do botão: é
                leitura, não alvo de clique. */}
            {mostrarOportunidades && nv.porEtapa ? (
              <div className="mb-1 ml-9 flex flex-wrap gap-x-5 gap-y-1">
                {nv.porEtapa.map((e) => (
                  <span key={e.etapaId} className="text-[11.5px]" style={{ color: MUTED }}>
                    <b className="tabular-nums" style={{ color: TEMA.texto }}>{n(e.oportunidades)}</b>{" "}
                    {nomeEtapa(e.etapaId)}
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
                <span className="w-20 shrink-0 text-right tabular-nums font-mono" style={{ color: MUTED }}>
                  {p.diasParado === null ? "—" : `${n(p.diasParado)} dias`}
                </span>
                {/* ⚠️ NUNCA "R$ 0" — zero é um valor real e desconhecido não é, a mesma
                    regra do `mrrCent: null` no agregado. O que muda com o nível é só o
                    PESO: pendência (âmbar) onde a régua cobra, ausência neutra onde não. */}
                <span className="w-32 shrink-0 text-right tabular-nums font-mono"
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

/* =========================================================================
   QUALIFICAÇÃO POR PORTE — Demanda 2, 20/08/2026
   =========================================================================

   ⚠️⚠️ A HIERARQUIA DESTA TELA É PROVISÓRIA POR DESENHO, e quem mexer aqui daqui
   a seis meses precisa saber disso antes de "arrumar".

   O pedido original era DISTRIBUIÇÃO das cinco faixas entre quem está em
   Negociação. Medido em 20/08/2026, Negociação tem 79 pessoas e **19 com faixa** —
   dividir 19 em cinco dá ~4 por faixa, que é o critério da casa para DESCARTAR uma
   faixa, não para desenhar em cima dela.

   🔑 E a armadilha que quase passou: o patamar 77,3 / 78,9 / 80,0 é estável entre
   os três cortes de era, e estabilidade PARECE solidez. Não é. **A estabilidade
   valida a RÉGUA (o recorte é consistente); o `n` valida a CONCLUSÃO (dá para
   dividir).** São dois testes, e passar num não dispensa o outro — os três números
   estáveis são 22, 19 e 10 pessoas.

   Por isso a manchete é COBERTURA (uma fila de trabalho) e não distribuição.

   🔧 A FILA SE ESVAZIA, e é isso que torna a hierarquia provisória: conforme a
   agência etiqueta, "faltam N" cai. No dia em que houver volume em Negociação, a
   DISTRIBUIÇÃO vira manchete sozinha e a fila desce. Não é dívida técnica — é a
   tela seguindo o dado.
   ========================================================================= */
/**
 * O título do CRM repete o nome?
 *
 * ⚠️ REGRA ESTRUTURAL, NÃO LISTA. Compara as duas strings normalizadas — minúsculas, sem
 * acento, espaços colapsados. Não conhece nenhum nome específico e não precisa conhecer:
 * "Marivaldo Provedor" == "marivaldo provedor" some, e "MAERCIO | MIO TELECOM" contra
 * "Maercio Jose Diniz | Mio Telecom" fica, porque são mesmo campos diferentes.
 *
 * ⚠️ NÃO tenta ser esperto além disso. Um título que CONTÉM o nome mais outra coisa
 * ("ALINNE | TEK TELECOM") acrescenta a empresa e precisa aparecer — recortar a parte
 * repetida exigiria partir a string, que é exatamente o que o CRM não permite afirmar.
 */
function ehRedundante(nome: string, titulo: string | null): boolean {
  if (!titulo) return true;
  const normal = (x: string) =>
    x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return normal(nome) === normal(titulo);
}

/**
 * O id da `[38] Sem Perfil` quando ela aparece como LINHA DA TELA na distribuição.
 *
 * ⚠️ Não vem de `FAIXAS_PORTE` de propósito: lá ela não entra, porque marca
 * DESQUALIFICAÇÃO e não tamanho. Aqui é só a chave de uma linha clicável.
 */
const TAG_SEM_PERFIL_TELA = 38;

function SecaoPorte({
  porte, niveis,
}: {
  porte?: AgregadoComercial["porte"];
  niveis: AgregadoComercial["funil"]["niveis"];
}) {
  const { ref, entrou } = useEntrada<HTMLDivElement>();

  /**
   * ⚠️⚠️ AUSÊNCIA DO CAMPO É "AINDA NÃO SINCRONIZADO", NUNCA ZERO.
   * O bloco `porte` só passa a existir depois de um sync com `aplicar=1`. Renderizar
   * "0 de 79 (0,0%)" enquanto ele não chega seria a tela AFIRMANDO uma cobertura que
   * ninguém mediu — número falso é pior que tela fora do ar.
   */
  if (!porte) {
    return (
      <Bloco
        titulo="Qualificação por porte"
        icone="◇"
        sub="Quantas pessoas em negociação têm o tamanho do cliente informado no CRM."
      >
        <Aviso>
          Esta seção <b>ainda não foi sincronizada</b>. O porte passa a ser gravado no
          próximo sync do comercial — até lá não há número, e mostrar zero seria afirmar
          uma cobertura que ninguém mediu.
        </Aviso>
      </Bloco>
    );
  }

  const doNivel = porte.porNivel.find((x) => x.nivel === porte.nivelConfiavel);
  const nivelObj = niveis.find((x) => x.nivel === porte.nivelConfiavel);
  const faltam = doNivel ? doNivel.pessoas - doNivel.comFaixa : 0;

  /**
   * A PENDÊNCIA — quem está sem faixa a partir do nível 2.
   *
   * ⚠️⚠️ NÃO É SUGESTÃO, É PENDÊNCIA. O Thiago confirmou em 20/08/2026 que a marcação
   * de porte é OBRIGATÓRIA no processo: o cliente declara a faixa no formulário e o
   * vendedor aplica a etiqueta depois de conversar — porque na conversa o valor real
   * costuma ser outro (declara 3k, apura-se 5k ou 10k). Quem está sem faixa está fora
   * do processo, não "ainda não classificado".
   *
   * 🛑 E O NÍVEL 1 FICA DE FORA, com motivo: a etiqueta depende de a CONVERSA ter
   * acontecido, e no Novo Lead ninguém conversou ainda. Os ~1% de cobertura ali são o
   * ESPERADO, não falha. Cobrar etiqueta de quem ninguém falou seria o alarme que
   * dispara todo dia — e ruído em pendência faz o resto ser ignorado.
   *
   * ⚠️ `faixaPorte === null` é SEM INFORMAÇÃO, nunca "pequeno".
   */
  const PRIMEIRO_NIVEL_COBRAVEL = 2;
  const pendencia = niveis
    .filter((nv) => nv.nivel >= PRIMEIRO_NIVEL_COBRAVEL)
    // Mais avançado primeiro: quem está perto de fechar sem classificação é o que
    // custa mais caro deixar passar.
    .sort((a, b) => b.nivel - a.nivel)
    .flatMap((nv) => nv.pessoasNaEtapa
      .filter((x) => x.faixaPorte === null)
      .map((x) => ({ ...x, nivelNome: nv.nome, nivel: nv.nivel }))
      /**
       * DENTRO DO MESMO NÍVEL: mais parado primeiro.
       *
       * ⚠️ SEM ISTO A ORDEM INTERNA ERA HERDADA E ERRADA. `pessoasNaEtapa` já vem
       * ordenada pelo servidor — mas por *sem valor primeiro, depois MRR decrescente*,
       * que é a régua da pendência de VALOR. Para a pendência de CLASSIFICAÇÃO ela não
       * significa nada: uma lista sem ordem interna vira ruído na segunda tela de
       * rolagem, porque quem rola não sabe mais por que uma linha veio antes da outra.
       *
       * ⚠️ E ISTO NÃO É A TELA RECALCULAR DECISÃO DO SERVIDOR. A ordem do servidor
       * continua valendo para a lista dela; esta é OUTRA lista, com outra pergunta, e a
       * regra dela mora num lugar só — aqui. O campo `diasParado` já vem publicado.
       *
       * ⚠️ `null` VAI PARA O FIM, nunca tratado como 0. `null` é "o CRM não devolveu
       * `stagebegintime`", e chutar zero jogaria para o topo quem talvez não esteja
       * parado — ou para o fim quem está há um ano. Sem dado, sem prioridade.
       */
      .sort((a, b) => {
        if ((a.diasParado === null) !== (b.diasParado === null)) return a.diasParado === null ? 1 : -1;
        return (b.diasParado ?? 0) - (a.diasParado ?? 0);
      }));

  /**
   * 🛑 SÓ A ERA EM QUE A MARCAÇÃO É EXIGIDA — sem isto a pendência abria com a era morta.
   *
   * Medido em 20/08/2026: as 20 primeiras linhas eram todas Fechamento, com 561d, 370d,
   * 153d parados. E 126 das 130 pessoas do Fechamento entraram ANTES de junho/2026,
   * quando ninguém etiquetava. **Ninguém vai etiquetar retroativamente um lead parado há
   * 561 dias** — aquilo não era lista de trabalho, era arqueologia no topo de um alerta.
   *
   * ⚠️ O EXCLUÍDO É CONTADO, NUNCA SUMIDO. A linha abaixo da lista diz quantas ficaram
   * de fora e por quê. Filtro silencioso num alerta é a mesma coisa que dobra escondendo
   * alerta: some da tela, continua no código, e passa em todo teste.
   *
   * ⚠️ GRANULARIDADE: `mesEntrada` é "YYYY-MM" e o corte é um DIA. Comparar mês com mês
   * inclui junho inteiro — que é o que se quer, já que o corte É o começo de junho. Se o
   * corte um dia cair no meio de um mês, esta comparação passa a arredondar para trás e
   * precisa mudar junto.
   */
  /**
   * A FAIXA ABERTA — `38` é a `[38] Sem Perfil`, que entra como sexta linha clicável.
   *
   * ⚠️ ELA NÃO VIRA UMA SEXTA FAIXA no modelo: continua contada à parte e fora de
   * `FAIXAS_PORTE`. Aqui ela é só mais uma linha da TELA, e o id serve de chave.
   */
  const [faixaAberta, setFaixaAberta] = useState<number | null>(null);

  /**
   * QUEM DÁ PARA LISTAR — e por que não são todos.
   *
   * ⚠️⚠️ A BARRA CONTA A CARTEIRA; O CLIQUE LISTA O FUNIL. Das pessoas com faixa, só as
   * que têm oportunidade ABERTA aparecem em `pessoasNaEtapa` — e são só elas que têm
   * "etapa atual" e "há quanto tempo". Para quem não tem oportunidade viva esses dois
   * campos NÃO EXISTEM: listá-la produziria uma linha com as colunas vazias, e linha
   * vazia parece dado FALTANDO quando é dado INEXISTENTE.
   *
   * 🔑 Por isso o modal abre com "N de M" — o denominador é o da barra, e a diferença
   * é explicada. Sem isso, a lista contradiz o gráfico logo acima dela.
   */
  const doFunil = niveis.flatMap((nv) =>
    nv.pessoasNaEtapa.map((x) => ({ ...x, nivelNome: nv.nome })));
  const listaDaFaixa = faixaAberta === null ? [] : doFunil
    .filter((x) => (faixaAberta === TAG_SEM_PERFIL_TELA ? x.semPerfil : x.faixaPorte === faixaAberta))
    // Mesma ordem da pendência, pelo mesmo motivo: mais parado primeiro, sem data no fim.
    .sort((a, b) => {
      if ((a.diasParado === null) !== (b.diasParado === null)) return a.diasParado === null ? 1 : -1;
      return (b.diasParado ?? 0) - (a.diasParado ?? 0);
    });

  /** O total da CARTEIRA para a faixa aberta — o denominador do modal. */
  const totalDaFaixa = faixaAberta === null ? 0
    : faixaAberta === TAG_SEM_PERFIL_TELA ? porte.desqualificacao.pessoas
      : porte.carteira.faixas.find((f) => f.id === faixaAberta)?.pessoas ?? 0;
  const nomeDaFaixa = faixaAberta === null ? ""
    : faixaAberta === TAG_SEM_PERFIL_TELA ? "Sem Perfil"
      : porte.carteira.faixas.find((f) => f.id === faixaAberta)?.nome ?? "";

  const mesDoCorte = porte.corte.slice(0, 7);
  const daEraNova = (x: { mesEntrada: string | null }) =>
    x.mesEntrada !== null && x.mesEntrada >= mesDoCorte;
  const pendenciaAtual = pendencia.filter(daEraNova);
  const forasDoCorte = pendencia.length - pendenciaAtual.length;

  const maxFaixa = Math.max(1, ...porte.carteira.faixas.map((f) => f.pessoas));

  /**
   * A CAUSA DA CURVA — 🔑 CALCULADA, NUNCA ESCRITA.
   *
   * O Thiago explicou em 20/08/2026 por que a cobertura sobe de ~1% no Novo Lead para
   * ~24% na Negociação: a etiqueta depende de a CONVERSA ter acontecido, e o vendedor
   * só aplica depois de apurar o valor real (o cliente declara 3k, apura-se 5k).
   *
   * ⚠️ MAS A FRASE É DERIVADA DO DADO, e é isso que a torna segura: ela só aparece
   * enquanto o nível 1 estiver ABAIXO do nível 2. Se um dia o Novo Lead subir — porque
   * o processo mudou, ou porque a etiqueta passou a vir do formulário — a explicação
   * some sozinha, em vez de continuar na tela afirmando o contrário do gráfico ao lado.
   * Mesma mecânica da frase do alargamento do funil.
   *
   * ⚠️ Sem denominador não há taxa: nível vazio devolve `null` e não entra na conta —
   * `0 de 0` não é "cobertura zero".
   */
  const taxa = (nv?: { pessoas: number; comFaixa: number }) =>
    nv && nv.pessoas > 0 ? nv.comFaixa / nv.pessoas : null;
  const t1 = taxa(porte.porNivel.find((x) => x.nivel === 1));
  const t2 = taxa(porte.porNivel.find((x) => x.nivel === PRIMEIRO_NIVEL_COBRAVEL));
  const curvaTemCausa = t1 !== null && t2 !== null && t1 < t2;
  const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;

  return (
    <Bloco
      titulo="Qualificação por porte"
      icone="◇"
      sub="Quantas pessoas em negociação têm o tamanho do cliente informado no CRM."
    >
      <div ref={ref} className="space-y-5">
        {/* ---------- MANCHETE: cobertura, com o denominador à vista ---------- */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] leading-none font-semibold tabular-nums font-mono" style={{ color: TEMA.texto }}>
              {n(doNivel?.comFaixa ?? 0)}
            </span>
            {/* ⚠️ O DENOMINADOR NÃO É LEGENDA, é parte do número. "19" sozinho não
                significa nada; "19 de 79 em Negociação" significa. */}
            <span className="text-[14px]" style={{ color: MUTED }}>
              de {n(doNivel?.pessoas ?? 0)} pessoas em {doNivel?.nome ?? "Negociação"} têm porte informado
            </span>
          </div>
          {faltam > 0 && (
            <div className="mt-1 text-[13px]" style={{ color: TEMA.texto }}>
              <b>{n(faltam)}</b> {faltam === 1 ? "pessoa está" : "pessoas estão"} em negociação sem classificação.
            </div>
          )}
        </div>

        {/* ---------- A FILA: quem falta etiquetar ---------- */}
        {pendenciaAtual.length > 0 && (
          <div>
            {/* ⚠️ O RÓTULO DIZ O QUE É. "Quem falta etiquetar" soava observação; a
                marcação é obrigatória, então isto é pendência de processo. */}
            <div className="mb-1 text-[12px] uppercase" style={{ color: MUTED, letterSpacing: ".05em" }}>
              Pendente de classificação — {n(pendenciaAtual.length)} {pendenciaAtual.length === 1 ? "pessoa" : "pessoas"}
            </div>
            {/* ⚠️ O MOTIVO DO RECORTE VAI JUNTO DO RECORTE. Sem esta linha, alguém
                soma a pendência com o nível 1 e conclui que falta gente na lista. */}
            <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
              A partir de {porte.porNivel.find((x) => x.nivel === PRIMEIRO_NIVEL_COBRAVEL)?.nome ?? "Follow-up"}.
              {" "}O Novo Lead não entra: a etiqueta depende de a conversa ter acontecido.
            </div>
            <div className="space-y-1">
              {pendenciaAtual.map((pes, i) => (
                /* ⚠️ `key` é o índice porque nome se repete e o agregado não publica id
                   de pessoa nesta lista — é a mesma escolha do QuemEstaParado. */
                <div key={`${pes.nome}-${i}`} className="flex items-baseline gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate" style={{ color: TEMA.texto }}>{pes.nome}</span>
                  {/* ⚠️ "título no CRM", NUNCA "empresa" — o Xmax mistura nome e empresa
                      no mesmo campo e partir a string afirmaria o que não se sabe.
                      🛑 E SÓ APARECE QUANDO ACRESCENTA: medido em 20/08/2026, o título
                      repetia o nome em boa parte das linhas ("Marivaldo Provedor" nas duas
                      colunas), gastando metade da largura para não informar nada. Quando
                      DIFEREM eles são campos distintos e valem os dois. */}
                  <span className="min-w-0 flex-1 truncate" style={{ color: MUTED }}>
                    {ehRedundante(pes.nome, pes.tituloCrm) ? "" : pes.tituloCrm ?? ""}
                  </span>
                  {/* ⚠️ A ETAPA na linha porque a lista atravessa níveis: sem ela, duas
                      pessoas em situações diferentes viram a mesma linha. */}
                  <span className="w-36 truncate text-right" style={{ color: MUTED }}>{pes.nivelNome}</span>
                  {/* ⚠️ "nesta etapa", não "no funil": o `stagebegintime` zera quando a
                      pessoa volta atrás e avança de novo. O CRM não guarda o caminho. */}
                  <span className="w-40 text-right tabular-nums font-mono" style={{ color: MUTED }}>
                    {pes.diasParado === null ? "sem data no CRM" : `nesta etapa há ${n(pes.diasParado)}d`}
                  </span>
                </div>
              ))}
            </div>
            {/* ⚠️ O QUE FICOU DE FORA, CONTADO. Ver o aviso no cálculo de `pendenciaAtual`. */}
            {forasDoCorte > 0 && (
              <div className="mt-2 text-[12px]" style={{ color: MUTED }}>
                Mais <b style={{ color: TEMA.texto }}>{n(forasDoCorte)}</b> de antes do corte, não listadas:
                {" "}a marcação passou a ser exigida em {porte.corte.slice(5, 7)}/{porte.corte.slice(0, 4)},
                {" "}e quem entrou antes disso não seria etiquetado retroativamente.
              </div>
            )}
          </div>
        )}

        {/* ---------- CONTEXTO: a cobertura por nível ---------- */}
        {/* ⚠️ NÃO É ENFEITE. É esta linha que EXPLICA por que o denominador é
            Negociação — sem ela, "19 de 79" parece um recorte escolhido a esmo. */}
        <div>
          <div className="mb-2 text-[12px] uppercase" style={{ color: MUTED, letterSpacing: ".05em" }}>
            Cobertura por nível — por que o número acima é o de Negociação
          </div>
          <div className="space-y-1.5">
            {porte.porNivel.map((nv, i) => (
              <div key={nv.nivel} className="flex items-center gap-3">
                <span className="w-40 truncate text-[12px]" style={{ color: MUTED }}>{nv.nome}</span>
                <BarraDado
                  pct={nv.pessoas ? (nv.comFaixa / nv.pessoas) * 100 : 0}
                  /* ⚠️ `dadoNeutro`, não `barraNeutra`: o token do trilho diz "nunca a
                     barra em si". E neutro porque cobrir mais não é "bom" — é só mais. */
                  cor={TEMA.dadoNeutro}
                  /* ⚠️ SEM TRILHO por MEDIÇÃO, não por estilo: `dadoNeutro` dá 2,27:1
                     contra `barraNeutra` e 3,31:1 contra o card. Ver a prop. */
                  semTrilho
                  entrou={entrou}
                  indice={i}
                  titulo={`${n(nv.comFaixa)} de ${n(nv.pessoas)} com porte informado`}
                />
                <span className="w-24 text-right text-[12.5px] tabular-nums font-mono" style={{ color: TEMA.texto }}>
                  {n(nv.comFaixa)} de {n(nv.pessoas)}
                </span>
              </div>
            ))}
          </div>
          {/* A CAUSA CONHECIDA da subida — só enquanto o dado a sustentar. */}
          {curvaTemCausa && (
            <div className="mt-2 text-[12px]" style={{ color: MUTED }}>
              A cobertura sobe ao longo do funil ({pct(t1!)} no Novo Lead contra {pct(t2!)} no
              {" "}{porte.porNivel.find((x) => x.nivel === PRIMEIRO_NIVEL_COBRAVEL)?.nome ?? "Follow-up"})
              {" "}porque <b>a etiqueta depende da conversa</b>: o cliente declara a faixa no
              {" "}formulário e o vendedor aplica depois de apurar o valor real.
            </div>
          )}
          {/* ⚠️ O NÍVEL 5 SEM CAUSA INVENTADA. Dizer O QUE acontece sem afirmar o PORQUÊ
              é melhor que uma causa plausível: causa plausível ENCERRA a investigação.
              ⚠️ E repare no contraste com a frase acima: aquela tem causa MEDIDA e dita
              pelo dono do processo; esta não tem, e por isso fica sem. */}
          <div className="mt-2 text-[12px]" style={{ color: MUTED }}>
            O Fechamento aparece com cobertura quase zero e isso <b>não está explicado</b>:
            quase todo mundo que está lá entrou antes de {porte.corte.split("-").reverse().join("/")},
            e os poucos que entraram depois são gente demais de menos para concluir. Fica como
            pergunta em aberto — a medição do ciclo derrubou a explicação de calendário.
          </div>
        </div>

        {/* ---------- A RAMPA E O CORTE, declarados ---------- */}
        <Aviso>
          <b>A cobertura ainda está subindo</b>, então nenhum número fora de
          {" "}{doNivel?.nome ?? "Negociação"} é patamar: quem entrou a partir de junho/2026
          está em 31%, julho em 38% e agosto em 71%.
          {" "}<b>E a data de corte é uma escolha, não um fato</b> — o CRM não registra
          quando uma etiqueta foi aplicada, então {porte.corte.split("-").reverse().join("/")}
          {" "}é onde a série vira, não onde o processo mudou.
        </Aviso>

        {/* ---------- CONTEXTO: distribuição na carteira inteira ---------- */}
        <div>
          <div className="mb-1 text-[12px] uppercase" style={{ color: MUTED, letterSpacing: ".05em" }}>
            Distribuição na carteira inteira
          </div>
          {/* ⚠️⚠️ ESTE RÓTULO É CONDIÇÃO DE A SEÇÃO EXISTIR. Sem ele, os números abaixo
              seriam lidos como "a distribuição de Negociação" — que é justamente o que
              eles NÃO são. Se um dia não couber aqui, a seção sai; o rótulo não. */}
          <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
            Média de duas eras, não o número de {doNivel?.nome ?? "Negociação"} —
            {" "}{n(porte.carteira.comAlgumaFaixa)} de {n(porte.carteira.pessoas)} pessoas com porte informado.
          </div>
          <div className="space-y-1.5">
            {/* ⚠️ ORDEM, NÃO COR. As faixas são ORDINAIS (menos de 1k < ... < mais de
                10k): três cores sobre cinco itens ordenados inventariam um agrupamento
                que não existe, e a rampa categórica tem três séries de propósito. */}
            {/* ⚠️ A LINHA INTEIRA É O ALVO, não o número — mesma mecânica do nível. Um
                alvo de 2 dígitos seria difícil de acertar e não anuncia que é clicável. */}
            {[...porte.carteira.faixas,
              /* A [38] entra como SEXTA LINHA DA TELA, não como sexta faixa do modelo. */
              { id: TAG_SEM_PERFIL_TELA, nome: "Sem Perfil", pessoas: porte.desqualificacao.pessoas }]
              .map((f, i) => (
              <button
                key={f.id}
                type="button"
                disabled={f.pessoas === 0}
                onClick={() => f.pessoas > 0 && setFaixaAberta(f.id)}
                /* ⚠️ Hover em CLASSE, nunca em `style` inline: inline vence stylesheet e
                   o hover não pintaria — sem erro e sem aviso. */
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-brand-hover disabled:cursor-default disabled:hover:bg-transparent"
                title={f.pessoas > 0 ? `Ver quem está em ${f.nome}` : undefined}
              >
                <span className="w-32 shrink-0 text-[12px]" style={{ color: MUTED }}>{f.nome}</span>
                <BarraDado
                  pct={(f.pessoas / maxFaixa) * 100}
                  cor={TEMA.dadoNeutro}
                  /* ⚠️ SEM TRILHO por MEDIÇÃO, não por estilo: `dadoNeutro` dá 2,27:1
                     contra `barraNeutra` e 3,31:1 contra o card. Ver a prop. */
                  semTrilho
                  entrou={entrou}
                  indice={i}
                  titulo={`${n(f.pessoas)} pessoas — ${f.nome}`}
                />
                {/* ⚠️ ABSOLUTO, nunca só percentual: faixa com 20 pessoas precisa
                    aparecer como 20 para quem lê poder descartá-la. */}
                <span className="w-10 shrink-0 text-right text-[12.5px] tabular-nums font-mono" style={{ color: TEMA.texto }}>
                  {n(f.pessoas)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ---------- [38] Sem Perfil, SEMPRE à parte ---------- */}
        {/* ⚠️ DESQUALIFICAÇÃO NÃO É TAMANHO. Somar as duas responderia outra pergunta,
            e elas não são exclusivas — por isso a interseção sai escrita. */}
        <div className="text-[12px]" style={{ color: MUTED }}>
          <b style={{ color: TEMA.texto }}>{n(porte.desqualificacao.pessoas)}</b> pessoas estão marcadas
          {" "}como <i>Sem Perfil</i>, que é <b>desqualificação, não tamanho</b> — não entram nas
          {" "}faixas acima.
          {porte.desqualificacao.ambos > 0 && (
            <> Delas, <b style={{ color: TEMA.texto }}>{n(porte.desqualificacao.ambos)}</b> também têm faixa:
            {" "}as duas marcações convivem, então os números não somam o total.</>
          )}
        </div>
      </div>

      {/* ---------- QUEM ESTÁ NESTA FAIXA ---------- */}
      <Modal
        aberto={faixaAberta !== null}
        aoFechar={() => setFaixaAberta(null)}
        titulo={`${nomeDaFaixa} — quem está nesta faixa`}
        /**
         * ⚠️⚠️ O DENOMINADOR É A PRIMEIRA COISA, e ele NÃO é o tamanho da lista. A barra
         * conta a CARTEIRA; a lista mostra quem está no FUNIL agora. Sem esta frase o
         * modal contradiz o gráfico que o abriu — e a pessoa conclui que sumiu gente.
         */
        subtitulo={
          listaDaFaixa.length === totalDaFaixa
            ? `${n(totalDaFaixa)} ${totalDaFaixa === 1 ? "pessoa" : "pessoas"}`
            : `Mostrando ${n(listaDaFaixa.length)} de ${n(totalDaFaixa)}. As outras não têm oportunidade aberta — sem ela não existe etapa atual nem tempo parado.`
        }
      >
        {listaDaFaixa.length === 0 ? (
          /* ⚠️ VAZIO AMBÍGUO: aqui "nenhuma" nunca significa que a faixa está vazia — a
             barra acabou de dizer que não está. Significa que ninguém dela está no funil. */
          <div className="text-[13px]" style={{ color: MUTED }}>
            Nenhuma das {n(totalDaFaixa)} está no funil agora. Elas existem na carteira, mas sem
            {" "}oportunidade aberta não há etapa nem tempo para mostrar.
          </div>
        ) : (
          <div className="space-y-1">
            {listaDaFaixa.map((pes, i) => (
              <div key={`${pes.nome}-${i}`} className="flex items-baseline gap-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate" style={{ color: TEMA.texto }}>{pes.nome}</span>
                {/* Mesma regra da pendência: o título só quando acrescenta. */}
                <span className="min-w-0 flex-1 truncate" style={{ color: MUTED }}>
                  {ehRedundante(pes.nome, pes.tituloCrm) ? "" : pes.tituloCrm ?? ""}
                </span>
                <span className="w-36 shrink-0 truncate text-right" style={{ color: MUTED }}>{pes.nivelNome}</span>
                <span className="w-40 shrink-0 text-right tabular-nums font-mono" style={{ color: MUTED }}>
                  {pes.diasParado === null ? "sem data no CRM" : `nesta etapa há ${n(pes.diasParado)}d`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Bloco>
  );
}
