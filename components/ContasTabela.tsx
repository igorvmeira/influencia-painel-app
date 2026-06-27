"use client";

import { useState } from "react";

interface AdAccount {
  account_id: string;
  name: string;
  account_status: number;
}

const STATUS_LABEL: Record<number, string> = {
  1: "Ativa",
  2: "Desativada",
  3: "Não confirmada",
  7: "Pendente revisão",
  8: "Pendente fechamento",
  9: "Em período de carência",
  100: "Pendente fechamento",
  101: "Fechada",
};

export default function ContasTabela({ contas }: { contas: AdAccount[] }) {
  const [copiado, setCopiado] = useState(false);

  const contasComPrefixo = contas.map((c) => ({
    accountId: `act_${c.account_id}`,
    name: c.name,
    account_status: c.account_status,
  }));

  async function copiarComoJson() {
    await navigator.clipboard.writeText(JSON.stringify(contasComPrefixo, null, 2));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-600">{contas.length} conta(s) encontrada(s)</p>
        <button
          onClick={copiarComoJson}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          {copiado ? "Copiado!" : "Copiar como JSON"}
        </button>
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Nome da conta</th>
              <th className="px-3 py-2">account_id</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {contasComPrefixo.map((c) => (
              <tr key={c.accountId} className="border-t">
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2 font-mono">{c.accountId}</td>
                <td className="px-3 py-2">
                  {STATUS_LABEL[c.account_status] ?? c.account_status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
