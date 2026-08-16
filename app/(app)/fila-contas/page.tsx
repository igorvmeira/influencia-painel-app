import FilaContas from "@/components/FilaContas";

export const dynamic = "force-dynamic";

// Fila de aprovação de contas novas (o sistema descobre, a pessoa decide), no shell.
export default function Page() {
  return <FilaContas />;
}
