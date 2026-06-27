import ContasTabela from "@/components/ContasTabela";

export const dynamic = "force-dynamic";

const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

interface AdAccount {
  account_id: string;
  name: string;
  account_status: number;
}

async function buscarTodasContas(): Promise<AdAccount[]> {
  const out: AdAccount[] = [];
  const params = new URLSearchParams({
    fields: "account_id,name,account_status",
    limit: "200",
    access_token: TOKEN,
  });
  let url: string | undefined = `https://graph.facebook.com/${API}/me/adaccounts?${params}`;

  while (url) {
    const res: Response = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Meta API ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    out.push(...(json?.data ?? []));
    url = json?.paging?.next;
  }

  return out;
}

export default async function Page({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const segredo = process.env.CRON_SECRET;
  const autorizado = !segredo || searchParams.key === segredo;

  if (!autorizado) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="text-red-600">401 - não autorizado</p>
      </main>
    );
  }

  let contas: AdAccount[] = [];
  let erro: string | null = null;
  try {
    contas = await buscarTodasContas();
  } catch (e) {
    erro = e instanceof Error ? e.message : "erro desconhecido";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-xl font-semibold">Contas de anúncio (Meta)</h1>
      {erro ? (
        <p className="text-red-600">Erro ao buscar contas: {erro}</p>
      ) : (
        <ContasTabela contas={contas} />
      )}
    </main>
  );
}
