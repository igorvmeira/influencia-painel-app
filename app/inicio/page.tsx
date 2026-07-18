import { redirect } from "next/navigation";

// Alias: /inicio → / (a Início canônica é a raiz).
export default function Page() {
  redirect("/");
}
