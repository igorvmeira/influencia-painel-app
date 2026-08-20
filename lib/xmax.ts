// Domínio do Xmax (CRM do comercial). Constantes e helpers que sobrevivem ao
// endpoint de diagnóstico — a rota /api/diag-xmax é temporária, isto aqui não é.
//
// Instância: https://influencia40.atenderbem.com (white-label do AtenderBem).
// Spec completa versionada em data/xmax-api.yaml; levantamento em
// data/xmax-integracao.md.

// ===========================================================================
// VALORES SÃO INTEIROS × 100
// ===========================================================================
// `value`, `recurrentvalue`, `closevalue` e `closerecurrentvalue` vêm como inteiro
// multiplicado por 100: 10050 é R$ 100,50. Converter é obrigatório e o erro é
// silencioso — um MRR 100 vezes maior na tela do dono, sem nada indicando.
// Use SEMPRE esta função; nunca divida por 100 solto pelo código.
export function centavosParaReais(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n / 100 : 0;
}

// ===========================================================================
// ORIGENS — o mapa que a API NÃO devolve
// ===========================================================================
// Não existe `getOrigins` em lugar nenhum da spec: `origin` é um ID solto no
// OpportunityObject. Este mapa veio da agência em texto (15/08/2026).
// Se a agência criar uma origem nova, ela aparece como ID desconhecido nos
// relatórios — o diagnóstico reporta os IDs que não estão aqui, em vez de somir
// com eles num balde "outros".
export const ORIGENS: Record<number, string> = {
  1: "GOOGLE",
  2: "Tráfego Pago - FaceAds",
  3: "INOVA SUMMIT",
  4: "REMARKETING - WHATSAPP",
  5: "Leads ABRINT",
  6: "TYPEBOT",
};

export const nomeOrigem = (id: unknown): string => {
  const n = Number(id);
  return ORIGENS[n] ?? (Number.isFinite(n) && n > 0 ? `origem ${n} (desconhecida)` : "Sem origem");
};

// ===========================================================================
// CATEGORIA DA ORIGEM — configurável, e deliberadamente INCOMPLETO
// ===========================================================================
// A dor do Marcos é "anúncio converte melhor que prospecção de lista, mas quanto?".
// PROBLEMA: nenhuma das 6 origens se chama "prospecção de lista". Metade da pergunta
// não tem onde ser lida.
//
// HIPÓTESE a confirmar COM ELE (não classificar por conta própria): "Leads ABRINT"
// (a ABRINT é a associação de provedores — cheira a lista de associados) e
// "INOVA SUMMIT" (evento) podem ser a prospecção registrada com outro nome.
//
// Enquanto ele não responde, as duas ficam em `a_confirmar`. Isso é melhor do que
// chutar: uma origem no balde errado inverte a conclusão do estudo que motivou a
// tela inteira. Trocar depois é editar uma linha aqui.
export type CategoriaOrigem = "anuncio" | "lista" | "inbound" | "a_confirmar";

export const CATEGORIA_POR_ORIGEM: Record<number, CategoriaOrigem> = {
  1: "anuncio",      // GOOGLE — anúncio pago, sem dúvida
  2: "anuncio",      // Tráfego Pago - FaceAds — idem
  3: "a_confirmar",  // INOVA SUMMIT — evento; lista de participantes?
  4: "inbound",      // REMARKETING - WHATSAPP — reengajamento de quem já era base
  5: "a_confirmar",  // Leads ABRINT — principal suspeita de ser a "prospecção de lista"
  6: "inbound",      // TYPEBOT — bot no site, o lead procurou a agência
};

export const categoriaOrigem = (id: unknown): CategoriaOrigem =>
  CATEGORIA_POR_ORIGEM[Number(id)] ?? "a_confirmar";

/**
 * ⚠️ ORIGEM 0 É AUSÊNCIA DE ORIGEM, NÃO UMA ORIGEM CHAMADA "0".
 *
 * São 1.672 de 5.084 (33%) — medido em 15/08/2026. As evidências de que é
 * ausência, e não cadastro que a agência esqueceu de informar:
 *   · ZERO oportunidades com `origin` null/undefined — a API normaliza a ausência
 *     para 0, então 0 é o "vazio" dela;
 *   · funis INTEIROS em 0: "Black Friday" 1.010 de 1.010, "Financeiro" 65 de 65,
 *     "Indicações parceiros" 11 de 11 — carga em massa, ninguém escolheu origem;
 *   · cai com o tempo: 37% em 2024, 54% em 2025, **17% em 2026** — sinal de que
 *     passaram a preencher, não de uma categoria estável.
 *
 * ⚠️ A TELA MOSTRA "SEM ORIGEM", NUNCA DISTRIBUI ENTRE AS OUTRAS. Um terço da base
 * rateado proporcionalmente inventaria volume em todas as origens e destruiria
 * justamente a comparação que motiva a tela.
 */
export const SEM_ORIGEM = 0;
export const semOrigem = (id: unknown): boolean => Number(id ?? 0) === SEM_ORIGEM;

