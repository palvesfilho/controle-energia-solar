import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Sun, ShieldOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ensureLocalUser } from "@/lib/auth-compat";
import { brandGradient } from "@/lib/brand-colors";
import { getPortalClienteData } from "@/lib/portal-cliente-data";
import { PortalClienteBody } from "@/components/brasil-solar/portal-cliente-body";

export const dynamic = "force-dynamic";

export default async function PortalClientePage() {
  const user = await currentUser();
  if (!user) redirect("/login-clerk");

  // Garante o User local + vínculo do proprietário (via proprietarioId do
  // publicMetadata) mesmo se o webhook Clerk não estiver configurado. Sem isto,
  // o cliente logaria e cairia em "Conta não vinculada" no primeiro acesso.
  await ensureLocalUser(user);

  const prop = await prisma.brasilSolarProprietario.findFirst({
    where: { clerkUserId: user.id, active: true },
    include: {
      acesso: true,
      plantas: {
        where: { active: true },
        orderBy: { nome: "asc" },
        select: {
          id: true,
          nome: true,
          cidade: true,
          uf: true,
          potenciaInstalada: true,
          statusMonitoramento: true,
        },
      },
    },
  });

  const nome =
    user.firstName ||
    user.emailAddresses[0]?.emailAddress.split("@")[0] ||
    "Cliente";

  const portalData = prop ? await getPortalClienteData(prop.id) : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F8F7]">
      <header className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ background: brandGradient }}
            >
              <Sun className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="font-bold text-[#1F1F1F] leading-tight tracking-tight">
                Rede Brasil Solar
              </div>
              <div className="text-xs text-[#8A938D]">Portal do Cliente</div>
            </div>
          </div>
          <UserButton />
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
        {!prop ? (
          <NaoVinculado />
        ) : (
          <PortalClienteBody
            nome={nome}
            acesso={prop.acesso}
            portalData={portalData}
            usinas={prop.plantas}
          />
        )}
      </main>
    </div>
  );
}

function NaoVinculado() {
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#EDF4F1] mb-4">
        <ShieldOff className="w-8 h-8 text-[#8A938D]" />
      </div>
      <h3 className="text-lg font-semibold text-[#1F1F1F]">
        Conta ainda não vinculada
      </h3>
      <p className="text-sm text-[#59604F] mt-1 max-w-md mx-auto">
        Seu login foi criado, mas ainda não está associado a uma usina. Entre em
        contato com a Rede Brasil Solar para concluir o acesso.
      </p>
    </div>
  );
}
