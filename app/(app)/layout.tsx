import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodoGlobalProvider from "@/components/PeriodoGlobalProvider";

export const dynamic = "force-dynamic";

// Área autenticada: protege (AuthGate) e envolve no shell de navegação (Shell).
// Só o /login fica fora deste grupo (sem shell).
//
// O PeriodoGlobalProvider fica AQUI, e não em cada página, por dois motivos: é o
// único ponto que sobrevive à navegação entre telas (é o que faz o período
// viajar), e a vida dele passa a ser exatamente a da sessão — some no reload, que
// é a regra escrita em PeriodoGlobalProvider.tsx. Dentro do AuthGate de propósito:
// sem sessão não há período para guardar.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <PeriodoGlobalProvider>
        <Shell>{children}</Shell>
      </PeriodoGlobalProvider>
    </AuthGate>
  );
}
