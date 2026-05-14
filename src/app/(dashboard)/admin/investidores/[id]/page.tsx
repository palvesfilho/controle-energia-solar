"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Sun,
  Users,
  Mail,
  Phone,
  FileText,
  Percent,
  Zap,
  KeyRound,
  Eye,
  EyeOff,
  RotateCcw,
  Building2,
  MapPin,
  Calendar,
  CreditCard,
  Copy,
} from "lucide-react";

interface ConsumerData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  unidadeConsumidora: string | null;
  active: boolean;
}

interface ConsumerPlantData {
  id: string;
  cotaPercent: number | null;
  descontoPercent: number | null;
  consumer: ConsumerData;
}

interface PlantData {
  id: string;
  name: string;
  location: string | null;
  potenciaModulos: number | null;
  potenciaInversor: number | null;
  geracaoMediaMensal: number | null;
  enquadramento: string | null;
  unidadeConsumidora: string | null;
  concessionaria: string | null;
  active: boolean;
  consumers: ConsumerPlantData[];
}

interface InvestorPlantData {
  id: string;
  sharePercent: number | null;
  valorKwhContrato: number | null;
  gestaoFixaContrato: number | null;
  plant: PlantData;
}

interface InvestorDetail {
  id: string;
  phone: string | null;
  document: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  cep: string | null;
  bairro: string | null;
  cidade: string | null;
  nomeEmpresa: string | null;
  cnpj: string | null;
  enderecoEmpresa: string | null;
  numeroEmpresa: string | null;
  complementoEmpresa: string | null;
  cepEmpresa: string | null;
  bairroEmpresa: string | null;
  cidadeEmpresa: string | null;
  chavePix: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string; active: boolean };
  plants: InvestorPlantData[];
}

const ACCENT_CLASSES = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
} as const;

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: keyof typeof ACCENT_CLASSES;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${ACCENT_CLASSES[accent]}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value || "Não informado"}</span>
    </div>
  );
}

