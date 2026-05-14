"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UCForm, UCFormData } from "@/components/consumer-units/uc-form";

export default function NovaUCPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (data: UCFormData) => {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/consumer-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        router.push("/admin/unidades-consumidoras");
      } else {
        const d = await res.json();
        setError(d.error || "Erro ao criar UC");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <Link
        href="/admin/unidades-consumidoras"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Nova Unidade Consumidora</h1>
        <p className="text-sm text-muted-foreground">Cadastre uma nova UC no sistema</p>
      </div>

      <UCForm
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        cancelHref="/admin/unidades-consumidoras"
        submitLabel="Criar UC"
      />
    </div>
  );
}
