import { redirect } from "next/navigation";

export default function FaturamentoUCRedirectPage() {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = String(now.getMonth() + 1).padStart(2, "0");
  redirect(`/admin/faturamento/unidades-consumidoras/${ano}-${mes}`);
}
