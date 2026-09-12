/**
 * CONFERÊNCIA DE VARIÁVEIS DE AMBIENTE — todas de uma vez, sem import nenhum.
 *
 * ⚠️⚠️ POR QUE TODAS DE UMA VEZ, E NÃO A PRIMEIRA QUE FALTAR. Caso real (12/09/2026):
 * o `/api/sync-planilha` subiu sem `PLANILHA_GERENCIAL_ID`, quebrou na primeira env
 * ausente, e **a falha só apareceu no dia seguinte, quando o cron rodou** — dois `502`
 * às 13:05, com 21s de intervalo (o retry do workflow). Se houvesse uma segunda env
 * faltando, seriam mais 24 horas para descobrir a próxima. Uma rota que para na
 * primeira ausência transforma uma configuração incompleta numa FILA de descobertas,
 * uma por dia.
 *
 * ⚠️ ZERO IMPORT, pelo mesmo motivo do `lib/colecoes.ts`: isto é chamado na primeira
 * linha de rotas que ainda não inicializaram nada. Se a checagem de env arrastasse o
 * SDK do Firebase junto, ela falharia por falta da env que veio conferir.
 *
 * ⚠️ E A DECLARAÇÃO MORA NO MÓDULO QUE LÊ, nunca numa lista central. Cada módulo que
 * toca `process.env` exporta o seu `ENVS_*`, e a rota COMPÕE. Uma lista mantida à mão
 * na rota envelheceria em silêncio: no dia em que `lib/descobrirContas` precisasse de
 * uma env nova, a lista da rota continuaria passando e a rota quebraria em produção
 * dizendo que estava tudo certo. É a régua da lista de nomes que vira a segunda cópia.
 *
 * 🔧 E a conferência da conferência é `node scripts/audita-envs.js`: ele percorre o
 * grafo de imports, compara o que cada módulo DECLARA com o que ele realmente LÊ, e
 * reprova se divergirem. Sem ele, as declarações são promessa.
 */

/** Env obrigatória: sem ela a rota não tem como funcionar. */
export type EnvObrigatoria = string;

/**
 * Env OPCIONAL: o código tem default e funciona sem ela.
 *
 * ⚠️ Existe porque tratar opcional como obrigatória reprova ambiente saudável — e
 * conferência que falha no caso NORMAL é a primeira a ser desligada. `META_API_VERSION`
 * é o caso: `lib/meta.ts` e `lib/descobrirContas.ts` fazem `|| "v21.0"`, então ela
 * ausente é o estado esperado, não defeito.
 */
export interface Envs {
  obrigatorias: readonly EnvObrigatoria[];
  opcionais?: readonly string[];
}

/** Junta as declarações de vários módulos, sem repetir nome. */
export function comporEnvs(...grupos: Envs[]): Envs {
  const obrigatorias = new Set<string>();
  const opcionais = new Set<string>();
  for (const g of grupos) {
    for (const e of g.obrigatorias) obrigatorias.add(e);
    for (const e of g.opcionais ?? []) opcionais.add(e);
  }
  // ⚠️ Obrigatória em UM módulo e opcional em outro vale como OBRIGATÓRIA: quem tem
  // default não quebra sem ela, mas quem não tem, quebra. O lado estrito é o que vale.
  for (const e of obrigatorias) opcionais.delete(e);
  return { obrigatorias: [...obrigatorias].sort(), opcionais: [...opcionais].sort() };
}

export interface FaltaEnv {
  faltando: string[];
  /** Texto pronto para o corpo da resposta e para o log do Actions. */
  mensagem: string;
}

/**
 * Devolve TODAS as obrigatórias ausentes, ou `null` quando está tudo lá.
 *
 * ⚠️ VAZIA CONTA COMO AUSENTE. `FILA_EMAILS_PERMITIDOS=""` na Vercel não é "configurada
 * com lista vazia": é o mesmo efeito de não existir, e o silêncio seria pior porque a
 * env APARECE no painel. Falha fechado — a mesma regra do `lib/cronAuth.ts`.
 */
export function conferirEnvs(envs: Envs): FaltaEnv | null {
  const faltando = envs.obrigatorias.filter((nome) => !(process.env[nome] ?? "").trim());
  if (!faltando.length) return null;
  return {
    faltando,
    mensagem:
      `Faltam ${faltando.length} variável(is) de ambiente: ${faltando.join(", ")}. ` +
      `Adicione na Vercel e faça REDEPLOY — env nova só vale em build novo.`,
  };
}
