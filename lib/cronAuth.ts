import { NextResponse } from "next/server";

// Autenticação das rotas internas (sync/cargas/diagnóstico) por CRON_SECRET.
// FALHA FECHADO: se a env não existir/estiver vazia, NÃO autoriza — responde 500 e
// a rota não executa nada (antes, sem a env, a rota ficava aberta a qualquer um).
// Aceita a key via header `Authorization: Bearer <segredo>` ou querystring `?key=`.
//
// Uso na rota:
//   const bloqueio = checarCronSecret(req);
//   if (bloqueio) return bloqueio;   // 500 (env ausente) ou 401 (key errada)
export function checarCronSecret(req: Request): NextResponse | null {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    // Config incorreta do ambiente, não erro do chamador → 500, sem executar nada.
    return NextResponse.json(
      { erro: "CRON_SECRET não configurada no servidor" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const chaveUrl = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const autorizado = auth === `Bearer ${segredo}` || chaveUrl === segredo;
  if (!autorizado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  return null; // autorizado
}
