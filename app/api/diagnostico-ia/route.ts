// TODO REMOVER — rota TEMPORÁRIA de diagnóstico (somente leitura do Firestore).
// Objetivo: inspecionar o que já está sincronizado para confirmar quais dados o
// assistente de IA poderá usar. Não escreve nem apaga nada. Remover após o uso.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Chaves cujo VALOR é mascarado no documento de exemplo (PII / segredos).
const SENSIVEL = /email|phone|telefone|celular|cpf|cnpj|token|secret|senha|password|passwd|api[_-]?key|access/i;

// Detecta se um valor é um Firestore Timestamp (tem toDate()).
function ehTimestamp(v: unknown): v is { toDate: () => Date } {
  return !!v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function";
}

function pareceDataString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s);
}

// Rótulo de tipo legível para cada valor.
function tipoDe(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (ehTimestamp(v)) return "timestamp";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") return pareceDataString(v) ? "date-string" : "string";
  if (typeof v === "object") return "object";
  return typeof v;
}

// Converte um valor para algo serializável em JSON (Timestamp -> ISO) e mascara PII.
function valorSeguro(chave: string, v: unknown): unknown {
  if (SENSIVEL.test(chave)) return "***";
  if (ehTimestamp(v)) return v.toDate().toISOString();
  return v;
}

function isoDe(v: unknown): string | null {
  if (ehTimestamp(v)) return v.toDate().toISOString();
  if (typeof v === "string" || typeof v === "number") {
    const t = Date.parse(String(v));
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

export async function GET(req: Request) {
  // Mesma proteção do endpoint de sync (reusa CRON_SECRET; não cria env nova).
  const url = new URL(req.url);
  const chaveUrl = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const segredo = process.env.CRON_SECRET;
  const autorizado = !segredo || auth === `Bearer ${segredo}` || chaveUrl === segredo;
  if (!autorizado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  // Descobre as coleções dinamicamente (não fixa nomes).
  const cols = await db.listCollections();

  const colecoes = await Promise.all(
    cols.map(async (col) => {
      const nome = col.id;

      // Contagem aproximada via agregação (não carrega os docs na memória).
      let contagem: number | null = null;
      try {
        const agg = await col.count().get();
        contagem = agg.data().count;
      } catch {
        try {
          const s = await col.get();
          contagem = s.size;
        } catch {
          contagem = null;
        }
      }

      // Documento de exemplo (1 doc).
      const snap = await col.limit(1).get();
      const doc = snap.docs[0];
      const dados = doc?.data() ?? null;

      const campos = dados
        ? Object.entries(dados).map(([campo, v]) => ({ campo, tipo: tipoDe(v) }))
        : [];

      const exemplo = dados
        ? Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, valorSeguro(k, v)]))
        : null;

      // Faixa de datas, se houver um campo de data (timestamp ou string YYYY-MM-DD).
      let faixaDatas: null | {
        campo: string;
        maisAntiga: string | null;
        maisRecente: string | null;
        diasDeHistorico: number | null;
      } = null;

      if (dados) {
        const campoData = Object.keys(dados).find((k) => {
          const t = tipoDe(dados[k]);
          return t === "timestamp" || t === "date-string";
        });
        if (campoData) {
          try {
            const [asc, desc] = await Promise.all([
              col.orderBy(campoData, "asc").limit(1).get(),
              col.orderBy(campoData, "desc").limit(1).get(),
            ]);
            const minIso = isoDe(asc.docs[0]?.get(campoData));
            const maxIso = isoDe(desc.docs[0]?.get(campoData));
            const dias =
              minIso && maxIso
                ? Math.round((Date.parse(maxIso) - Date.parse(minIso)) / 86400000) + 1
                : null;
            faixaDatas = { campo: campoData, maisAntiga: minIso, maisRecente: maxIso, diasDeHistorico: dias };
          } catch {
            faixaDatas = { campo: campoData, maisAntiga: null, maisRecente: null, diasDeHistorico: null };
          }
        }
      }

      return { colecao: nome, contagem, campos, exemplo, faixaDatas };
    })
  );

  return NextResponse.json({
    ok: true,
    apenasLeitura: true,
    totalColecoes: colecoes.length,
    colecoes,
    geradoEm: new Date().toISOString(),
  });
}
