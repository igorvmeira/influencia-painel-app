/**
 * SYNC GRANULAR DO COMERCIAL — Etapa A.
 *
 * Lê o Xmax e grava as duas coleções granulares: `comercial_oportunidades` e
 * `comercial_pessoas`. NADA de tela ainda, e nenhum pré-agregado — esse é a
 * Etapa C. Aqui o objetivo é o dado bruto conferível.
 *
 *   GET /api/comercial/sync?key=<CRON_SECRET>            → PRÉVIA (não grava)
 *   GET /api/comercial/sync?key=<CRON_SECRET>&aplicar=1  → grava
 *
 * ⚠️ PRÉVIA POR PADRÃO, regra da casa. E a prévia devolve os números de
 * conferência contra o diagnóstico de 15/08/2026 — se algum divergir, é para
 * PARAR e entender antes de aplicar, não para aplicar e ver no que dá.
 *
 * ⚠️ ETAPA A SÓ ENXERGA AS ABERTAS. `getPipeOpportunities` não devolve encerrada
 * (a API não tem endpoint para isso), então as pessoas montadas aqui refletem só
 * o que está aberto. O histórico de fechamentos entra na Etapa B, por varredura
 * de ID — e o desenho já prevê isso: o sync FUNDE o que busca com o que já está
 * gravado, então quando o backfill trouxer as encerradas, as pessoas se
 * recompõem sozinhas sem este código mudar.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import { COL_SISTEMA, DOC_SYNC_COMERCIAL } from "@/lib/colecoes";
import {
  lerConfigXmax, chamarXmax, ConfigXmax, OportunidadeXmax,
  nomeOrigem, semOrigem, centavosParaReais,
} from "@/lib/xmax";
import {
  FUNIL_CAPTACAO, FUNIL_DESQUALIFICADOS, ordemDeEtapas, normalizarOportunidade,
  agruparPessoas, ehRecuperacao, ehNegociacao, ehEncerrada, conflitoDeOrdem,
  OportunidadeGravada,
} from "@/lib/comercial";
import { montarAgregado } from "@/lib/comercialAgregado";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const COL_OP = "comercial_oportunidades";
const COL_PESSOA = "comercial_pessoas";
const COL_CONFIG = "comercial_config";
/** Pré-agregado: um doc, uma leitura. Ver o comentário na gravação. */
const COL_AGREGADO = "comercial_agregados";
/** Abaixo do limite de 500 operações por batch do Firestore. */
const LOTE = 450;

interface Etapa { id: number; name?: string }
interface Funil { id: number; name?: string; stageorders?: number[]; stages?: Etapa[] }

/**
 * Números do diagnóstico de 15/08/2026. A prévia compara contra eles e ACUSA a
 * divergência — não corrige, não silencia.
 *
 * ⚠️ TODOS OS CINCO SÃO SOBRE **ABERTAS**, e isso passou a importar depois da
 * Etapa B. Quando foram medidos, abertas era tudo que existia: a API não lista
 * encerrada, então "oportunidades do funil 4" e "abertas do funil 4" eram o mesmo
 * número e o rótulo não distinguia. O backfill trouxe 2.873 encerradas e separou
 * as duas coisas — comparar o universo (4.529) contra uma referência de abertas
 * (1.656) acusaria divergência todo dia, por construção, e uma conferência que
 * está sempre vermelha para de ser lida.
 *
 * ⚠️ Divergir NÃO é necessariamente defeito: a base é viva e o Marcos mexe nela
 * todo dia. O que a conferência protege é outra coisa — divergência GRANDE ou em
 * direção estranha (pessoas > oportunidades, negociação triplicando) significa
 * que a REGRA mudou de comportamento, e aí é bug. Por isso o retorno mostra o
 * esperado, o obtido e a diferença, e deixa o julgamento com quem lê.
 */
const REFERENCIA = {
  oportunidades: 1656,
  pessoas: 1455,
  captacao: 472,
  recuperacao: 838,
  negociacao: 110,
  conversaAvancada: 150,
  foraDoFunil: 156,
  medidoEm: "2026-08-14",
  escopo: "abertas do funil de captação, com o funil do dono",
};

