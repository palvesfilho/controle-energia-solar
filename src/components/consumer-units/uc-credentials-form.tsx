"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { KeyRound, RefreshCw, Trash2, Mail, Hash, Building2, Clock, Pencil, Eye, EyeOff } from "lucide-react";

interface Credential {
  id: string;
  emailCpfl: string;
  instalacao: string;
  distribuidora: string;
  ultimaSync: string | null;
  statusSync: string | null;
  erroSync: string | null;
  active: boolean;
  hasSenha: boolean;
}

interface UcCredentialsFormProps {
  consumerUnitId: string;
  defaultInstalacao?: string;
  onSyncComplete?: () => void;
}

export function UcCredentialsForm({ consumerUnitId, defaultInstalacao, onSyncComplete }: UcCredentialsFormProps) {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [loadingCred, setLoadingCred] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [emailCpfl, setEmailCpfl] = useState("");
  const [senhaCpfl, setSenhaCpfl] = useState("");
  const [instalacao, setInstalacao] = useState(defaultInstalacao ?? "");
  const [distribuidora, setDistribuidora] = useState("RGE");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadCredential();
  }, [consumerUnitId]);

  async function loadCredential() {
    setLoadingCred(true);
    const res = await fetch(`/api/consumer-units/${consumerUnitId}/credentials`);
    const data = await res.json();
    if (data) {
      setCredential(data);
      setEmailCpfl(data.emailCpfl);
      setInstalacao(data.instalacao);
      setDistribuidora(data.distribuidora);
    } else {
      setCredential(null);
      setShowForm(true);
    }
    setLoadingCred(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const body: Record<string, string> = { emailCpfl, instalacao, distribuidora };
    if (senhaCpfl) body.senhaCpfl = senhaCpfl;

    const res = await fetch(`/api/consumer-units/${consumerUnitId}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || "Erro ao salvar credenciais");
      setSaving(false);
      return;
    }

    toast.success(credential ? "Credenciais atualizadas!" : "Credenciais cadastradas!");
    setSenhaCpfl("");
    setShowForm(false);
    await loadCredential();
    setSaving(false);
  }

  async function handleSync() {
    setSyncing(true);
    toast.info("Consultando faturas na RGE Sul...");

    const res = await fetch(`/api/consumer-units/${consumerUnitId}/bills/sync`, {
      method: "POST",
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      toast.error(data.error || "Erro na sincronização");
      setSyncing(false);
      await loadCredential();
      return;
    }

    toast.success(data.message);
    await loadCredential();
    setSyncing(false);
    onSyncComplete?.();
  }

  async function handleDelete() {
    if (!confirm("Tem certeza que deseja remover as credenciais?")) return;
    setDeleting(true);

    const res = await fetch(`/api/consumer-units/${consumerUnitId}/credentials`, {
      method: "DELETE",
    });

    if (!res.ok) {
      toast.error("Erro ao remover credenciais");
      setDeleting(false);
      return;
    }

    toast.success("Credenciais removidas!");
    setCredential(null);
    setEmailCpfl("");
    setSenhaCpfl("");
    setInstalacao(defaultInstalacao ?? "");
    setDistribuidora("RGE");
    setShowForm(true);
    setDeleting(false);
  }

  if (loadingCred) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          Carregando credenciais...
        </CardContent>
      </Card>
    );
  }

  const statusBadge = credential?.statusSync ? (
    <Badge
      variant={
        credential.statusSync === "SUCCESS" ? "default" :
        credential.statusSync === "ERROR" ? "destructive" : "secondary"
      }
      className={credential.statusSync === "SUCCESS" ? "bg-green-600" : ""}
    >
      {credential.statusSync === "SUCCESS" ? "Sincronizado" :
       credential.statusSync === "ERROR" ? "Erro" : "Pendente"}
    </Badge>
  ) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-green-700" />
            <CardTitle className="text-base">Status e acesso à concessionária</CardTitle>
          </div>
          {statusBadge}
        </div>
      </CardHeader>
      <CardContent>
        {credential && !showForm && (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Email do portal</p>
                  <p className="text-sm font-medium truncate">{credential.emailCpfl}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Instalação</p>
                    <p className="text-sm font-medium">{credential.instalacao}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Distribuidora</p>
                    <p className="text-sm font-medium">
                      {credential.distribuidora === "RGE" ? "RGE Sul" :
                       credential.distribuidora === "CPFL_PAULISTA" ? "CPFL Paulista" :
                       credential.distribuidora === "CPFL_PIRATININGA" ? "CPFL Piratininga" :
                       credential.distribuidora}
                    </p>
                  </div>
                </div>
              </div>
              {credential.ultimaSync && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Última sincronização: {new Date(credential.ultimaSync).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </>
              )}
            </div>

            {credential.erroSync && credential.statusSync === "ERROR" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs text-red-600">
                  <span className="font-medium">Erro na sincronização:</span> {credential.erroSync}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-green-700 hover:bg-green-800"
                onClick={handleSync}
                disabled={syncing}
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Sincronizando..." : "Sincronizar faturas"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
                <Pencil className="h-4 w-4 mr-1.5" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Remover
              </Button>
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emailCpfl">Email do portal</Label>
                <Input
                  id="emailCpfl"
                  type="email"
                  value={emailCpfl}
                  onChange={(e) => setEmailCpfl(e.target.value)}
                  placeholder="email@exemplo.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senhaCpfl">
                  {credential ? "Nova senha (deixe vazio para manter)" : "Senha do portal"}
                </Label>
                <div className="relative">
                  <Input
                    id="senhaCpfl"
                    type={showPassword ? "text" : "password"}
                    value={senhaCpfl}
                    onChange={(e) => setSenhaCpfl(e.target.value)}
                    placeholder="********"
                    required={!credential}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="instalacao">Número da instalação</Label>
                <Input
                  id="instalacao"
                  value={instalacao}
                  onChange={(e) => setInstalacao(e.target.value)}
                  placeholder="Ex: 1234567890"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="distribuidora">Distribuidora</Label>
                <Select value={distribuidora} onValueChange={(v) => setDistribuidora(v ?? "RGE")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RGE">RGE Sul</SelectItem>
                    <SelectItem value="CPFL_PAULISTA">CPFL Paulista</SelectItem>
                    <SelectItem value="CPFL_PIRATININGA">CPFL Piratininga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              {credential && (
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" className="bg-green-700 hover:bg-green-800" disabled={saving}>
                {saving ? "Salvando..." : credential ? "Atualizar credenciais" : "Cadastrar credenciais"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
