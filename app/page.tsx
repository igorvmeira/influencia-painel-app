import Dashboard from "@/components/Dashboard";
import { getPainel } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { data, fonte } = await getPainel();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Dashboard data={data} fonte={fonte} />
    </main>
  );
}
