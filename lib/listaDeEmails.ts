// ===========================================================================
// LISTAS DE E-MAIL EM ENV — a leitura, num lugar só
// ===========================================================================
//
// ⚠️ ATÉ 15/09/2026 A MESMA LEITURA ESTAVA COPIADA EM QUATRO ROTAS: três liam
// `FILA_EMAILS_PERMITIDOS` (/api/sync-planilha, /api/fila-contas, /api/fechamento) e uma lia
// `IA_EMAILS_PERMITIDOS` (/api/ia). Mudar a forma de ler numa só — aceitar ";" como separador,
// por exemplo — deixaria uma porta aceitando quem a outra recusa, sem erro nenhum.
//
// 🔑 O QUE É COMPARTILHADO E O QUE NÃO É. A FORMA de ler (separar por vírgula, tirar espaço, passar
// para minúsculas, descartar vazio) é uma regra só, e mora aqui. A LISTA de quem administra a
// carteira é uma decisão, lida aqui para as três rotas da carteira. A lista da IA é OUTRA decisão
// com o mesmo formato: usa a mesma leitura e continua com a env dela — valor igual, conceito
// diferente (categoria 3 da régua das duplicatas, no CLAUDE.md).
//
// ⚠️ LOGIN COMPARTILHADO (CLAUDE.md, *Login*): enquanto o painel tiver uma conta de login só, estas
// listas separam quem tem a senha de quem não tem — não uma pessoa de outra.

/** Lê uma env de e-mails separados por vírgula. Vazia ou ausente = lista vazia = ninguém passa. */
export function lerListaDeEmails(valor: string | undefined): string[] {
  return (valor || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Envs deste módulo. OPCIONAL de propósito: vazia, as portas humanas da carteira falham fechado
 * (ninguém entra), e o cron do /api/sync-planilha — que entra por CRON_SECRET — segue funcionando.
 * Quem disser "perdi o acesso à /conciliacao, à /fila-contas ou ao fechamento" começa por ela.
 */
export const ENVS_ADMIN_CARTEIRA = { obrigatorias: [], opcionais: ["FILA_EMAILS_PERMITIDOS"] } as const;

/** Quem administra a carteira: /conciliacao, /fila-contas e o fechamento de mês. */
export function emailsAdminCarteira(): string[] {
  return lerListaDeEmails(process.env.FILA_EMAILS_PERMITIDOS);
}
