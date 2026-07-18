import DashboardLoader from "@/components/DashboardLoader";

export const dynamic = "force-dynamic";

// Dashboard de Tráfego (o painel completo), dentro do shell de navegação.
export default function Page() {
  return <DashboardLoader />;
}
