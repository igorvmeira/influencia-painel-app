export const brl = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const brlDec = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (n: number) => n.toLocaleString("pt-BR");

export const pct = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n) + "%";