// ===========================================================================
// ⚠️⚠️ DATAS: `closedat` E `stagebegintime` SÃO EPOCH, NÃO ISO 8601 ⚠️⚠️
// ===========================================================================
// A SPEC MENTE. Ela documenta `closedat` como "Data de fechamento da oportunidade
// no formato ISO 8601" — e o que vem é timestamp Unix em SEGUNDOS.
//
// Medido na instância em 15/08/2026, oportunidade id 1:
//     createdAt      "2024-02-15T12:23:01.000Z"   ISO de verdade
//     closedat       1709506814                    epoch → 2024-03-03T23:00:14Z
//     stagebegintime 1709506797                    epoch
//
// `new Date(closedat)` devolve **Invalid Date**, e Invalid Date não estoura: vira
// "NaN" na tela ou some num filtro de período, silenciosamente. Um fechamento
// perdido é um fechamento a menos no número do dono.
//
// REGRA: NENHUM lugar do código chama `new Date()` nesses dois campos direto.
// Passa por aqui. `createdAt` é o único que é ISO — e é justamente a mistura
// dos dois formatos no mesmo objeto que torna o erro fácil de cometer.
export function epochParaISO(v: unknown): string | null {
  const n = Number(v);
  // 0 é "nunca fechou", não 1970 — e é o valor que vem em oportunidade aberta.
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Data de fechamento pronta para uso. null = ainda não fechou. */
export const fechadaEm = (o: { closedat?: unknown }): string | null => epochParaISO(o?.closedat);

/** Desde quando está na etapa ATUAL (não é o histórico — esse não existe na API). */
export const naEtapaDesde = (o: { stagebegintime?: unknown }): string | null =>
  epochParaISO(o?.stagebegintime);

/** `createdAt` é o ÚNICO ISO de verdade — separado para não virar cópia do de cima. */
export function criadaEm(o: { createdAt?: unknown }): string | null {
  const s = String(o?.createdAt ?? "");
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ===========================================================================
// STATUS da oportunidade
// ===========================================================================
export const STATUS_OPORTUNIDADE: Record<number, string> = {
  0: "aberta",
  1: "ganha",
  2: "perdida",
};
export const nomeStatus = (v: unknown): string =>
  STATUS_OPORTUNIDADE[Number(v)] ?? `status ${v} (desconhecido)`;

// ===========================================================================
// Config de ambiente — FALHA FECHADO, no padrão do lib/cronAuth.ts
// ===========================================================================
// Nenhuma destas é NEXT_PUBLIC_: as chaves dão acesso de ESCRITA ao CRM inteiro
// (removeOpportunity está na API). Faltando qualquer uma, nada roda.
export interface ConfigXmax {
  baseUrl: string;
  chaveGlobal: string;
  queueId: number;
  /** Funil do comercial — ver PIPELINE_COMERCIAL abaixo. */
  pipelineId: number;
}

/**
 * ⚠️ `XMAX_API_KEY_FILA` EXISTE NO .env MAS NÃO É USADA — de propósito.
 *
 * A spec diz que endpoint de fila aceita a chave DA FILA **ou a GLOBAL**. Medido
 * em 15/08/2026: a chave da fila fornecida é rejeitada com `AUTH_018`, e a global
 * passa no mesmo `queueId=7`. Isolamos a causa — o `queueId` está certo (é a fila
 * "Influência Marketing", ativa), o valor da chave é que está errado.
 *
 * E há um motivo melhor do que "a outra não funciona": **os dados do CRM são
 * GLOBAIS À INSTÂNCIA, não por fila.** Medido: o funil 1 devolve as mesmas 52
 * oportunidades com queueId 7, 17 ou 19. O `queueId` autentica, não recorta. Ou
 * seja, usar a chave da fila não reduziria exposição nenhuma — só adiaria o
 * projeto por um princípio que, aqui, não compra segurança.
 *
 * A env fica documentada para quando a agência corrigir o valor; trocar é mudar
 * `chaveGlobal` por `chaveFila` na função `chamarXmax`.
 */
export function lerConfigXmax(): { config: ConfigXmax } | { faltando: string[] } {
  const baseUrl = (process.env.XMAX_BASE_URL || "").trim().replace(/\/+$/, "");
  const chaveGlobal = (process.env.XMAX_API_KEY_GLOBAL || "").trim();
  const queueId = Number(process.env.XMAX_QUEUE_ID);

  const faltando: string[] = [];
  if (!baseUrl) faltando.push("XMAX_BASE_URL");
  if (!chaveGlobal) faltando.push("XMAX_API_KEY_GLOBAL");
  if (!Number.isFinite(queueId) || queueId <= 0) faltando.push("XMAX_QUEUE_ID");
  // XMAX_API_KEY_FILA NÃO entra aqui: exigir uma env que o código não usa faria a
  // rota falhar por um valor que não muda nada.

  if (faltando.length) return { faltando };
  return { config: { baseUrl, chaveGlobal, queueId, pipelineId: PIPELINE_COMERCIAL } };
}

/**
 * O FUNIL DO COMERCIAL — id 4, "Provedor de internet".
 *
 * ⚠️ NÃO é o funil 1, que se chama "COMERCIAL" e tem só 52 oportunidades. O funil
 * do comercial de verdade é o 4, com 1.655 abertas — o número que a agência citou.
 * O nome enganaria qualquer um; foi o diagnóstico que decidiu.
 *
 * ⚠️ OS OUTROS 18 FUNIS FICAM FORA DO ESCOPO. A instância tem 5.084 oportunidades
 * abertas no total, mas a maioria está em pipelines de DISPARO e AUTOMAÇÃO
 * ("Black Friday" 1.010, "AUTOMAÇÃO - NUTRIÇÃO" 904, "NUTRIÇÃO E RECUPERAÇÃO"
 * 415...), que não são funil de venda. Somar tudo infla o funil em ~3× e faria o
 * painel responder uma pergunta que ninguém fez.
 *
 * ⚠️ CONSTANTE, NÃO ENV — decisão do Igor em 15/08/2026. O funil do comercial não
 * muda de um dia para o outro, env exigiria Redeploy para alterar, e um override
 * por env deixaria o comportamento mudar sem o código mostrar. Aqui está visível
 * e auditável. Mudou de funil? Muda esta linha, com o diff registrando o porquê.
 */
export const PIPELINE_COMERCIAL = 4;

// ===========================================================================
// Chamada à API
// ===========================================================================
// Todos os endpoints são POST em /int/<operationId>, com o corpo em JSON e a chave
// DENTRO do corpo (não em cabeçalho). Dois grupos de autenticação:
//   - GLOBAL: só `apiKey` (a chave da fila é rejeitada com AUTH_018)
//   - FILA:   `apiKey` da fila + `queueId` OBRIGATÓRIO
export type EscopoXmax = "global" | "fila";

export interface RespostaXmax<T> {
  ok: boolean;
  status: number;
  dados: T | null;
  erro: string | null;
}

export async function chamarXmax<T = unknown>(
  cfg: ConfigXmax,
  operacao: string,
  escopo: EscopoXmax,
  corpo: Record<string, unknown> = {},
  timeoutMs = 20000
): Promise<RespostaXmax<T>> {
  // A chave é a MESMA nos dois escopos (ver lerConfigXmax); o que muda é o
  // `queueId`, que os endpoints de fila exigem MESMO usando a chave global.
  const auth = escopo === "global"
    ? { apiKey: cfg.chaveGlobal }
    : { apiKey: cfg.chaveGlobal, queueId: cfg.queueId };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${cfg.baseUrl}/int/${operacao}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...auth, ...corpo }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }

    if (!r.ok) {
      const msg = (json as { message?: string; error?: string } | null);
      return {
        ok: false, status: r.status, dados: null,
        // O corpo do erro pode trazer o código (AUTH_018, QUEUE_008...) — é o que
        // diz se o problema é chave errada, fila desabilitada ou dado inválido.
        erro: String(msg?.message ?? msg?.error ?? texto ?? "").slice(0, 300) || `HTTP ${r.status}`,
      };
    }
    return { ok: true, status: r.status, dados: json as T, erro: null };
  } catch (e) {
    const abortou = (e as Error)?.name === "AbortError";
    return {
      ok: false, status: 0, dados: null,
      erro: abortou ? `timeout de ${timeoutMs}ms` : String(e).slice(0, 300),
    };
  } finally {
    clearTimeout(t);
  }
}

