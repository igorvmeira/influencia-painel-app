import { Reuniao } from "./types";
import { obterAccessToken, ESCOPO_AGENDA } from "./googleAuth";

// Leitura do Google Agenda pela conta de serviço. Somente leitura.
//
// ⚠️ A ASSINATURA DO JWT SAIU DAQUI em 10/09/2026, para `lib/googleAuth.ts`. Ela era
// idêntica à que a leitura da planilha ia precisar, e o escopo era a única diferença.
// Duplicar teria criado duas cópias com nomes locais dos dois lados — a forma de
// duplicação que nenhuma busca acha. O escopo virou parâmetro; o resto é o mesmo.

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
  const token = await obterAccessToken(ESCOPO_AGENDA);
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