/**
 * ⚠️ A CONFERÊNCIA QUE PEGA ERRO DE EMPATE NO NÍVEL 1.
 *
 * `captacao` sozinha não pega: se [15] e [114] deixarem de empatar, a soma
 * continua 472 e os níveis 1 e 2 trocam gente entre si. Só a distribuição
 * denuncia — por isso ela é conferida nível a nível, e a soma tem de fechar
 * com `captacao`.
 */
const REFERENCIA_NIVEIS: Record<number, number> = { 1: 91, 2: 231, 3: 40, 4: 22, 5: 88 };

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const cfg = lerConfigXmax();
  if ("faltando" in cfg) {
    return NextResponse.json(
      { ok: false, erro: "configuração do Xmax incompleta", faltando: cfg.faltando },
      { status: 500 }
    );
  }
  const c: ConfigXmax = cfg.config;
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  const aplicar = new URL(req.url).searchParams.get("aplicar") === "1";

  // ---------------------------------------------------------------------
  // 1) A ORDEM DAS ETAPAS — lida do funil, reportada sempre
  // ---------------------------------------------------------------------
  const rFunis = await chamarXmax<Funil[]>(c, "getAllPipelines", "global");
  if (!rFunis.ok || !Array.isArray(rFunis.dados)) {
    return NextResponse.json(
      { ok: false, erro: "getAllPipelines falhou", detalhe: rFunis.erro }, { status: 502 }
    );
  }
  const funil = rFunis.dados.find((f) => Number(f.id) === FUNIL_CAPTACAO);
  if (!funil) {
    return NextResponse.json(
      { ok: false, erro: `funil ${FUNIL_CAPTACAO} não existe mais na instância` }, { status: 502 }
    );
  }
  const ordem = ordemDeEtapas(funil);
  const nomeEtapa = new Map((funil.stages ?? []).map((e) => [Number(e.id), String(e.name ?? "")]));

  // ---------------------------------------------------------------------
  // 2) BUSCA — captação + desqualificados da era antiga
  // ---------------------------------------------------------------------
  const buscar = async (pipelineId: number) => {
    const r = await chamarXmax<OportunidadeXmax[]>(c, "getPipeOpportunities", "fila", { pipelineId });
    return { lista: Array.isArray(r.dados) ? r.dados : [], erro: r.erro };
  };
  const cap = await buscar(FUNIL_CAPTACAO);
  const desq = await buscar(FUNIL_DESQUALIFICADOS);
  if (cap.erro) {
    return NextResponse.json(
      { ok: false, erro: "getPipeOpportunities do funil de captação falhou", detalhe: cap.erro },
      { status: 502 }
    );
  }

  const frescas = [...cap.lista, ...desq.lista].map(normalizarOportunidade);

  // ---------------------------------------------------------------------
  // 3) FUNDE com o que já está gravado
  // ---------------------------------------------------------------------
  // ⚠️ Sem esta união, a Etapa B (backfill das encerradas) seria desfeita no
  // primeiro sync diário: as pessoas voltariam a ser montadas só com as abertas.
  const snapExistente = await db.collection(COL_OP).get();
  const porId = new Map<number, OportunidadeGravada>();
  snapExistente.docs.forEach((d) => {
    const x = d.data() as OportunidadeGravada;
    if (Number.isFinite(Number(x?.id))) porId.set(Number(x.id), x);
  });
  const idsFrescos = new Set(frescas.map((o) => o.id));
  frescas.forEach((o) => porId.set(o.id, o));
  const universo = [...porId.values()];

  const pessoas = agruparPessoas(universo, ordem);

  // ---------------------------------------------------------------------
  // 4) OS NÚMEROS DE CONFERÊNCIA
  // ---------------------------------------------------------------------
  const doFunil4 = universo.filter((o) => o.pipelineId === FUNIL_CAPTACAO);
  const pessoasDoFunil4 = pessoas.filter((p) =>
    p.oportunidadeIds.some((id) => porId.get(id)?.pipelineId === FUNIL_CAPTACAO));

  // ⚠️ A CONFERÊNCIA COMPARA ABERTA COM ABERTA. Ver o comentário de REFERENCIA:
  // depois do backfill, `doFunil4` é histórico (4.529) e a referência é foto do
  // funil (1.656). Medir um contra o outro não diz nada.
  const abertasFunil4 = doFunil4.filter((o) => !ehEncerrada(o.status));
  const idsAbertos = new Set(abertasFunil4.map((o) => o.id));
  const pessoasComAberta = pessoasDoFunil4.filter((p) => p.oportunidadeIds.some((id) => idsAbertos.has(id)));

  // ⚠️ CAPTAÇÃO passou a ser "está numa das 6 etapas do funil do DONO", não mais
  // "tem etapa e não é recuperação". Foi de 629 para 472: a diferença são as 156
  // pessoas em etapas que o Thiago tirou do funil — que viram linha visível, não
  // sumiço. Ver NIVEIS_FUNIL e ETAPAS_FORA_DO_FUNIL em lib/comercial.ts.
  const emCaptacao = pessoasComAberta.filter((p) => p.nivel !== null).length;
  const emRecuperacao = pessoasComAberta.filter((p) => p.emRecuperacao).length;
  const emNegociacao = pessoasComAberta.filter((p) => p.emNegociacao).length;

  const obtido = {
    oportunidades: abertasFunil4.length,
    pessoas: pessoasComAberta.length,
    captacao: emCaptacao,
    recuperacao: emRecuperacao,
    negociacao: emNegociacao,
    conversaAvancada: pessoasComAberta.filter((p) => p.emConversaAvancada).length,
    foraDoFunil: pessoasComAberta.filter((p) => p.foraDoFunil).length,
  };

  const niveis = [1, 2, 3, 4, 5].map((n) => {
    const q = pessoasComAberta.filter((p) => p.nivel === n).length;
    return { nivel: n, esperado: REFERENCIA_NIVEIS[n], obtido: q, diferenca: q - REFERENCIA_NIVEIS[n] };
  });
  const somaNiveis = niveis.reduce((t, x) => t + x.obtido, 0);
  // Só as chaves NUMÉRICAS entram na comparação — `medidoEm` e `escopo` são
  // rótulos. Filtrar por nome já deixou o `escopo` virar uma linha com
  // `diferenca: null`, que sozinha derrubava o `tudoBate`.
  const conferencia = Object.entries(REFERENCIA)
    .filter(([, v]) => typeof v === "number")
    .map(([k, esperado]) => {
      const v = obtido[k as keyof typeof obtido];
      return { metrica: k, esperado, obtido: v, diferenca: v - Number(esperado) };
    });
  const divergentes = conferencia.filter((x) => x.diferenca !== 0);

  // Foto por etapa, nas duas visões — é o que a Etapa C vai pré-agregar.
  const porEtapa = ordem.map((id) => {
    const ops = doFunil4.filter((o) => o.stageId === id).length;
    const pessoasNaEtapa = pessoasDoFunil4.filter((p) => p.etapaMaisAvancada === id).length;
    const naCaptacao = ehRecuperacao(id)
      ? null
      : pessoasDoFunil4.filter((p) => p.etapaNaCaptacao === id).length;
    return {
      etapaId: id,
      nome: nomeEtapa.get(id) ?? `(etapa ${id})`,
      oportunidades: ops,
      pessoasVarianteA: pessoasNaEtapa,
      pessoasCaptacao: naCaptacao,
      recuperacao: ehRecuperacao(id),
      negociacao: ehNegociacao(id),
    };
  });

  // ---------------------------------------------------------------------
  // 5) O QUE MUDARIA — campo a campo, não "seria reescrito"
  // ---------------------------------------------------------------------
  /**
   * ⚠️ CRIADA / ALTERADA / INALTERADA, como no /api/import-contas.
   *
   * Uma prévia que diz "1.989 seriam atualizadas" toda vez não prova nada: é o
   * total, não a mudança. O que responde "rodar de novo é seguro?" é o campo a
   * campo — e é ele que deixa o segundo apply devolver ZERO alterada.
   *
   * De quebra, só o que MUDOU é gravado: num dia parado o sync escreve ~nada em
   * vez de 3.768 docs, e escrita no Firestore custa dinheiro.
   */
  const semCarimbo = (x: Record<string, unknown>) => {
    const { atualizadoEm, ...resto } = x;
    void atualizadoEm;
    return resto;
  };
  /** Serialização canônica: chave ordenada, para a comparação não depender da ordem. */
  const canonico = (v: unknown): string => JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as object).sort(([a], [b]) => a.localeCompare(b)))
      : val);
  const mudou = (novo: Record<string, unknown>, atual: Record<string, unknown> | undefined) =>
    !atual || canonico(semCarimbo(novo)) !== canonico(semCarimbo(atual));

  const opGravadas = new Map(snapExistente.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const opCriadas = frescas.filter((o) => !opGravadas.has(String(o.id)));
  const opAlteradas = frescas.filter((o) => opGravadas.has(String(o.id))
    && mudou(o as unknown as Record<string, unknown>, opGravadas.get(String(o.id))));
  const opInalteradas = frescas.length - opCriadas.length - opAlteradas.length;

  const snapPessoas = await db.collection(COL_PESSOA).get();
  const pesGravadas = new Map(snapPessoas.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const pesCriadas = pessoas.filter((p) => !pesGravadas.has(p.id));
  const pesAlteradas = pessoas.filter((p) => pesGravadas.has(p.id)
    && mudou(p as unknown as Record<string, unknown>, pesGravadas.get(p.id)));
  const pesInalteradas = pessoas.length - pesCriadas.length - pesAlteradas.length;

  /** Só o que mudou vai para o batch. */
  const opParaGravar = [...opCriadas, ...opAlteradas];
  const pesParaGravar = [...pesCriadas, ...pesAlteradas];

  /**
   * O AGREGADO, MONTADO UMA VEZ — e é ESTE objeto que será gravado.
   *
   * ⚠️ Antes ele nascia dentro do `.set()`, o que impedia a resposta de descrever o que
   * ia para o banco: qualquer número no relatório teria que ser recalculado à parte, e
   * duas contas da mesma coisa divergem no dia em que uma das duas mudar. Aqui a
   * conferência descreve o objeto REAL.
   */
  const agregado = montarAgregado(universo, pessoas, new Date());

  /**
   * SAFRA DE ENTRADA — a conferência da etapa que só ESCREVE o `mesEntrada`.
   *
   * ⚠️ A etapa que grava sem ninguém ler precisa de um jeito de provar que gravou; senão
   * "escrevi primeiro, leio depois" vira "escrevi e ninguém conferiu". É a mesma ordem do
   * dual-write do sync de tráfego.
   *
   * ⚠️ `semMes` é o residual que a tela vai ter que declarar. Medido em 18/08/2026 ele é
   * ZERO — nenhuma das 1.679 abertas do pipeline 4 está sem `createdAt`. Mas isso é
   * propriedade do dado de hoje, não garantia do CRM, e por isso vira número no relatório
   * em vez de premissa no código.
   */
  const pessoasDosNiveis = agregado.funil.niveis.flatMap((n) => n.pessoasNaEtapa ?? []);
  const safrasMap = new Map<string, number>();
  let semMes = 0;
  for (const pe of pessoasDosNiveis) {
    if (!pe.mesEntrada) { semMes++; continue; }
    safrasMap.set(pe.mesEntrada, (safrasMap.get(pe.mesEntrada) ?? 0) + 1);
  }
  const safras = [...safrasMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a)) // mais recente primeiro, como o seletor
    .map(([mes, pessoas]) => ({ mes, pessoas }));

  const resposta: Record<string, unknown> = {
    ok: true,
    modo: aplicar ? "aplicar" : "previa",
    avisoEtapaA:
      "Etapa A enxerga só as oportunidades ABERTAS — a API não lista encerradas. "
      + "O histórico de fechamentos entra na Etapa B (varredura de ID), e as pessoas "
      + "se recompõem sozinhas porque este sync funde o buscado com o já gravado.",

    // ⚠️ SEMPRE no retorno: se a agência reordenar as etapas no Xmax, a ordem muda
    // sozinha e com ela a definição de "etapa mais avançada" — a foto inteira do
    // funil. É a coisa que muda embaixo sem ninguém avisar.
    ordemDasEtapas: {
      origem: Array.isArray(funil.stageorders) && funil.stageorders.length
        ? "stageorders do funil"
        : "ordem do array stages (stageorders veio vazio)",
      ordem: ordem.map((id, i) => ({ posicao: i + 1, etapaId: id, nome: nomeEtapa.get(id) ?? null })),
      etapasComOportunidadeForaDaOrdem: [...new Set(doFunil4.map((o) => o.stageId))]
        .filter((id) => id !== null && !ordem.includes(Number(id))),
    },

    conferencia: {
      referencia: `diagnóstico de ${REFERENCIA.medidoEm}`,
      escopo: REFERENCIA.escopo,
      nota:
        "Divergência não é automaticamente defeito — a base é viva. Preocupa o que for "
        + "grande ou de direção estranha (pessoas > oportunidades, negociação triplicando): "
        + "aí a regra mudou de comportamento.",
      // ⚠️ `tudoBate` compara com uma FOTO de 14/08/2026 e vai divergir para sempre,
      // porque a agência cria lead todo dia. Ele responde "mudou desde a medição?",
      // não "está certo?". Quem responde "está certo?" é `coerencia` abaixo: são
      // identidades que valem em QUALQUER dia, e essas sim nunca podem quebrar.
      linhas: conferencia,
      // ⚠️ A conferência por NÍVEL é a que pega quebra de empate no nível 1 — a
      // soma continuaria certa com os níveis 1 e 2 trocando gente entre si.
      niveis,
      tudoBate: divergentes.length === 0 && niveis.every((n) => n.diferenca === 0),

      /**
       * ⚠️ AS IDENTIDADES QUE VALEM EM QUALQUER DIA. Ao contrário de `tudoBate`,
       * estas não derivam com o crescimento da base — se uma quebrar, é BUG.
       *
       * `somaDosNiveis` é a que pega quebra do empate no nível 1: se [15] e [114]
       * deixarem de empatar, `captacao` continua igual e os níveis 1 e 2 trocam
       * gente entre si — a única coisa que denuncia é a distribuição.
       */
      coerencia: {
        somaDosNiveis: {
          soma: somaNiveis, captacao: obtido.captacao, ok: somaNiveis === obtido.captacao,
        },
        // Negociação ⊆ conversa avançada, sempre: [27,20] está contido em [17,27,20].
        negociacaoDentroDeConversa: {
          negociacao: obtido.negociacao, conversaAvancada: obtido.conversaAvancada,
          ok: obtido.negociacao <= obtido.conversaAvancada,
        },
        // Ninguém do funil pode estar contado como "fora do funil".
        semSobreposicao: {
          captacao: obtido.captacao, foraDoFunil: obtido.foraDoFunil,
          somaNaoPassaDoTotal: obtido.captacao + obtido.foraDoFunil <= obtido.pessoas,
          ok: obtido.captacao + obtido.foraDoFunil <= obtido.pessoas,
        },
        /**
         * ⚠️ IDENTIDADE, não comparação com foto: a soma das safras mais quem não tem
         * mês TEM que dar o total das listas, em qualquer dia. Se quebrar, alguém
         * duplicou ou perdeu gente ao agrupar por mês — e é justamente o número que a
         * tela vai dividir ("30 das 210"). Divisão com universo furado sai plausível.
         */
        safraFechaComAsListas: {
          somaDasSafras: safras.reduce((t, x) => t + x.pessoas, 0),
          semMes,
          totalNasListas: pessoasDosNiveis.length,
          ok: safras.reduce((t, x) => t + x.pessoas, 0) + semMes === pessoasDosNiveis.length,
        },
        tudoCoerente:
          somaNiveis === obtido.captacao
          && obtido.negociacao <= obtido.conversaAvancada
          && obtido.captacao + obtido.foraDoFunil <= obtido.pessoas
          && safras.reduce((t, x) => t + x.pessoas, 0) + semMes === pessoasDosNiveis.length,
      },
    },

    /**
     * A FOTO DAS SAFRAS — existe para conferir a etapa de escrita do `mesEntrada`.
     *
     * ⚠️ `semMes` é o que a tela precisará declarar como residual. Enquanto for 0, a soma
     * das safras é o funil inteiro; no dia em que não for, a /comercial mostra a linha.
     */
    safraDeEntrada: {
      nota:
        "mesEntrada sai de primeiroContato, que cobre os funis 4 E 23 — é ENTRADA NO "
        + "COMERCIAL, não entrada no funil de captação. Mesma régua do leadsNovos, para o "
        + "denominador da tela fechar.",
      totalNasListas: pessoasDosNiveis.length,
      semMes,
      mesesDistintos: safras.length,
      porMes: safras,
    },

    // ⚠️ O `stageorders` continua sendo lido — não para mandar, para DENUNCIAR.
    // A ordem de negócio é a constante NIVEIS_FUNIL; se a agência reordenar no
    // Xmax, aparece aqui em vez de mudar a foto do funil em silêncio.
    ordemDoDonoVsXmax: conflitoDeOrdem(ordem),

    funil: {
      id: FUNIL_CAPTACAO,
      nome: funil.name ?? null,
      porEtapa,
      /**
       * ⚠️ DUAS CONTAGENS, SEMPRE ROTULADAS. `abertas` é a foto (quem está no
       * funil agora); `historico` inclui as encerradas que a Etapa B trouxe. Um
       * número solto aqui viraria "oportunidades" na tela e ninguém saberia qual
       * dos dois está lendo — o mesmo erro que já custou o 631 vs 629.
       */
      totais: {
        abertas: abertasFunil4.length,
        pessoasComAberta: pessoasComAberta.length,
        historico: doFunil4.length,
        pessoasNoHistorico: pessoasDoFunil4.length,
        encerradas: doFunil4.length - abertasFunil4.length,
        semTelefone: pessoasDoFunil4.filter((p) => !p.temTelefone).length,
      },
    },

    desqualificacao: {
      funil23: desq.lista.length,
      erroFunil23: desq.erro,
      porEtiqueta38: universo.filter((o) => o.desqualificada && o.pipelineId === FUNIL_CAPTACAO).length,
      pessoasDesqualificadas: pessoas.filter((p) => p.desqualificada).length,
      nota: "As DUAS formas contam: funil 23 (era antiga) e etiqueta [38] (hoje).",
    },

    origens: [...new Set(doFunil4.map((o) => o.origem))]
      .map((id) => ({
        origemId: id,
        nome: nomeOrigem(id),
        semOrigem: semOrigem(id),
        oportunidades: doFunil4.filter((o) => o.origem === id).length,
      }))
      .sort((a, b) => b.oportunidades - a.oportunidades),

    mrr: {
      pessoasQueGanharam: pessoas.filter((p) => p.ganhou).length,
      mrrSomadoReais: centavosParaReais(pessoas.reduce((t, p) => t + p.mrrFechadoCent, 0)),
      fechamentosSemValor: pessoas.reduce((t, p) => t + p.fechamentosSemValor, 0),
      nota:
        "Fechamento sem valor NÃO entra como zero na soma — é contado à parte. "
        + "A tela dirá 'N sem valor informado — o total real é maior'.",
    },

    gravacao: {
      nota:
        "Criada/alterada/inalterada é campo a campo, não 'seria reescrita'. Rodar "
        + "de novo sem nada ter mudado no Xmax deve dar 0 criada e 0 alterada — é o "
        + "teste de idempotência. Só o que mudou é gravado.",
      /**
       * ⚠️ ESTE BLOCO FALA SÓ DAS COLEÇÕES GRANULARES (oportunidades e pessoas). O
       * AGREGADO NÃO ENTRA AQUI: ele é reescrito INTEIRO (`merge: false`) a cada apply,
       * sempre, fora de qualquer diff.
       *
       * Sem esta linha, "idempotente: true, gravadas: 0" logo depois de um campo NOVO
       * parece dizer que o campo não foi gravado — e é exatamente o que alguém conclui
       * ao ler o relatório. Quem responde por ele é `agregado` abaixo, que LÊ DE VOLTA
       * do banco em vez de afirmar.
       */
      escopoDestesNumeros: "coleções granulares (oportunidades e pessoas) — o agregado é reescrito inteiro, sempre",
      oportunidades: {
        naFonte: frescas.length,
        criadas: opCriadas.length,
        alteradas: opAlteradas.length,
        inalteradas: opInalteradas,
      },
      pessoas: {
        calculadas: pessoas.length,
        criadas: pesCriadas.length,
        alteradas: pesAlteradas.length,
        inalteradas: pesInalteradas,
      },
      // Gravadas antes e ausentes agora: nunca apagadas, só listadas.
      jaGravadasQueNaoVieramAgora: universo.length - idsFrescos.size,
      idempotente: opCriadas.length === 0 && opAlteradas.length === 0
        && pesCriadas.length === 0 && pesAlteradas.length === 0,
      gravadas: 0,
    },
    consultadoEm: new Date().toISOString(),
  };

  if (!aplicar) return NextResponse.json(resposta);

  // ---------------------------------------------------------------------
  // 6) APLICAR — merge, nunca sobrescrita cega; nada é apagado
  // ---------------------------------------------------------------------
  let gravadas = 0;
  /** Preenchido pela leitura de volta do agregado — ver o bloco abaixo. */
  let conferenciaDoBanco: Record<string, unknown> | null = null;
  const escrever = async <T extends { }>(col: string, itens: T[], idDe: (x: T) => string) => {
    for (let i = 0; i < itens.length; i += LOTE) {
      const batch = db.batch();
      for (const x of itens.slice(i, i + LOTE)) {
        batch.set(db.collection(col).doc(idDe(x)), { ...x, atualizadoEm: new Date().toISOString() }, { merge: true });
      }
      await batch.commit();
      gravadas += Math.min(LOTE, itens.length - i);
    }
  };

  try {
    await escrever(COL_OP, opParaGravar, (o) => String(o.id));
    await escrever(COL_PESSOA, pesParaGravar, (p) => p.id);
    // Mapas que a API não devolve, para a tela não depender de constante do código.
    await db.collection(COL_CONFIG).doc("etapas").set({
      funilId: FUNIL_CAPTACAO,
      ordem,
      nomes: Object.fromEntries([...nomeEtapa.entries()]),
      atualizadoEm: new Date().toISOString(),
    }, { merge: true });
    /**
     * ⚠️ O PRÉ-AGREGADO — é o que faz a tela custar 1 LEITURA em vez de ~7.500.
     *
     * Sem ele, /comercial varreria `comercial_oportunidades` (4.862) e
     * `comercial_pessoas` (2.653) a cada visita. No plano grátis isso derruba o
     * app; no Blaze vira dinheiro por aba aberta. Ver a regra de custo de leitura
     * no CLAUDE.md.
     *
     * É DERIVADO: as duas coleções granulares seguem intactas como auditoria, e
     * mudar uma regra é rodar o sync de novo — não há migração de dado.
     */
    // ⚠️ O MESMO objeto que a resposta acabou de descrever — não uma segunda montagem.
    await db.collection(COL_AGREGADO).doc("funil").set(agregado, { merge: false });

    /**
     * LEITURA DE VOLTA — a única prova de que o campo novo chegou ao banco.
     *
     * ⚠️ POR QUE NÃO BASTA O RELATÓRIO: tudo que a resposta diz sobre `mesEntrada` é
     * calculado do objeto EM MEMÓRIA. Um campo pode ser montado certo e não ser gravado
     * (regra de merge, sanitização, tipo recusado) — e o relatório continuaria verde.
     * Conferir o que se montou é conferir a si mesmo.
     *
     * ⚠️ Custa UMA leitura por apply, e o `get` de um documento logo após o `set` é
     * fortemente consistente no Firestore — é a leitura certa para esta pergunta.
     *
     * ⚠️ FICA DEPOIS DA MIGRAÇÃO. Não é código de uma vez: toda vez que um campo novo
     * entrar no agregado, é aqui que se descobre se ele chegou. O que muda é só a
     * contagem que se compara.
     */
    const lido = await db.collection(COL_AGREGADO).doc("funil").get();
    const dadosLidos = lido.data() as { funil?: { niveis?: { pessoasNaEtapa?: { mesEntrada?: string | null }[] }[] } } | undefined;
    const listasLidas = (dadosLidos?.funil?.niveis ?? []).flatMap((x) => x.pessoasNaEtapa ?? []);
    const comMesNoBanco = listasLidas.filter((x) => typeof x.mesEntrada === "string" && x.mesEntrada.length === 7).length;
    conferenciaDoBanco = {
      docExiste: lido.exists,
      pessoasNoDocLido: listasLidas.length,
      comMesEntrada: comMesNoBanco,
      semMesEntrada: listasLidas.length - comMesNoBanco,
      /** Bate com o que a resposta calculou em memória? Se não, o gravado ≠ o relatado. */
      confereComOCalculado:
        listasLidas.length === pessoasDosNiveis.length
        && comMesNoBanco === pessoasDosNiveis.length - semMes,
    };
    await db.collection(COL_SISTEMA).doc(DOC_SYNC_COMERCIAL).set({
      ultimaExecucao: new Date().toISOString(),
      oportunidadesAbertas: frescas.length,
      pessoas: pessoas.length,
    }, { merge: true });
  } catch (e) {
    return NextResponse.json({
      ok: false, erro: "falha ao gravar — parte pode ter sido escrita",
      detalhe: String(e).slice(0, 300), gravadasAteFalhar: gravadas,
    }, { status: 500 });
  }

  return NextResponse.json({
    ...resposta,
    gravacao: { ...(resposta.gravacao as object), gravadas, agregado: conferenciaDoBanco },
  });
}
