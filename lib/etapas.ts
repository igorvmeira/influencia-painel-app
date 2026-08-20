// ===========================================================================
// ETAPAS DO FUNIL 4 (Provedor de internet) — ids e NOMES REAIS do CRM.
// ===========================================================================
// ⚠️ ESTE ARQUIVO NÃO IMPORTA NADA, E ISSO É REQUISITO, NÃO ACASO.
// Os ids e os rótulos são consumidos por TELA (`components/Comercial.tsx`,
// `components/Recuperacao.tsx`) e por servidor (`lib/comercial.ts`). Eles não
// podiam morar em `lib/comercial.ts`, que é onde as outras constantes de etapa
// estão: aquele arquivo importa `node:crypto` na primeira linha, e um import de
// VALOR a partir de um componente arrastaria a cadeia inteira para o bundle do
// cliente — foi assim que um `next build` já morreu neste projeto.
// É a categoria 5 do CLAUDE.md, resolvida pela primeira saída (mudar de casa) em
// vez da segunda (declarar a duplicação).
//
// ===========================================================================
// OS NOMES SÃO OS DO CRM, LIDOS DE `getAllPipelines` EM 20/08/2026
// ===========================================================================
// ⚠️ NÃO SÃO APELIDOS NOSSOS, e a diferença é o motivo de o arquivo existir.
// Antes, dois componentes tinham mapas próprios, escritos à mão, e **dois
// rótulos já haviam divergido do CRM sem ninguém notar**:
//
//   | id | estava na tela | está no CRM |
//   |----|----------------|-------------|
//   | 15 | `Novo Lead — TRÁFEGO` (travessão) | `Novo Lead - TRÁFEGO` (hífen) |
//   | 49 | `LEAD RECUPERADO — automação`     | `LEAD RECUPERADO- AUTOMAÇÃO` |
//
// A divergência é cosmética HOJE. O problema é que ela é invisível: ninguém
// compara um rótulo de tela com o CRM, e quem usa as duas telas lado a lado
// perde a única pista de que é a mesma etapa. Se alguém RENOMEAR uma etapa no
// CRM, o painel continua exibindo o nome velho para sempre, sem erro nenhum.
//
// 🔧 QUANDO RENOMEAREM NO CRM: a fonte é `getAllPipelines`, funil 4, campo
// `stages[].name`. Este mapa é cópia manual — é o preço de não pagar uma chamada
// à API a cada carregamento de tela. Copiar de novo é o conserto.

// ---- ids ------------------------------------------------------------------
// A ordem é a do `stageorders` do funil 4, não a numérica.

export const ETAPA_NOVO_LEAD = 15;
export const ETAPA_FOLLOWUP_AGENDAMENTO = 21;
export const ETAPA_LEADS_FUTUROS = 118;
export const ETAPA_LEADS_OUTBOUND = 114;
export const ETAPA_PROSPECCAO_MA = 138;
export const ETAPA_COMPRA_E_VENDA = 134;
export const ETAPA_RECUPERACAO_LEAD = 113;

/**
 * `[49] LEAD RECUPERADO- AUTOMAÇÃO`.
 *
 * ⚠️ TEM NOME PRÓPRIO PORQUE É COMPARADA SOZINHA, não só como membro de
 * `ETAPAS_RECUPERACAO`. `components/Recuperacao.tsx` e `lib/comercialAgregado.ts`
 * perguntam por ela especificamente — é a etapa em que o SISTEMA reivindica ter
 * recuperado o lead, que é afirmação diferente de "está em recuperação".
 *
 * 🔑 E o array a referencia, nunca o contrário: `ETAPAS_RECUPERACAO` é derivado,
 * a etapa é o fato.
 */
export const ETAPA_RECUPERADO_AUTOMACAO = 49;

export const ETAPA_AGENDADO_REUNIAO = 17;
export const ETAPA_NEGOCIACAO = 27;
export const ETAPA_NUTRICAO_NEGOCIACAO = 61;

/** `[20] Fechamento`. ⚠️ Por decisão do dono, estar aqui É venda feita. */
export const ETAPA_FECHAMENTO = 20;

// ---- nomes ----------------------------------------------------------------

/**
 * Id → nome, exatamente como o CRM devolve.
 *
 * ⚠️ NUNCA use `?? ""` ao consumir: etapa desconhecida tem que aparecer com o id
 * à vista (`etapa 137`), nunca sumir em silêncio. O funil ganha etapa nova sem
 * ninguém avisar o painel, e balde cego é como isso vira invisível.
 */
