import { NextResponse } from "next/server";
import { getDb, ENVS_FIREBASE_ADMIN } from "@/lib/firebaseAdmin";
import { COL_SISTEMA, DOC_DISPARO_WORKFLOWS } from "@/lib/colecoes";
import { checarCronSecret, ENVS_CRON } from "@/lib/cronAuth";
import { dispararWorkflow, ENVS_GITHUB_DISPATCH, WORKFLOWS_DISPARAVEIS } from "@/lib/githubDispatch";
import { comporEnvs, conferirEnvs } from "@/lib/envs";

/**
 * Chamada pelo CRON DA VERCEL (vercel.json), que só DISPARA o workflow no GitHub — ver o
 * porquê em `lib/githubDispatch.ts`. A execução do sync, e a conferência do retorno dele,
 * continuam no workflow.
 *
 * ⚠️ O cron da Vercel descarta esta resposta. Por isso o resultado vai também para
 * `sistema/disparoWorkflows`: é o único lugar onde "o disparo das 06:00 saiu?" fica
 * registrado por mais que os poucos dias de log da Vercel.
 */
const ENVS = comporEnvs(ENVS_CRON, ENVS_FIREBASE_ADMIN, ENVS_GITHUB_DISPATCH);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: { workflow: string } }) {
  // O cron da Vercel manda `Authorization: Bearer <CRON_SECRET>` sozinho quando a env existe.
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const falta = conferirEnvs(ENVS);
  if (falta) return NextResponse.json({ ok: false, erro: falta.mensagem, faltando: falta.faltando }, { status: 503 });

  const nome = params.workflow;
  const arquivo = WORKFLOWS_DISPARAVEIS[nome];
  if (!arquivo) {
    return NextResponse.json({ ok: false, erro: `workflow "${nome}" não está na lista de disparáveis` }, { status: 404 });
  }

  const disparadoEm = new Date().toISOString();
  const r = await dispararWorkflow(arquivo, "vercel-cron");
  if (!r.ok) console.error(`[cron/dispara] ${nome}: ${r.erro}`);

  // O registro não pode esconder o resultado do disparo: se gravar falhar, a resposta sai igual.
  let registrado = false;
  try {
    const db = getDb();
    if (db) {
      await db.collection(COL_SISTEMA).doc(DOC_DISPARO_WORKFLOWS).set(
        { [nome]: { disparadoEm, ok: r.ok, http: r.http, erro: r.erro } },
        { merge: true }
      );
      registrado = true;
    }
  } catch (e) {
    console.error(`[cron/dispara] ${nome}: falha ao gravar o registro do disparo`, e);
  }

  return NextResponse.json(
    { ok: r.ok, workflow: nome, disparadoEm, http: r.http, erro: r.erro, registrado },
    { status: r.ok ? 200 : 502 }
  );
}
