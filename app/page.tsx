import Dashboard from "@/components/Dashboard";
import { getDadosDiarios } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { key?: string } }) {
  const { daily, contas, fonte } = await getDadosDiarios();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Dashboard daily={daily} contas={contas} fonte={fonte} chave={searchParams.key ?? ""} />
    </main>
  );
}
