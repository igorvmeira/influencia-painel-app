/**
 * LEITOR DA PLANILHA "MONITORAMENTO GERÊNCIA" — só leitura, nunca escreve.
 *
 * ⚠️⚠️ A COLUNA NÃO É ACHADA PELO CABEÇALHO NEM PELA POSIÇÃO, E OS DOIS JÁ FALHARAM.
 *
 * Posição: a aba do MATHEUS estava deslocada e deixou de estar quando o Roberto
 * inseriu colunas; `CPL ÚLTIMO` e `PENÚLTIMO` estão trocados entre abas; 9 das 11 abas
 * mudaram de largura entre 02/09 e 10/09/2026.
 *
 * Cabeçalho: a minha própria varredura errou lendo por cabeçalho DUAS vezes. A segunda
 * foi em 10/09/2026, procurando a palavra "CLIENTE" na linha 1 — não achou em 6 das 8
 * abas, porque lá está escrito "CLIENTES ISMAIL", "CLIENTES ANDRÉ". E há cabeçalho
 * duplicado de verdade: a aba do MATHEUS tem "ID META" em B **e** em F.
 *
 * 🔑 O DESENHO: **conteúdo para o que tem vocabulário; cabeçalho ANCORADO no conteúdo
 * para o resto.** Primeiro acham-se as colunas de que se tem certeza pelo que está
 * escrito nas células (id, situação, forma de pagamento — as três têm vocabulário
 * fechado). Só então procura-se a linha de cabeçalho, e ela **só é aceita se os nomes
 * dela concordarem com as colunas que o conteúdo já provou**. Um cabeçalho que aponta
 * para o lugar errado não é usado. Depois disso, as colunas sem vocabulário (orçamento
 * Meta, orçamento Google, notificação) podem sair do cabeçalho — porque ele deixou de
 * ser palpite e passou a ser fonte conferida.
 *
 * ⚠️ E TODA COLUNA SAI COM A CONFIANÇA JUNTO. Nota baixa não vira leitura silenciosa:
 * vira diagnóstico. Medido em 10/09: o detector acerta 24/24 nas três colunas ancoradas
 * das 8 abas, e na aba do MATHEUS ele diz **"não achei coluna de id"** em vez de chutar,
 * e cai para 50% na situação — porque G5 e G6 têm "Locação de Equipamentos" e "Venda de
 * produtos", que são nicho no lugar errado. Ele reporta o defeito da planilha em vez de
 * absorvê-lo.
 */
import { obterAccessToken, ESCOPO_PLANILHA_LEITURA } from "./googleAuth";
import { GESTORES } from "./gestores";
import { interpretarSituacao, ROTULOS_ACEITOS, type Situacao } from "./situacaoPlanilha";

/** Faixa lida por aba. Larga de propósito: a planilha cresce e ninguém avisa. */
const FAIXA = "A1:AZ2000";

/** Confiança mínima para uma coluna ancorada valer. Abaixo disto, vira diagnóstico. */
const CONFIANCA_MINIMA = 0.7;

/** Vocabulário fechado da forma de pagamento — lista de validação da planilha. */
const PAGAMENTOS: ReadonlySet<string> = new Set(["CARTÃO", "BOLETO", "PIX"]);

/**
 * Reconhece o formato de accountId ACEITANDO o torto.
 *
 * ⚠️ `act=1311811284041335` está na planilha hoje (INTERIP, aba WEDER) — sinal de
 * digitação à mão. Reconhecer o torto é o que permite REPORTÁ-LO; recusar aqui faria a
 * linha sumir como "sem id", que é outra coisa e pede outra ação.
 */
const PARECE_ID = /^act[_= -]?\d{6,}$/i;

/** Extrai os dígitos e devolve `act_<dígitos>`, ou `null` se não houver id nenhum. */
export function normalizarAccountId(cru: string): string | null {
  const m = String(cru || "").match(/(\d{6,})/);
  return m ? `act_${m[1]}` : null;
}

/** O id está escrito exatamente como o painel grava? */
export function formatoCanonico(cru: string): boolean {
  return /^act_\d{6,}$/.test(String(cru || "").trim());
}

export type FonteColuna = "conteudo" | "cabecalho" | "ausente";

