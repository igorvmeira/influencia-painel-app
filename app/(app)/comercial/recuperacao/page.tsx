import Recuperacao from "@/components/Recuperacao";

export const dynamic = "force-dynamic";

// Visão de recuperação (Variante B) — a UM CLIQUE do funil, nunca aba escondida.
// Lê o MESMO documento pré-agregado da /comercial: 1 leitura, sem custo novo.
export default function Page() {
  return <Recuperacao />;
}
