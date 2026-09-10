import Conciliacao from "@/components/Conciliacao";

export const dynamic = "force-dynamic";

// Conciliação da planilha de Monitoramento com a carteira do painel, no shell.
// A planilha manda no gestor e nos campos dela; o painel manda no que ele mede.
export default function Page() {
  return <Conciliacao />;
}
