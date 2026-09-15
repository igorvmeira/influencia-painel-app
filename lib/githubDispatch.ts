/**
 * Dispara um workflow do GitHub Actions por `workflow_dispatch` — o elo entre o cron da
 * Vercel (que dispara NO HORÁRIO) e o workflow (que CONFERE o retorno do sync).
 *
 * POR QUE ASSIM, E NÃO O CRON DA VERCEL CHAMANDO O SYNC DIRETO (decisão de 15/09/2026):
 *   · o agendamento do GitHub atrasa. Medido em 65 execuções do `sync-meta`: de 0h29 a
 *     11h46 depois das 09:00 UTC, e desde 27/08 nenhuma antes de 09:29 em Brasília. Toda
 *     manhã a tela mostrava anteontem até o sync rodar;
 *   · o cron da Vercel é pontual no Pro (precisão de minuto), mas descarta a resposta — e o
 *     workflow faz asserção sobre o corpo (`ok`, identidade conjunto × conta, `.erros`).
 *     Chamar o sync direto perderia a conferência, e o loop por blocos mora no workflow.
 * A Vercel só dispara; a execução continua sendo o mesmo workflow, com as mesmas
 * asserções, e falha continua vermelha no GitHub.
 *
 * ⚠️ NÃO MEDIDO quando isto foi escrito: quanto o GitHub demora para COMEÇAR uma execução
 * disparada assim. Se também atrasar, esta solução não resolve — ver README, pendência de
 * 15/09/2026.
 */
export const ENVS_GITHUB_DISPATCH = { obrigatorias: ["GITHUB_DISPATCH_TOKEN"] } as const;

/** O repositório deste painel (o projeto da Vercel está ligado a ele). Não é segredo. */
const REPO = "igorvmeira/influencia-painel-app";

/**
 * Lista FECHADA do que o cron pode disparar: nome na URL → arquivo do workflow.
 * ⚠️ Só o `sync-meta` por enquanto. `sync-comercial` e `sync-planilha` seguem no agendamento
 * próprio do GitHub até decidir se entram (e se ficam independentes — ver README).
 */
export const WORKFLOWS_DISPARAVEIS: Record<string, string> = {
  "sync-meta": "sync-meta.yml",
};

const TETO_MS = 15000;

export interface ResultadoDisparo {
  ok: boolean;
  http: number | null;
  erro: string | null;
}

/** O que cada recusa do GitHub quer dizer — para o registro dizer a AÇÃO, não só o número. */
function motivoHttp(status: number): string {
  if (status === 401) return "token inválido ou expirado — gerar outro e atualizar GITHUB_DISPATCH_TOKEN na Vercel";
  if (status === 403) return "o token não tem permissão para disparar Actions neste repositório";
  if (status === 404) return "workflow ou repositório não encontrado para este token (o token alcança este repositório?)";
  if (status === 422) return "o GitHub recusou o disparo (o workflow aceita workflow_dispatch com esse input?)";
  return "resposta inesperada do GitHub";
}

export async function dispararWorkflow(arquivo: string, origem: string): Promise<ResultadoDisparo> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return { ok: false, http: null, erro: "GITHUB_DISPATCH_TOKEN ausente" };

  // ⚠️ Teto: `fetch` não tem timeout, e disparo pendurado seria disparo que não aconteceu
  // sem ninguém saber. POST aqui é seguro de abortar: disparo duplicado de um sync
  // idempotente, no pior caso, vira uma execução a mais — e a concorrência do workflow
  // não deixa as duas se sobreporem.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TETO_MS);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${arquivo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "influencia-painel-app",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { origem } }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.ok) return { ok: true, http: res.status, erro: null };
    // O corpo de erro do GitHub traz a mensagem dele, nunca o token enviado.
    const corpo = (await res.text()).slice(0, 300);
    return { ok: false, http: res.status, erro: `${motivoHttp(res.status)} (GitHub: ${corpo})` };
  } catch (e) {
    const abortou = e instanceof Error && e.name === "AbortError";
    return { ok: false, http: null, erro: abortou ? `o GitHub não respondeu em ${TETO_MS / 1000}s` : `falha de rede: ${String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}