export const NOME_ETAPA: Readonly<Record<number, string>> = {
  [ETAPA_NOVO_LEAD]: "Novo Lead - TRÁFEGO",
  [ETAPA_FOLLOWUP_AGENDAMENTO]: "Follow-up Agendamento",
  [ETAPA_LEADS_FUTUROS]: "LEADS FUTUROS",
  [ETAPA_LEADS_OUTBOUND]: "LEADS OUTBOUND",
  [ETAPA_PROSPECCAO_MA]: "PROSPECÇÃO M&A",
  [ETAPA_COMPRA_E_VENDA]: "COMPRA E VENDA",
  [ETAPA_RECUPERACAO_LEAD]: "Recuperação de LEAD",
  [ETAPA_RECUPERADO_AUTOMACAO]: "LEAD RECUPERADO- AUTOMAÇÃO",
  [ETAPA_AGENDADO_REUNIAO]: "Agendado Reunião",
  [ETAPA_NEGOCIACAO]: "NEGOCIAÇÃO",
  [ETAPA_NUTRICAO_NEGOCIACAO]: "Nutrição Negociação",
  [ETAPA_FECHAMENTO]: "Fechamento",
};

// ---- apresentação --------------------------------------------------------

/**
 * Palavras que ficam minúsculas quando NÃO são a primeira. Convenção do
 * português, não exceção deste CRM — por isso a lista pode existir sem virar
 * dívida: ela não envelhece com o cadastro de etapas.
 */
const MENORES = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "a", "o", "para", "com", "por"]);

/** Token só de MAIÚSCULAS: tem letra maiúscula e nenhuma minúscula. */
const gritado = (t: string) => /\p{Lu}/u.test(t) && !/\p{Ll}/u.test(t);

/** Token com algo que não é letra/hífen/apóstrofo — `M&A`, `B2B`, `2ª`. */
const temSimbolo = (t: string) => /[^\p{L}\-']/u.test(t);

/**
 * APRESENTA o nome do CRM sem GUARDAR outro texto.
 *
 * ⚠️⚠️ POR QUE NÃO É UM RÓTULO DE EXIBIÇÃO. `LEAD RECUPERADO- AUTOMAÇÃO` é feio na
 * tela, e a saída óbvia — escrever "Lead Recuperado - Automação" num mapa nosso —
 * criaria uma SEGUNDA CÓPIA, que diverge no dia em que a etapa for renomeada no
 * CRM. É exatamente o defeito que este arquivo acabou de consertar. Transformação
 * pura sobre o nome real acompanha a renomeação sozinha.
 *
 * AS TRÊS REGRAS, todas ESTRUTURAIS — nenhuma conhece um nome específico:
 *   1. só mexe em token GRITADO; caixa mista é escolha de quem nomeou e fica;
 *   2. token com SÍMBOLO fica intacto — é o que salva `M&A` sem conhecê-lo;
 *   3. palavra menor minúscula fora da primeira posição.
 * O hífen só ganha espaço quando JÁ tem espaço de um lado, senão `Follow-up`
 * viraria `Follow - up`.
 *
 * 🕳️ O FURO CONHECIDO — `SDR - QUALIFICAÇÃO` sai como `Sdr - Qualificação`.
 * Sigla puramente ALFABÉTICA é indistinguível de palavra gritada: `LEADS` deve
 * virar `Leads` e `SDR` não deveria, e nenhuma regra estrutural separa as duas.
 * A saída seria uma lista mínima de siglas — mas ela só se justifica quando
 * existir um caso REAL. Nenhuma das 12 etapas de hoje tem sigla alfabética pura.
 * ⚠️ E a falha é COSMÉTICA, não semântica: `Sdr - Qualificação` continua
 * identificando a etapa. Feio é aceitável; errado não seria.
 */
export function apresentarEtapa(bruto: unknown): string {
  const cru = String(bruto ?? "").trim();
  if (!cru) return cru;
  const comHifen = cru.replace(/\s+-\s*|\s*-\s+/g, " - ");
  return comHifen.split(/\s+/).map((tok, i) => {
    if (!gritado(tok) || temSimbolo(tok)) return tok;
    const min = tok.toLocaleLowerCase("pt-BR");
    if (i > 0 && MENORES.has(min)) return min;
    return min.charAt(0).toLocaleUpperCase("pt-BR") + min.slice(1);
  }).join(" ");
}

/**
 * O que vai na TELA: nome do CRM apresentado, ou o id à vista.
 *
 * ⚠️ Nunca string vazia. Etapa desconhecida sai como `etapa 137` — o funil ganha
 * etapa nova sem avisar o painel, e balde cego é como isso vira invisível.
 * O id NÃO passa pelo apresentador: ali o texto é nosso, não do CRM.
 */
export const nomeEtapa = (id: unknown): string => {
  const cru = NOME_ETAPA[Number(id)];
  return cru === undefined ? `etapa ${id}` : apresentarEtapa(cru);
};
