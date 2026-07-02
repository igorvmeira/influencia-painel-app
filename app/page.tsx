import AuthGate from "@/components/AuthGate";
import DashboardLoader from "@/components/DashboardLoader";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <AuthGate>
        <DashboardLoader />
      </AuthGate>
    </main>
  );
}
