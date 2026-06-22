import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { PrismaClient } from "@prisma/client";
import type { NextRequest } from "next/server";

const prisma = new PrismaClient();

const ALLOWED_ROLES = new Set([
  "ADMIN",
  "GESTOR",
  "FINANCEIRO",
  "POS_VENDA",
  "GESTOR_OBRA",
  "INVESTOR",
  "CONSUMER",
]);

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
      const role = pickRole(data.public_metadata);

      await prisma.user.upsert({
        where: { clerkId: data.id },
        create: {
          clerkId: data.id,
          email,
          name,
          role,
          passwordHash: "",
          active: true,
        },
        update: {
          email,
          name,
          role,
        },
      });
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