export interface Coluna {
  indice: number | null;
  fonte: FonteColuna;
  /** Fração das células do corpo que casaram o vocabulário. `null` quando veio do cabeçalho. */
  confianca: number | null;
}

export interface DiagnosticoAba {
  aba: string;
  linhasDeCliente: number;
  colunas: Record<string, Coluna>;
  /** Linha do cabeçalho aceito (1-based), ou `null` se nenhum passou na âncora. */
  linhaCabecalho: number | null;
  /** Quantas colunas ancoradas o cabeçalho confirmou. 0 = cabeçalho não usado. */
  ancoras: number;
  /** Problemas de estrutura, em português, para o relatório. */
  avisos: string[];
}

export interface LinhaPlanilha {
  /** O gestor É o nome da aba. Decisão da agência em 10/09/2026. */
  aba: string;
  /** 1-based, como o Google Sheets mostra — para o Roberto achar a linha. */
  linha: number;
  cliente: string;
  /** Exatamente como está na célula, torto inclusive. */
  idCru: string;
  /** `act_<dígitos>`, ou `null` quando não há id nenhum na célula. */
  accountId: string | null;
  situacao: Situacao;
  orcamentoMeta: string;
  orcamentoGoogle: string;
  formaPagamento: string;
  notificacaoGerencial: string;
  preencheBI: string;
}

export interface LeituraPlanilha {
  /** Instante da leitura da PLANILHA. Não é o instante da leitura do painel. */
  lidaEm: string;
  titulo: string;
  linhas: LinhaPlanilha[];
  diagnosticos: DiagnosticoAba[];
  /** Abas que existem e não foram lidas, com o motivo. Nunca some em silêncio. */
  abasIgnoradas: { aba: string; motivo: string }[];
}

const txt = (v: unknown): string => (v == null ? "" : String(v).trim());

