import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

// Área autenticada: protege (AuthGate) e envolve no shell de navegação (Shell).
// Login e /contas ficam fora deste grupo (sem shell).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <Shell>{children}</Shell>
    </AuthGate>
  );
}
