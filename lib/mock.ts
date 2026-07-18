import { ContaMap, LimiteConta, MetricaDiaria, Tipo } from "./types";

// De-para de exemplo (mesmos gestores/clientes da onda 1) + nicho variado.
// PetWorld fica sem nicho de propósito, para exercitar o fallback "Sem nicho".
interface SeedConta { cliente: string; gestor: string; tipo: Tipo; nicho?: string; baseGasto: number; baseCpl: number; tendencia: number; pausado?: boolean }

// tendencia > 0 = CPL piora (sobe) ao longo do tempo; < 0 = melhora (cai).
const SEEDS: SeedConta[] = [
  { cliente: "Loja Verde", gestor: "Ana Souza", tipo: "B2C", nicho: "Restaurante", baseGasto: 560, baseCpl: 27, tendencia: -0.18 },
  { cliente: "TechPrime", gestor: "Ana Souza", tipo: "B2B", nicho: "Provedor (ISP)", baseGasto: 750, baseCpl: 116, tendencia: -0.12 },
  { cliente: "Studio Bella", gestor: "Ana Souza", tipo: "B2C", nicho: "Odonto/Saúde", baseGasto: 376, baseCpl: 23, tendencia: -0.20 },
  { cliente: "Contábil Onuma", gestor: "Ana Souza", tipo: "B2B", nicho: "Educação", baseGasto: 527, baseCpl: 111, tendencia: -0.08 },
  { cliente: "FitLab", gestor: "Ana Souza", tipo: "B2C", nicho: "Academia", baseGasto: 420, baseCpl: 23, tendencia: -0.15 },
  { cliente: "Imob Costa", gestor: "Ana Souza", tipo: "B2B", nicho: "Imobiliária", baseGasto: 607, baseCpl: 103, tendencia: -0.10 },

  { cliente: "AutoPeças BH", gestor: "Bruno Lima", tipo: "B2B", nicho: "Provedor (ISP)", baseGasto: 853, baseCpl: 125, tendencia: 0.16 },
  { cliente: "Doce Encanto", gestor: "Bruno Lima", tipo: "B2C", nicho: "Restaurante", baseGasto: 480, baseCpl: 25, tendencia: 0.10 },
  { cliente: "Clínica Vita", gestor: "Bruno Lima", tipo: "B2C", nicho: "Odonto/Saúde", baseGasto: 593, baseCpl: 29, tendencia: 0.12 },
  { cliente: "Jurídico Prado", gestor: "Bruno Lima", tipo: "B2B", nicho: "Educação", baseGasto: 627, baseCpl: 118, tendencia: 0.14 },
  { cliente: "PetWorld", gestor: "Bruno Lima", tipo: "B2C", baseGasto: 407, baseCpl: 26, tendencia: 0.08, pausado: true }, // teste: conta pausada (só dev)

  { cliente: "Moda Urbana", gestor: "Carla Dias", tipo: "B2C", nicho: "Restaurante", baseGasto: 513, baseCpl: 25, tendencia: -0.06 },
  { cliente: "Construtora Líder", gestor: "Carla Dias", tipo: "B2B", nicho: "Imobiliária", baseGasto: 707, baseCpl: 126, tendencia: -0.04 },
  { cliente: "Sabor Caseiro", gestor: "Carla Dias", tipo: "B2C", nicho: "Restaurante", baseGasto: 353, baseCpl: 24, tendencia: -0.05 },
  { cliente: "Seguros Mais", gestor: "Carla Dias", tipo: "B2B", nicho: "Educação", baseGasto: 547, baseCpl: 112, tendencia: -0.03 },
];

// Gera um id estável tipo "act_loja_verde" sem depender de regex de acentos.
function slug(s: string): string {
  const semAcento = s.normalize("NFD").split("").filter((ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x300 || code > 0x36f; // descarta marcas combinantes
  }).join("");
  return "act_" + semAcento.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export const mockContas: ContaMap[] = SEEDS.map((s) => ({
  accountId: slug(s.cliente),
  cliente: s.cliente,
  gestor: s.gestor,
  tipo: s.tipo,
  ...(s.nicho ? { nicho: s.nicho } : {}),
  ...(s.pausado ? { pausado: true } : {}),
}));

// Tetos de gasto de exemplo (valores já em R$) para exercitar o alerta de limite:
// 1 crítico (>=90%), 1 atenção (>=80%), 1 ok (<80%) e 1 sem teto (spendCap=0).
export const mockLimites: LimiteConta[] = [
  { accountId: slug("Construtora Líder"), spendCap: 5000, amountSpent: 4750, isPrepay: false }, // 95% → CRÍTICO
  { accountId: slug("Clínica Vita"),      spendCap: 3000, amountSpent: 2550, isPrepay: true  }, // 85% → ATENÇÃO
  { accountId: slug("TechPrime"),         spendCap: 8000, amountSpent: 5200, isPrepay: false }, // 65% → ok (não alerta)
  { accountId: slug("Loja Verde"),        spendCap: 0,    amountSpent: 1200, isPrepay: false }, // sem teto → ignorar
];

// Ruído determinístico 0..1 (estável entre servidor e client).
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Gera ~90 dias de métricas diárias por conta, com leve tendência de CPL.
export function mockDiario(): { daily: MetricaDiaria[]; contas: ContaMap[] } {
  const DIAS = 90;
  const hoje = new Date();
  const daily: MetricaDiaria[] = [];

  SEEDS.forEach((s, ci) => {
    const accountId = slug(s.cliente);
    for (let i = 0; i < DIAS; i++) {
      // i=0 é o dia mais antigo; DIAS-1 é hoje.
      const d = new Date(hoje);
      d.setUTCDate(d.getUTCDate() - (DIAS - 1 - i));
      const diasDoHoje = DIAS - 1 - i;

      const rGasto = 0.82 + 0.36 * noise(ci * 131 + i * 7 + 1);
      const gasto = Math.round(s.baseGasto * rGasto);

      // tendencia>0 (piora): dias recentes com CPL mais alto que os antigos.
      const fatorTempo = 1 - s.tendencia * (diasDoHoje / DIAS);
      const rCpl = 0.94 + 0.12 * noise(ci * 197 + i * 11 + 3);
      const cplDia = Math.max(1, s.baseCpl * fatorTempo * rCpl);
      const conversas = Math.max(0, Math.round(gasto / cplDia));

      const leadsForm = s.tipo === "B2B" ? conversas : 0;
      const convWhats = s.tipo === "B2C" ? conversas : 0;

      // Simula a coleta "daqui pra frente": só os ~20 dias mais recentes têm
      // reach/impressions; dias antigos ficam SEM o campo (viram "—" na tela).
      const coletado = diasDoHoje < 20;
      const impressions = coletado ? Math.round(gasto * (25 + 15 * noise(ci * 211 + i * 13 + 5))) : undefined;
      const reach = coletado ? Math.round((impressions as number) * (0.5 + 0.25 * noise(ci * 233 + i * 17 + 9))) : undefined;

      daily.push({
        accountId, data: ymd(d), gasto, leadsForm, convWhats, conversas,
        ...(coletado ? { reach, impressions } : {}),
      });
    }
  });

  return { daily, contas: mockContas };
}
