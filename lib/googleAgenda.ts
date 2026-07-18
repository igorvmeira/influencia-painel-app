import crypto from "crypto";
import { Reuniao } from "./types";

// Leitura do Google Agenda pela conta de serviço (JWT RS256 via crypto nativo —
// sem dependência nova). Somente leitura.

const ESCOPO = "https://www.googleapis.com/auth/calendar.readonly";

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Assina o JWT da conta de serviço e troca por um access_token de leitura.
async function obterAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  // A private key vem com "\n" escapado na env → converte para quebra real.
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Credenciais Google ausentes (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY).");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email, scope: ESCOPO, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
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
  if (!res.ok || !j?.access_token) throw new Error(`TOKEN:${res.status}:${JSON.stringify(j?.error_description ?? j?.error ?? j)}`);
  return j.access_token as string;
}

// hangoutLink primeiro; senão o entry point de vídeo do conferenceData (mesmo Meet).
function linkDoMeet(ev: Record<string, unknown>): string | null {
  if (typeof ev.hangoutLink === "string" && ev.hangoutLink) return ev.hangoutLink;
  const conf = ev.conferenceData as { entryPoints?: { entryPointType?: string; uri?: string }[] } | undefined;
  const v = conf?.entryPoints?.find((e) => e.entryPointType === "video");
  return v?.uri ?? null;
}

function normalizar(ev: Record<string, any>): Reuniao {
  const inicio = ev.start?.dateTime || ev.start?.date || "";
  const fim = ev.end?.dateTime || ev.end?.date || "";
  const participantes = (ev.attendees ?? []).map((a: Record<string, any>) => ({
    nome: a.displayName || a.email || "?",
    email: a.email ?? null,
    resposta: a.responseStatus ?? null,
  }));
  return {
    id: String(ev.id ?? ""),
    titulo: ev.summary || "(sem título)",
    inicio,
    fim,
    diaTodo: !ev.start?.dateTime,
    participantes,
    linkMeet: linkDoMeet(ev),
    linkAgenda: ev.htmlLink ?? null,
    status: ev.status ?? "confirmed",
    recorrente: !!ev.recurringEventId,
  };
}

// Busca as reuniões da janela [hoje, hoje+dias], já normalizadas e sem canceladas.
export async function buscarReunioes(calendarId: string, dias: number, max: number): Promise<Reuniao[]> {
  const token = await obterAccessToken();
  const agora = new Date();
  const ate = new Date(agora.getTime() + dias * 86400000);
  const qs = new URLSearchParams({
    timeMin: agora.toISOString(),
    timeMax: ate.toISOString(),
    singleEvents: "true", // expande recorrências
    orderBy: "startTime",
    maxResults: String(max),
  });
  const enc = encodeURIComponent(calendarId);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${enc}/events?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`AGENDA:${res.status}:${JSON.stringify(j?.error ?? j)}`);

  const items: Record<string, any>[] = (j?.items ?? []).filter((e: Record<string, any>) => e.status !== "cancelled");
  return items.map(normalizar);
}
