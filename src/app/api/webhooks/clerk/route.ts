import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarPreAutorizacao } from "@/lib/acesso-emissao";

const ALLOWED_ROLES = new Set([
  "ADMIN",
  "GESTOR",
  "FINANCEIRO",
  "POS_VENDA",
  "GESTOR_OBRA",
  "INVESTOR",
  "CONSUMER",
  "CLIENTE_BS",
]);

/** Lê proprietarioId do publicMetadata (setado no convite Clerk do cliente BS). */
function pickProprietarioId(publicMetadata: unknown): string | null {
  if (publicMetadata && typeof publicMetadata === "object") {
    const pid = (publicMetadata as Record<string, unknown>).proprietarioId;
    if (typeof pid === "string" && pid) return pid;
  }
  return null;
}

function pickRole(publicMetadata: unknown): string {
  if (publicMetadata && typeof publicMetadata === "object") {
    const role = (publicMetadata as Record<string, unknown>).role;
    if (typeof role === "string" && ALLOWED_ROLES.has(role)) return role;
  }
  return "INVESTOR";
}

function pickPrimaryEmail(emailAddresses: Array<{ id: string; email_address: string }>, primaryId: string | null): string | null {
  if (!emailAddresses?.length) return null;
  const primary = emailAddresses.find((e) => e.id === primaryId);
  return (primary ?? emailAddresses[0]).email_address ?? null;
}

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("[clerk webhook] verify failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  const type = evt.type;

  try {
    if (type === "user.created" || type === "user.updated") {
      const data = evt.data;
      const email = pickPrimaryEmail(data.email_addresses ?? [], data.primary_email_address_id ?? null);
      if (!email) return new Response("user has no email", { status: 400 });

      const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || email.split("@")[0];

      // Acesso é EMITIDO por operador, nunca conquistado por auto-cadastro.
      // Sem pré-autorização a linha até nasce (pra ficar visível em
      // /admin/usuarios e um operador decidir), mas nasce INATIVA — e
      // `auth-compat.ts` recusa sessão de usuário inativo, então ela não abre
      // porta nenhuma. Antes daqui, o default era `role: "INVESTOR"` +
      // `active: true`, e foi assim que uma conta criada sozinha no Account
      // Portal virou usuário do sistema em 31/08/2026.
      const pre = await verificarPreAutorizacao(email, data.public_metadata);
      const role = pre.role ?? pickRole(data.public_metadata);

      if (!pre.autorizado) {
        console.warn(
          `[clerk webhook] ${type}: ${email} sem pré-autorização (${pre.motivo}) — criado INATIVO`,
        );
      }

      // Adoção por e-mail, igual `ensureLocalUser`. O caminho normal agora é o
      // operador criar a linha no painel ANTES da pessoa existir no Clerk — ou
      // seja, linha com `clerkId` NULL e o e-mail já ocupado. Um upsert por
      // `clerkId` puro não acharia essa linha, tentaria INSERT e estouraria
      // P2002 em `users.email`, derrubando o webhook justo no fluxo que
      // passou a ser o principal.
      const jaVinculado = await prisma.user.findUnique({
        where: { clerkId: data.id },
        select: { id: true },
      });

      if (jaVinculado) {
        await prisma.user.update({
          where: { id: jaVinculado.id },
          // `active` fica de fora de propósito: ativar/desativar é decisão do
          // operador na tela, e o Clerk manda `user.updated` a cada login.
          // Reescrever aqui ressuscitaria conta desativada à revelia.
          data: { email, name, role },
        });
      } else {
        const preCadastro = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { id: true, clerkId: true },
        });

        if (preCadastro && preCadastro.clerkId === null) {
          await prisma.user.update({
            where: { id: preCadastro.id },
            data: { clerkId: data.id, name, role, active: pre.autorizado },
          });
        } else if (preCadastro) {
          // E-mail já pertence a OUTRA identidade Clerk. Não dá pra adotar sem
          // arriscar entregar a conta errada — registra e sai sem 500, senão o
          // Clerk fica reenfileirando o evento pra sempre.
          console.error(
            `[clerk webhook] ${email} já vinculado ao clerkId ${preCadastro.clerkId}; ignorando ${data.id}`,
          );
          return new Response("ok", { status: 200 });
        } else {
          await prisma.user.create({
            data: {
              clerkId: data.id,
              email,
              name,
              role,
              passwordHash: "",
              active: pre.autorizado,
            },
          });
        }
      }

      // Cliente Brasil Solar: vincula o proprietário ao usuário Clerk recém-criado
      // (o proprietarioId veio no publicMetadata do convite). Fecha o loop do
      // acesso pago — a partir daqui o portal identifica o proprietário pelo login.
      const proprietarioId = pickProprietarioId(data.public_metadata);
      if (proprietarioId) {
        await prisma.brasilSolarProprietario.updateMany({
          where: { id: proprietarioId },
          data: { clerkUserId: data.id },
        });
      }
    } else if (type === "user.deleted") {
      const clerkId = evt.data.id;
      if (clerkId) {
        await prisma.user.updateMany({
          where: { clerkId },
          data: { active: false },
        });
      }
    }
  } catch (err) {
    console.error(`[clerk webhook] handler failed for ${type}`, err);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
