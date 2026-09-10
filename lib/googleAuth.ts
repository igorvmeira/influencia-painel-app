/**
 * TOKEN DE CONTA DE SERVIÇO DO GOOGLE — casa única do JWT, sem import além do `crypto`.
 *
 * ⚠️ ESTE ARQUIVO NASCEU DE UMA DUPLICAÇÃO QUE IA ACONTECER. A assinatura RS256 já
 * existia inteira em `lib/googleAgenda.ts` com o escopo da Agenda chumbado numa
 * constante de módulo. Ao acrescentar a leitura da planilha, o caminho fácil era
 * copiar as ~25 linhas e trocar uma string — e aí passariam a existir duas cópias do
 * mesmo `b64url`, do mesmo `\n` escapado, do mesmo tratamento de erro do token.
 * Nenhuma busca ligaria as duas: os nomes seriam locais dos dois lados. É exatamente
 * o caso final da régua das cinco categorias no CLAUDE.md — *constante privada com
 * nome local é o disfarce mais completo de duplicação que este projeto tem*.
 *
 * 🔑 O ESCOPO VIRA PARÂMETRO, e isso é mais que arrumação: **o escopo é a garantia
 * de que nada é escrito.** `spreadsheets.readonly` faz o Google recusar qualquer
 * escrita, independentemente do que o nosso código tente. Uma promessa de "esta rota
 * só lê" vale o que vale a disciplina de quem edita depois; um token que não tem
 * permissão de escrever não depende de disciplina nenhuma.
 *
 * ⚠️ ZERO IMPORT DE MÓDULO NOSSO, pelo mesmo motivo do `lib/colecoes.ts`: quem só
 * precisa de um token não pode herdar cadeia de dependência. `lib/googleAgenda.ts`
 * importa `./types`; se o token morasse lá, a leitura da planilha arrastaria os tipos
 * do painel inteiro junto.
 */
import crypto from "crypto";

/** Agenda: leitura de eventos. Consumido por `lib/googleAgenda.ts`. */
export const ESCOPO_AGENDA = "https://www.googleapis.com/auth/calendar.readonly";

/**
 * Planilha: leitura e SÓ leitura.
 *
 * ⚠️ NÃO TROQUE POR `spreadsheets` (sem o `.readonly`) "para facilitar depois". A
 * planilha de Monitoramento é editada por 8 pessoas o dia inteiro e é a fonte da
 * verdade delas. Este escopo é o que torna impossível — não improvável — que um bug
 * nosso escreva numa célula que alguém está usando.
 */
export const ESCOPO_PLANILHA_LEITURA = "https://www.googleapis.com/auth/spreadsheets.readonly";

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Assina o JWT da conta de serviço e troca por um access_token do escopo pedido.
 *
 * ⚠️ A chave privada vem da env com `\n` ESCAPADO — é o erro mais comum destas
 * integrações e está no CLAUDE.md. O `.replace` abaixo é obrigatório, não defensivo.
 */
export async function obterAccessToken(escopo: string): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("Credenciais Google ausentes (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY).");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email, scope: escopo, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const assinatura = b64url(crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey));
  const jwt = `${unsigned}.${assinatura}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.access_token) {
    throw new Error(`TOKEN:${res.status}:${JSON.stringify(j?.error_description ?? j?.error ?? j)}`);
  }
  return j.access_token as string;
}
