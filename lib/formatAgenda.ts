import { MARCA } from "./brand";

// Formatação de datas da agenda no fuso do cliente (constante em lib/brand.ts).
const FUSO = MARCA.fuso;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Chave do dia "YYYY-MM-DD" no fuso do cliente (evita jogar evento da noite no
// dia errado). en-CA formata como YYYY-MM-DD.
export function chaveDia(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

// Horário "HH:mm" no fuso do cliente.
export function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

// Chaves de hoje e amanhã (para destacar na lista).
export function chavesHojeAmanha(): { hoje: string; amanha: string } {
  const agora = Date.now();
  return {
    hoje: chaveDia(new Date(agora).toISOString()),
    amanha: chaveDia(new Date(agora + 86400000).toISOString()),
  };
}

// Cabeçalho do dia: "Hoje · Segunda, 20 de julho" / "Amanhã · ..." / "Segunda, 20 de julho".
export function rotuloDia(isoRepresentativo: string, chave: string, hoje: string, amanha: string): string {
  const dt = new Date(isoRepresentativo);
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long" }).format(dt).replace("-feira", "");
  const diaMes = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "numeric", month: "long" }).format(dt);
  const base = `${cap(semana)}, ${diaMes}`;
  if (chave === hoje) return `Hoje · ${base}`;
  if (chave === amanha) return `Amanhã · ${base}`;
  return base;
}
