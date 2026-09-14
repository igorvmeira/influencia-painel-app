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
 * UMA ENTRE VÁRIAS FORMAS DE CONFIGURAR A MESMA COISA — vale se UM grupo estiver inteiro.
 *
 * 🛑🛑 EXISTE POR CAUSA DE UM INCIDENTE (13–14/09/2026). A `lib/firebaseAdmin.ts` aceita a
 * credencial de DUAS formas: `FIREBASE_SERVICE_ACCOUNT_BASE64`, ou o trio
 * `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`. A primeira
 * versão desta conferência só conhecia "obrigatória" e "opcional", e o Firebase foi
 * declarado como "BASE64 obrigatória" — verdade no `.env.local`, onde só existe o BASE64,
 * e mentira em produção, onde só existe o trio. Os três crons passaram a devolver `503`
 * com o Firebase funcionando perfeitamente, e os dados pararam em 12/09.
 *
 * ⚠️ Nem obrigatória nem opcional descreve isto. Marcar as quatro como opcionais aceitaria
 * ambiente sem credencial NENHUMA; marcar qualquer uma como obrigatória reprova um dos dois
 * ambientes que funcionam. É um terceiro tipo, e ele precisa existir com nome próprio.
 */
export interface AlternativaEnv {
  /** Nome humano, para a mensagem: "credencial do Firebase Admin". */
  nome: string;
  /** Cada grupo é uma forma COMPLETA de configurar. Basta um grupo inteiro preenchido. */
  grupos: readonly (readonly string[])[];
}

/**
 * ⚠️ OPCIONAL: o código tem default e funciona sem ela. Existe porque tratar opcional como
 * obrigatória reprova ambiente saudável — e conferência que falha no caso NORMAL é a
 * primeira a ser desligada. `META_API_VERSION` é o caso: há `|| "v21.0"` no código.
 */
export interface Envs {
  obrigatorias: readonly EnvObrigatoria[];
  opcionais?: readonly string[];
  umaDas?: readonly AlternativaEnv[];
}

/** Junta as declarações de vários módulos, sem repetir nome. */
export function comporEnvs(...declaracoes: Envs[]): Envs {
  const obrigatorias = new Set<string>();
  const opcionais = new Set<string>();
  const umaDas = new Map<string, AlternativaEnv>();
  for (const d of declaracoes) {
    for (const e of d.obrigatorias) obrigatorias.add(e);
    for (const e of d.opcionais ?? []) opcionais.add(e);
    for (const a of d.umaDas ?? []) umaDas.set(a.nome, a);
  }
  // ⚠️ Obrigatória em UM módulo e opcional em outro vale como OBRIGATÓRIA: quem tem
  // default não quebra sem ela, mas quem não tem, quebra. O lado estrito é o que vale.
  for (const e of obrigatorias) opcionais.delete(e);
  return {
    obrigatorias: [...obrigatorias].sort(),
    opcionais: [...opcionais].sort(),
    umaDas: [...umaDas.values()],
  };
}

export interface FaltaEnv {
  faltando: string[];
  /** Texto pronto para o corpo da resposta e para o log do Actions. */
  mensagem: string;
}

/**
 * ⚠️ VAZIA CONTA COMO AUSENTE. `FILA_EMAILS_PERMITIDOS=""` na Vercel não é "configurada
 * com lista vazia": é o mesmo efeito de não existir, e o silêncio seria pior porque a env
 * APARECE no painel. Falha fechado — a mesma regra do `lib/cronAuth.ts`.
 */
const preenchida = (nome: string): boolean => !!(process.env[nome] ?? "").trim();

/** Devolve TUDO o que falta de uma vez, ou `null` quando está tudo lá. */
export function conferirEnvs(envs: Envs): FaltaEnv | null {
  const faltando: string[] = envs.obrigatorias.filter((nome) => !preenchida(nome));
  for (const alt of envs.umaDas ?? []) {
    if (!alt.grupos.some((grupo) => grupo.every(preenchida))) {
      faltando.push(`${alt.nome} (uma destas formas: ${alt.grupos.map((g) => g.join(" + ")).join("  OU  ")})`);
    }
  }
  if (!faltando.length) return null;
  return {
    faltando,
    mensagem:
      `Faltam ${faltando.length} configuração(ões) de ambiente: ${faltando.join("; ")}. ` +
      `Adicione na Vercel e faça REDEPLOY — env nova só vale em build novo.`,
  };
}
