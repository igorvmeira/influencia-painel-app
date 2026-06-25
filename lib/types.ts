export type Tipo = "B2B" | "B2C";

export interface ContaMap {
  accountId: string;
  cliente: string;
  gestor: string;
  tipo: Tipo;
}

export interface Totais {
  gasto: number;
  conversas: number;
  cpl: number;
  b2b: number;
  b2c: number;
  gastoVar: number;
  conversasVar: number;
  cplVar: number;
}

export interface LinhaGestor {
  nome: string;
  gasto: number;
  conversas: number;
  b2b: number;
  b2c: number;
  cpl: number;
  cplVar: number;
}

export interface PontoCpl {
  semana: string;
  atual: number;
  doisMesesAtras: number;
}

export interface LinhaCliente {
  cliente: string;
  tipo: Tipo;
  gasto: number;
  conversas: number;
  cplSemanal: number;
}

export interface Detalhe {
  gestor: string;
  contasCount: number;
  cplSemanal: PontoCpl[];
  clientes: LinhaCliente[];
}

export interface Painel {
  periodoLabel: string;
  atualizadoEm: string;
  totais: Totais;
  gestores: LinhaGestor[];
  detalhes: Detalhe[];
}