// Forma mínima do que o diagnóstico lê. NÃO é o modelo final das coleções —
// o modelo só se decide depois de ver o retorno real.
export interface OportunidadeXmax {
  id: number;
  title?: string;
  /** Telefone principal. Vem em formatos diferentes: "87992438017" e "+5551974001969". */
  mainphone?: string;
  mainmail?: string;
  value?: number;
  recurrentvalue?: number;
  closevalue?: number;
  closerecurrentvalue?: number;
  origin?: number;
  status?: number;
  fkPipeline?: number;
  fkStage?: number;
  /** ⚠️ EPOCH em segundos, apesar do nome. Use `naEtapaDesde()`. */
  stagebegintime?: number;
  /** ISO 8601 de verdade — o único dos três. */
  createdAt?: string;
  /** ⚠️ EPOCH em segundos, NÃO a string ISO que a spec promete. Use `fechadaEm()`. */
  closedat?: number;
  tags?: number[];
  responsableid?: number;
  /**
   * ID da campanha de disparo que ORIGINOU a oportunidade. `0` = sem vínculo
   * (a spec documenta o zero como ausência, ao contrário de `origin`).
   *
   * ⚠️ Único campo snake_case da resposta — o resto é camelCase. Não é engano de
   * digitação; é assim que a API devolve, medido em 12 oportunidades reais.
   */
  fk_campaign?: number;
  formsdata?: Record<string, unknown>;
}