/** Nome de coluna do Sheets (0 → A) — só para mensagem de diagnóstico. */
export function letraColuna(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * LINHA DE CLIENTE — a regra estrutural que dispensa detectar "onde a tabela acaba".
 *
 * ⚠️ Seis abas têm um SEGUNDO BLOCO empilhado (os clientes pausados daquele gestor),
 * separado do primeiro por uma linha de contagem e um sub-cabeçalho. Em vez de achar as
 * fronteiras dos blocos — que mudam toda semana —, a regra descreve o que uma linha de
 * cliente É, e os dois blocos passam pelo mesmo filtro. Os pausados do segundo bloco
 * **são do mesmo gestor**: não precisam de tratamento especial, e a própria coluna de
 * situação já diz `0 - PAUSADO`.
 *
 * O que NÃO é linha de cliente, medido em 10/09/2026:
 *  · coluna A vazia;
 *  · coluna A só com número — é a linha de CONTAGEM (`5`, `12`, `14`, `15`);
 *  · começa com "CLIENTES" — cabeçalho ("CLIENTES ISMAIL") e sub-cabeçalho, porque a aba
 *    JOÃO PEDRO repete "CLIENTES JOÃO PEDRO" na linha 19 para abrir o 2º bloco;
 *  · começa com "Pausad" — sub-cabeçalho do 2º bloco ("Pausados", "Pausado");
 *  · é o nome da própria aba — a aba MATHEUS abre com "MATHEUS" na A1.
 */
function ehLinhaDeCliente(nome: string, aba: string): boolean {
  if (!nome) return false;
  if (/^\d+$/.test(nome)) return false;
  if (/^clientes?\b/i.test(nome)) return false;
  if (/^pausad/i.test(nome)) return false;
  if (nome.toUpperCase() === aba.toUpperCase()) return false;
  return true;
}

/** Melhor coluna por vocabulário, olhando SÓ o corpo (nunca o cabeçalho). */
function porConteudo(
  grade: string[][],
  corpo: number[],
  largura: number,
  casa: (s: string) => boolean
): Coluna {
  let melhor: Coluna = { indice: null, fonte: "ausente", confianca: null };
  let melhorN = 0;
  for (let j = 1; j < largura; j++) {
    const vs = corpo.map((i) => txt(grade[i]?.[j])).filter((s) => s !== "" && s !== "-");
    if (!vs.length) continue;
    const n = vs.filter(casa).length;
    if (n === 0) continue;
    const conf = n / vs.length;
    if (n > melhorN || (n === melhorN && conf > (melhor.confianca ?? 0))) {
      melhorN = n;
      melhor = { indice: j, fonte: "conteudo", confianca: conf };
    }
  }
  return melhor;
}

/** Padrões de nome de cabeçalho. Usados SÓ depois de o cabeçalho ser validado. */
const NOME_CABECALHO: Record<string, RegExp> = {
  accountId: /^ID\b.*META|^ID DA CONTA/i,
  situacao: /SITUA[ÇC][ÃA]O/i,
  formaPagamento: /FORMA DE PGTO|M[ÉE]TODO DE PAGAMENTO/i,
  orcamentoMeta: /OR[ÇC]\.?\s*META|OR[ÇC]AMENTO MENSAL META/i,
  orcamentoGoogle: /OR[ÇC]\.?\s*GOOGLE|OR[ÇC]AMENTO MENSAL GOOGLE/i,
  notificacaoGerencial: /NOTIFICA[ÇC][ÃA]O GERENCIAL/i,
  preencheBI: /PREENCHE\s*B\.?\s*I/i,
};

/**
 * Acha a linha de cabeçalho — e só a aceita se ela CONFIRMAR o que o conteúdo achou.
 *
 * 🔑 É a inversão que faz o desenho funcionar: o cabeçalho não é a fonte, é a
 * testemunha. Ele só passa a valer para as colunas sem vocabulário depois de acertar as
 * que já foram provadas por conteúdo. Cabeçalho deslocado — o defeito real da aba do
 * MATHEUS — não confirma nada, é recusado, e as colunas que dependiam dele saem como
 * `ausente` em vez de saírem erradas.
 */
function acharCabecalho(
  grade: string[][],
  corpo: Set<number>,
  ancoradas: [string, Coluna][]
): { linha: number | null; ancoras: number } {
  let melhor: { linha: number | null; ancoras: number } = { linha: null, ancoras: 0 };
  for (let i = 0; i < grade.length; i++) {
    if (corpo.has(i)) continue;
    const cells = grade[i] ?? [];
    if (!cells.some((c) => txt(c) !== "")) continue;
    let acertos = 0;
    for (const [campo, col] of ancoradas) {
      if (col.indice == null) continue;
      const padrao = NOME_CABECALHO[campo];
      if (padrao && padrao.test(txt(cells[col.indice]))) acertos++;
    }
    if (acertos > melhor.ancoras) melhor = { linha: i, ancoras: acertos };
  }
  // Uma âncora só é coincidência barata; exigimos duas para o cabeçalho valer.
  return melhor.ancoras >= 2 ? melhor : { linha: null, ancoras: melhor.ancoras };
}

/** Coluna vinda do cabeçalho JÁ VALIDADO. Nunca chamada antes da validação. */
function porCabecalho(
  grade: string[][],
  linhaCab: number | null,
  padrao: RegExp,
  largura: number
): Coluna {
  if (linhaCab == null) return { indice: null, fonte: "ausente", confianca: null };
  const cells = grade[linhaCab] ?? [];
  for (let j = 0; j < largura; j++) {
    if (padrao.test(txt(cells[j]))) return { indice: j, fonte: "cabecalho", confianca: null };
  }
  return { indice: null, fonte: "ausente", confianca: null };
}

function lerAba(aba: string, grade: string[][]): { linhas: LinhaPlanilha[]; diag: DiagnosticoAba } {
  const largura = Math.max(0, ...grade.map((l) => l?.length ?? 0));
  const corpo = grade.map((_, i) => i).filter((i) => ehLinhaDeCliente(txt(grade[i]?.[0]), aba));
  const avisos: string[] = [];

  // --- 1. as três âncoras, por conteúdo ---
  const colId = porConteudo(grade, corpo, largura, (s) => PARECE_ID.test(s));
  const colSit = porConteudo(grade, corpo, largura, (s) => ROTULOS_ACEITOS.has(s.toUpperCase()));
  const colPgto = porConteudo(grade, corpo, largura, (s) => PAGAMENTOS.has(s.toUpperCase()));

  const ancoras: [string, Coluna][] = [
    ["accountId", colId],
    ["situacao", colSit],
    ["formaPagamento", colPgto],
  ];
  const NOME_HUMANO: Record<string, string> = {
    accountId: "id",
    situacao: "situação",
    formaPagamento: "forma de pagamento",
  };
  for (const [campo, col] of ancoras) {
    const nome = NOME_HUMANO[campo];
    if (col.indice == null) {
      avisos.push(`não achei coluna de ${nome} por conteúdo`);
    } else if ((col.confianca ?? 0) < CONFIANCA_MINIMA) {
      avisos.push(
        `coluna de ${nome} em ${letraColuna(col.indice)} com confiança ` +
          `${Math.round((col.confianca ?? 0) * 100)}% — abaixo de ` +
          `${Math.round(CONFIANCA_MINIMA * 100)}%, há célula com conteúdo de outra natureza`
      );
    }
  }

  // --- 2. o cabeçalho, validado contra as âncoras ---
  const { linha: linhaCab, ancoras: nAncoras } = acharCabecalho(grade, new Set(corpo), ancoras);
  if (linhaCab == null) {
    avisos.push(
      `nenhuma linha de cabeçalho confirmou as colunas achadas por conteúdo ` +
        `(${nAncoras} âncora(s), preciso de 2) — orçamentos e notificação não serão lidos desta aba`
    );
  }

  // --- 3. as colunas sem vocabulário, do cabeçalho já conferido ---
  const colOrcMeta = porCabecalho(grade, linhaCab, NOME_CABECALHO.orcamentoMeta, largura);
  const colOrcGoogle = porCabecalho(grade, linhaCab, NOME_CABECALHO.orcamentoGoogle, largura);
  const colNotif = porCabecalho(grade, linhaCab, NOME_CABECALHO.notificacaoGerencial, largura);
  const colBI = porCabecalho(grade, linhaCab, NOME_CABECALHO.preencheBI, largura);

  // Cabeçalho repetido: a aba do MATHEUS tem "ID META" em B e em F. Não decide nada aqui
  // — o conteúdo já decidiu —, mas some do relatório se ninguém contar.
  if (linhaCab != null) {
    const cab = grade[linhaCab] ?? [];
    const vistos = new Map<string, number[]>();
    for (let j = 0; j < largura; j++) {
      const nome = txt(cab[j]).toUpperCase();
      if (!nome) continue;
      if (!vistos.has(nome)) vistos.set(nome, []);
      vistos.get(nome)!.push(j);
    }
    for (const [nome, js] of vistos) {
      if (js.length > 1) {
        avisos.push(`cabeçalho "${nome}" repetido em ${js.map(letraColuna).join(" e ")}`);
      }
    }
  }

  const cel = (i: number, col: Coluna) => (col.indice == null ? "" : txt(grade[i]?.[col.indice]));

  const linhas: LinhaPlanilha[] = corpo.map((i) => {
    const idCru = cel(i, colId);
    return {
      aba,
      linha: i + 1,
      cliente: txt(grade[i]?.[0]),
      idCru,
      accountId: normalizarAccountId(idCru),
      situacao: interpretarSituacao(cel(i, colSit)),
      orcamentoMeta: cel(i, colOrcMeta),
      orcamentoGoogle: cel(i, colOrcGoogle),
      formaPagamento: cel(i, colPgto),
      notificacaoGerencial: cel(i, colNotif),
      preencheBI: cel(i, colBI),
    };
  });

  return {
    linhas,
    diag: {
      aba,
      linhasDeCliente: linhas.length,
      linhaCabecalho: linhaCab == null ? null : linhaCab + 1,
      ancoras: nAncoras,
      avisos,
      colunas: {
        accountId: colId,
        situacao: colSit,
        formaPagamento: colPgto,
        orcamentoMeta: colOrcMeta,
        orcamentoGoogle: colOrcGoogle,
        notificacaoGerencial: colNotif,
        preencheBI: colBI,
      },
    },
  };
}

/** Separa as abas que serão lidas das que não serão, com o motivo de cada exclusão. */
export function classificarAbas(
  props: { title: string; hidden?: boolean }[]
): { alvo: string[]; ignoradas: { aba: string; motivo: string }[] } {
  const alvo: string[] = [];
  const ignoradas: { aba: string; motivo: string }[] = [];
  for (const p of props) {
    // ⚠️ ABA DE GESTOR = NOME QUE ESTÁ EM `GESTORES`. Não é heurística de prefixo: é a
    // MESMA lista que já barra escrita de gestor inválido em POST /api/contas. Em
    // 10/09/2026 as 8 abas batem 8/8 com ela. Aba nova de um gestor novo fica de fora
    // até alguém entrar em `lib/gestores.ts` — que é o mesmo portão que já existe para
    // poder gravar aquele gestor. E ela aparece aqui, não some.
    if (p.hidden) {
      ignoradas.push({ aba: p.title, motivo: "aba oculta" });
    } else if ((GESTORES as readonly string[]).includes(p.title)) {
      alvo.push(p.title);
    } else {
      ignoradas.push({
        aba: p.title,
        motivo: "não é nome de gestor em lib/gestores.ts — se for gestor novo, cadastre lá primeiro",
      });
    }
  }
  return { alvo, ignoradas };
}

/** Monta a leitura a partir das grades já baixadas. Separado para poder ser exercitado offline. */
export function montarLeitura(
  titulo: string,
  grades: { aba: string; grade: string[][] }[],
  ignoradas: { aba: string; motivo: string }[],
  lidaEm: string
): LeituraPlanilha {
  const linhas: LinhaPlanilha[] = [];
  const diagnosticos: DiagnosticoAba[] = [];
  for (const g of grades) {
    const { linhas: ls, diag } = lerAba(g.aba, g.grade);
    linhas.push(...ls);
    diagnosticos.push(diag);
  }
  return { lidaEm, titulo, linhas, diagnosticos, abasIgnoradas: ignoradas };
}

/**
 * Lê a planilha inteira. SEMPRE do vivo — nunca de cópia.
 *
 * ⚠️ A planilha mudou de tamanho duas vezes em setembro: **9 das 11 abas** mudaram de
 * largura entre 02/09 e 10/09/2026. Qualquer cópia local envelheceria em dias, e o pior
 * modo de falha seria silencioso — a conciliação rodando contra uma foto velha
 * reportaria "inalterado" para linhas que mudaram.
 *
 * ⚠️ E O NÚMERO QUE SAI DAQUI CARREGA A DATA DA LEITURA DA PLANILHA, que não é a data da
 * leitura do painel. O conciliador recebe as duas e as mantém separadas.
 */
export async function lerPlanilhaGerencial(): Promise<LeituraPlanilha> {
  const id = process.env.PLANILHA_GERENCIAL_ID || "";
  if (!id) throw new Error("PLANILHA_GERENCIAL_ID ausente.");

  const token = await obterAccessToken(ESCOPO_PLANILHA_LEITURA);
  const h = { Authorization: `Bearer ${token}` };

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties`,
    { headers: h, cache: "no-store" }
  );
  if (!metaRes.ok) throw new Error(`SHEETS:${metaRes.status}:${(await metaRes.text()).slice(0, 200)}`);
  const meta = await metaRes.json();

  const props: { title: string; hidden?: boolean }[] = (meta.sheets ?? []).map(
    (s: { properties: { title: string; hidden?: boolean } }) => s.properties
  );
  const { alvo, ignoradas } = classificarAbas(props);
  if (!alvo.length) throw new Error("Nenhuma aba de gestor encontrada na planilha.");

  const q = alvo.map((t) => `ranges=${encodeURIComponent(`'${t}'!${FAIXA}`)}`).join("&");
  const valRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${q}` +
      `&valueRenderOption=UNFORMATTED_VALUE`,
    { headers: h, cache: "no-store" }
  );
  if (!valRes.ok) throw new Error(`SHEETS:${valRes.status}:${(await valRes.text()).slice(0, 200)}`);
  const dados = await valRes.json();

  const grades = (dados.valueRanges ?? []).map((faixa: { range: string; values?: unknown[][] }) => ({
    aba: String(faixa.range || "").replace(/^'?(.*?)'?!.*$/, "$1"),
    grade: (faixa.values ?? []).map((l: unknown[]) => (l ?? []).map((c) => txt(c))),
  }));

  return montarLeitura(String(meta.properties?.title ?? ""), grades, ignoradas, new Date().toISOString());
}
