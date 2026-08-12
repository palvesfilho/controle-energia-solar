"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  KeyRound,
  RefreshCw,
  Trash2,
  Mail,
  Hash,
  Building2,
  Clock,
  Pencil,
  Eye,
  EyeOff,
  Lock,
  Copy,
} from "lucide-react";
import { formatCodigoUc } from "@/lib/uc-codigo";

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

interface PlantCredentialsFormProps {
  plantId: string;
  defaultInstalacao?: string;
  onSyncComplete?: () => void;
  embedded?: boolean;
}

export function PlantCredentialsForm({
  plantId,
  defaultInstalacao,
  onSyncComplete,
  embedded,
}: PlantCredentialsFormProps) {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [loadingCred, setLoadingCred] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [emailCpfl, setEmailCpfl] = useState("");
  const [senhaCpfl, setSenhaCpfl] = useState("");
  // Exibido no padrão da concessionária; a API normaliza pra dígitos ao salvar.
  const [instalacao, setInstalacao] = useState(formatCodigoUc(defaultInstalacao) ?? "");
  // Só exibição: a API deriva do cadastro da usina e devolve pronta.
  const [distribuidora, setDistribuidora] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Senha salva, buscada só quando o operador clica no olho.
  const [senhaSalva, setSenhaSalva] = useState<string | null>(null);
  const [revelando, setRevelando] = useState(false);

  useEffect(() => {
    loadCredential();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId]);

  async function loadCredential() {
    setLoadingCred(true);
    const res = await fetch(`/api/plants/${plantId}/credentials`);
    const data = await res.json();
    if (data) {
      setCredential(data);
      setEmailCpfl(data.emailCpfl);
      setInstalacao(formatCodigoUc(data.instalacao));
      setDistribuidora(data.distribuidora);
    } else {
      setCredential(null);
      setShowForm(true);
    }
    setSenhaSalva(null);
    setShowPassword(false);
    setLoadingCred(false);
  }

  /** Busca a senha salva (uma vez) e devolve; null se não deu. */
  async function buscarSenhaSalva(): Promise<string | null> {
    if (senhaSalva !== null) return senhaSalva;
    setRevelando(true);
    try {
      const res = await fetch(`/api/plants/${plantId}/credentials/senha`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Não foi possível mostrar a senha");
        return null;
      }
      setSenhaSalva(data.senha);
      return data.senha as string;
    } finally {
      setRevelando(false);
    }
  }

  async function toggleSenhaSalva() {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    if ((await buscarSenhaSalva()) !== null) setShowPassword(true);
  }

  async function copiarSenha() {
    const senha = await buscarSenhaSalva();
    if (senha === null) return;
    await navigator.clipboard.writeText(senha);
    toast.success("Senha copiada");
  }

  /**
   * No formulário o olho tem duas funções: se o operador ainda não digitou nada,
   * ele traz a senha que está salva pra dentro do campo (dá pra corrigir uma
   * letra em vez de redigitar tudo); se já digitou, só mostra o que digitou.
   */
  async function toggleSenhaFormulario() {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    if (!senhaCpfl && credential?.hasSenha) {
      const senha = await buscarSenhaSalva();
      if (senha === null) return;
      setSenhaCpfl(senha);
    }
    setShowPassword(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const body: Record<string, string> = { emailCpfl, instalacao };
    if (senhaCpfl) body.senhaCpfl = senhaCpfl;

    const res = await fetch(`/api/plants/${plantId}/credentials`, {
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
    toast.info("Consultando faturas na distribuidora...");

    const res = await fetch(`/api/plants/${plantId}/bills/sync`, {
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

    const res = await fetch(`/api/plants/${plantId}/credentials`, {
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
    setSenhaSalva(null);
    setShowPassword(false);
    setInstalacao(defaultInstalacao ?? "");
    setDistribuidora("");
    setShowForm(true);
    setDeleting(false);
  }

  if (loadingCred) {
    const loader = (
      <div className="py-6 text-center text-muted-foreground">
        Carregando credenciais...
      </div>
    );
    if (embedded) return loader;
    return (
      <Card>
        <CardContent>{loader}</CardContent>
      </Card>
    );
  }

  const statusBadge = credential?.statusSync ? (
    <Badge
      variant={
        credential.statusSync === "SUCCESS"
          ? "default"
          : credential.statusSync === "ERROR"
            ? "destructive"
            : "secondary"
      }
      className={credential.statusSync === "SUCCESS" ? "bg-green-600" : ""}
    >
      {credential.statusSync === "SUCCESS"
        ? "Sincronizado"
        : credential.statusSync === "ERROR"
          ? "Erro"
          : "Pendente"}
    </Badge>
  ) : null;

  const body = (
    <>
      {embedded && statusBadge && (
        <div className="mb-3 flex justify-end">{statusBadge}</div>
      )}
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
              {/* A senha some ao salvar; aqui ela volta sob demanda, sem precisar
                  abrir a edição nem redigitar. */}
              <div className="flex items-start gap-3">
                <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Senha do portal</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">
                      {showPassword && senhaSalva !== null ? senhaSalva : "••••••••"}
                    </p>
                    <button
                      type="button"
                      onClick={toggleSenhaSalva}
                      disabled={revelando}
                      title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={copiarSenha}
                      disabled={revelando}
                      title="Copiar senha"
                      className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Código do cliente / Instalação</p>
                    <p className="text-sm font-medium">{formatCodigoUc(credential.instalacao)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Concessionária</p>
                    {/* Vem do cadastro da usina — não se escolhe aqui. */}
                    <p className="text-sm font-medium">{credential.distribuidora}</p>
                  </div>
                </div>
              </div>
              {credential.ultimaSync && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Última sincronização:{" "}
                      {new Date(credential.ultimaSync).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </>
              )}
            </div>

            {credential.erroSync && credential.statusSync === "ERROR" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs text-red-600">
                  <span className="font-medium">Erro na sincronização:</span>{" "}
                  {credential.erroSync}
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowPassword(false);
                  setShowForm(true);
                }}
              >
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
                  {credential ? "Senha do portal (deixe vazio para manter)" : "Senha do portal"}
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
                    onClick={toggleSenhaFormulario}
                    disabled={revelando}
                    title={
                      showPassword
                        ? "Ocultar senha"
                        : credential
                          ? "Mostrar a senha salva"
                          : "Mostrar senha"
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="instalacao">Código do cliente / Número de instalação</Label>
                <Input
                  id="instalacao"
                  value={instalacao}
                  onChange={(e) => setInstalacao(e.target.value)}
                  placeholder="Ex: 1234567890"
                  required
                />
              </div>
            </div>
            {/* A concessionária não é perguntada aqui: é sempre a do cadastro da
                usina. Perguntar duas vezes deixava os dois valores discordarem. */}
            {distribuidora && (
              <p className="text-xs text-muted-foreground">
                Concessionária: <span className="font-medium">{distribuidora}</span> — vem do
                cadastro da usina.
              </p>
            )}
            <div className="flex gap-2 justify-end">
              {credential && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSenhaCpfl("");
                    setShowPassword(false);
                    setShowForm(false);
                  }}
                >
                  Cancelar
                </Button>
              )}
              <Button
                type="submit"
                className="bg-green-700 hover:bg-green-800"
                disabled={saving}
              >
                {saving
                  ? "Salvando..."
                  : credential
                    ? "Atualizar credenciais"
                    : "Cadastrar credenciais"}
              </Button>
            </div>
          </form>
        )}
    </>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-green-700" />
            <CardTitle className="text-base">Acesso à distribuidora (sincronização de faturas)</CardTitle>
          </div>
          {statusBadge}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