export default function DetalhesInvestidorPage() {
  const params = useParams();
  const [investor, setInvestor] = useState<InvestorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/investors/${params.id}`)
      .then((res) => res.json())
      .then(setInvestor)
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleResetPassword() {
    if (!confirm("Tem certeza que deseja resetar a senha deste investidor?")) return;

    setResettingPassword(true);
    try {
      const res = await fetch(`/api/investors/${params.id}/reset-password`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Erro ao resetar senha", { description: data.error });
        return;
      }
      setTempPassword(data.tempPassword);
      setShowPassword(true);
      toast.success("Senha resetada", {
        description: "Copie a senha temporária e informe ao investidor.",
      });
    } catch {
      toast.error("Erro ao resetar senha");
    } finally {
      setResettingPassword(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!investor) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Investidor não encontrado.
      </div>
    );
  }

  const totalConsumers = investor.plants.reduce(
    (acc, ip) => acc + ip.plant.consumers.length,
    0
  );

  const geracaoTotal = investor.plants.reduce(
    (acc, ip) => acc + (ip.plant.geracaoMediaMensal ?? 0),
    0
  );

  return (
    <div className="space-y-4 max-w-5xl">
      <Link
        href="/admin/investidores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para investidores
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{investor.user.name}</h1>
            <Badge
              variant={investor.user.active ? "default" : "secondary"}
              className={investor.user.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}
            >
              {investor.user.active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastrado em {new Date(investor.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/investidores/${investor.id}/debitos`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            Débitos
          </Link>
          <Link
            href={`/admin/investidores/${investor.id}/editar`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Sun className="h-4 w-4" />}
          label="Usinas"
          value={investor.plants.length}
          accent="amber"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Clientes"
          value={totalConsumers}
          accent="emerald"
        />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Geração média total"
          value={`${geracaoTotal.toLocaleString("pt-BR")} kWh`}
          accent="blue"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados Pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoItem icon={Mail} label="Email" value={investor.user.email} />
            <InfoItem icon={Phone} label="Telefone" value={investor.phone} />
            <InfoItem icon={FileText} label="CPF" value={investor.cpf || investor.document} />
            <InfoItem
              icon={Calendar}
              label="Data de Nascimento"
              value={
                investor.dataNascimento
                  ? new Date(investor.dataNascimento).toLocaleDateString("pt-BR")
                  : null
              }
            />
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoItem icon={MapPin} label="Endereço" value={investor.endereco} />
            <InfoItem label="Número" value={investor.numero} />
            <InfoItem label="Complemento" value={investor.complemento} />
            <InfoItem label="CEP" value={investor.cep} />
            <InfoItem icon={MapPin} label="Bairro" value={investor.bairro} />
            <InfoItem icon={MapPin} label="Cidade" value={investor.cidade} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados da Empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoItem icon={Building2} label="Nome da Empresa" value={investor.nomeEmpresa} />
            <InfoItem icon={FileText} label="CNPJ" value={investor.cnpj} />
            <InfoItem icon={MapPin} label="Endereço" value={investor.enderecoEmpresa} />
            <InfoItem label="Número" value={investor.numeroEmpresa} />
            <InfoItem label="Complemento" value={investor.complementoEmpresa} />
            <InfoItem label="CEP" value={investor.cepEmpresa} />
            <InfoItem icon={MapPin} label="Bairro" value={investor.bairroEmpresa} />
            <InfoItem icon={MapPin} label="Cidade" value={investor.cidadeEmpresa} />
            <InfoItem icon={CreditCard} label="Chave PIX" value={investor.chavePix} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Acesso ao Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Login (email):</span>
              <span className="font-medium font-mono">{investor.user.email}</span>
              <button
                onClick={() => copyToClipboard(investor.user.email)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Senha:</span>
              {tempPassword ? (
                <>
                  <span className="font-medium font-mono">
                    {showPassword ? tempPassword : "••••••••••"}
                  </span>
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => copyToClipboard(tempPassword)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <span className="text-muted-foreground italic">••••••••••</span>
              )}
            </div>
          </div>

          {tempPassword && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-200">
              Senha temporária gerada. Informe ao investidor para que ele altere no primeiro acesso.
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleResetPassword}
              disabled={resettingPassword}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              {resettingPassword ? "Resetando..." : "Resetar Senha"}
            </button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">
          Usinas ({investor.plants.length})
        </h2>

        {investor.plants.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma usina vinculada a este investidor.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {investor.plants.map((ip) => (
              <Card key={ip.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sun className="h-4 w-4 text-amber-500" />
                        {ip.plant.name}
                        {!ip.plant.active && <Badge variant="secondary">Inativa</Badge>}
                      </CardTitle>
                      {ip.plant.location && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {ip.plant.location}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/admin/usinas/${ip.plant.id}`}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-muted transition-colors"
                    >
                      Ver usina
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {ip.plant.potenciaModulos != null && (
                      <div>
                        <p className="text-xs text-muted-foreground">Potência Módulos</p>
                        <p className="font-medium">
                          {ip.plant.potenciaModulos.toLocaleString("pt-BR")} kWp
                        </p>
                      </div>
                    )}
                    {ip.plant.potenciaInversor != null && (
                      <div>
                        <p className="text-xs text-muted-foreground">Potência Inversor</p>
                        <p className="font-medium">
                          {ip.plant.potenciaInversor.toLocaleString("pt-BR")} kW
                        </p>
                      </div>
                    )}
                    {ip.plant.geracaoMediaMensal != null && (
                      <div>
                        <p className="text-xs text-muted-foreground">Geração Média</p>
                        <p className="font-medium">
                          {ip.plant.geracaoMediaMensal.toLocaleString("pt-BR")} kWh
                        </p>
                      </div>
                    )}
                    {ip.plant.concessionaria && (
                      <div>
                        <p className="text-xs text-muted-foreground">Concessionária</p>
                        <p className="font-medium">{ip.plant.concessionaria}</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Termos do Contrato
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Participação:</span>
                        <span className="font-medium">
                          {ip.sharePercent != null ? `${ip.sharePercent}%` : "Não definida"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valor kWh:</span>{" "}
                        <span className="font-medium">
                          {ip.valorKwhContrato != null
                            ? `R$ ${ip.valorKwhContrato.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                            : "Não definido"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Gestão fixa:</span>{" "}
                        <span className="font-medium">
                          {ip.gestaoFixaContrato != null
                            ? `R$ ${ip.gestaoFixaContrato.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                            : "Não definida"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-emerald-600" />
                      Clientes vinculados ({ip.plant.consumers.length})
                    </h3>

                    {ip.plant.consumers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum cliente vinculado a esta usina.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                                Nome
                              </th>
                              <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                                UC
                              </th>
                              <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                                Contato
                              </th>
                              <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">
                                Cota (%)
                              </th>
                              <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">
                                Desconto (%)
                              </th>
                              <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {ip.plant.consumers.map((cp) => (
                              <tr
                                key={cp.id}
                                className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                              >
                                <td className="py-2.5 px-3 font-medium">
                                  {cp.consumer.name}
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  {cp.consumer.unidadeConsumidora ?? "-"}
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  {cp.consumer.email ?? cp.consumer.phone ?? "-"}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {cp.cotaPercent != null ? `${cp.cotaPercent}%` : "-"}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {cp.descontoPercent != null ? `${cp.descontoPercent}%` : "-"}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <Badge
                                    variant={cp.consumer.active ? "default" : "secondary"}
                                    className={
                                      cp.consumer.active ? "bg-emerald-500 hover:bg-emerald-600" : ""
                                    }
                                  >
                                    {cp.consumer.active ? "Ativo" : "Inativo"}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
