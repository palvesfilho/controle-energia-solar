"use client";

/**
 * "Cadastrar Consumidor" em janela, sem sair da tela onde se está.
 *
 * Nasceu no cadastro de UC vindo da fila do CRM: o cliente da adesão quase
 * nunca existe aqui ainda, e o operador tinha que largar o formulário da UC
 * pela metade, ir em Consumidores, cadastrar e voltar — perdendo o que já
 * tinha conferido. Agora cadastra aqui e o consumidor criado já volta
 * escolhido no seletor.
 *
 * São os mesmos campos e a mesma rota (`POST /api/consumers`) da tela
 * /admin/consumidores/novo, menos o vínculo com usina: quem liga UC a usina é
 * o rateio, não este cadastro.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";
import { comparaDocumentos, formatCpfCnpjComRotulo } from "@/lib/documento";

export interface ConsumidorSugerido {
  name?: string;
  document?: string;
  email?: string;
  phone?: string;
  endereco?: string;
}

export interface ConsumidorCriado {
  id: string;
  name: string;
  cpfCnpj?: string | null;
  document?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Valores de partida — o que a tela de origem já sabe do cliente. */
  sugestao?: ConsumidorSugerido;
  /** Consumidores já cadastrados, para acusar duplicata pelo CPF/CNPJ. */
  existentes?: { id: string; label: string; documento?: string | null }[];
  onCriado: (consumidor: ConsumidorCriado) => void;
  /** Escolher o consumidor que já existe em vez de criar outro. */
  onUsarExistente?: (id: string) => void;
}

const VAZIO = { name: "", document: "", email: "", phone: "", endereco: "" };

export function NovoConsumidorDialog({
  open,
  onOpenChange,
  sugestao,
  existentes = [],
  onCriado,
  onUsarExistente,
}: Props) {
  const [form, setForm] = useState(VAZIO);
  const [saving, setSaving] = useState(false);

  // Recarrega a sugestão a cada abertura: o operador pode ter corrigido o nome
  // ou o documento no formulário de trás entre uma abertura e outra.
  useEffect(() => {
    if (open) setForm({ ...VAZIO, ...sugestao });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (campo: keyof typeof VAZIO, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  // Mesmo documento já cadastrado = duplicata. Avisa em vez de travar: há
  // casos legítimos (mesmo CPF, cadastros separados), mas ninguém deve criar
  // o segundo sem saber que o primeiro existe.
  const duplicado = form.document.trim()
    ? existentes.find((c) => comparaDocumentos(form.document, c.documento) === "igual")
    : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A janela é um portal, mas no React o evento SOBE pela árvore de
    // componentes: sem isto, salvar o consumidor submeteria também o
    // formulário da UC que está por trás.
    e.stopPropagation();

    if (form.phone && !isValidPhone(form.phone)) {
      toast.error("Telefone inválido. Use (XX)XXXXX-XXXX");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/consumers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone,
          // Os dois campos de documento: `document` é o legado que a tela de
          // cadastro grava, `cpfCnpj` é o que a edição e as listas leem primeiro.
          document: form.document.trim(),
          cpfCnpj: form.document.trim(),
          endereco: form.endereco.trim(),
        }),
      });
      const dados = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      if (!res.ok) {
        toast.error("Erro ao criar consumidor", { description: dados.error });
        return;
      }
      toast.success("Consumidor criado", {
        description: `${dados.name} já está selecionado.`,
      });
      onCriado(dados as ConsumidorCriado);
      onOpenChange(false);
    } catch {
      toast.error("Erro de conexão ao criar o consumidor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar Consumidor</DialogTitle>
          <DialogDescription>
            O consumidor criado aqui já volta escolhido no formulário.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="novo-consumidor-nome">Nome completo *</Label>
              <Input
                id="novo-consumidor-nome"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="novo-consumidor-documento">CPF / CNPJ</Label>
              <Input
                id="novo-consumidor-documento"
                value={form.document}
                onChange={(e) => set("document", e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="novo-consumidor-telefone">Telefone</Label>
              <PhoneInput
                id="novo-consumidor-telefone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="novo-consumidor-email">Email</Label>
              <Input
                id="novo-consumidor-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="novo-consumidor-endereco">Endereço</Label>
              <Input
                id="novo-consumidor-endereco"
                value={form.endereco}
                onChange={(e) => set("endereco", e.target.value)}
                placeholder="Rua, número, bairro, cidade - UF"
              />
            </div>
          </div>

          {duplicado && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Já existe um consumidor com este documento:{" "}
              <strong>{duplicado.label}</strong> (
              {formatCpfCnpjComRotulo(duplicado.documento)}). Criar outro deixa o
              mesmo cliente em dois cadastros.
              {onUsarExistente && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 block"
                  onClick={() => {
                    onUsarExistente(duplicado.id);
                    onOpenChange(false);
                  }}
                >
                  Usar o que já existe
                </Button>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Criar Consumidor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
