/**
 * Envio de notificações push (Web Push / VAPID) para o Portal do Cliente.
 *
 * Só o servidor entra aqui: a chave privada VAPID assina cada envio e nunca
 * pode chegar ao navegador. A chave pública, essa sim, é servida ao cliente por
 * `/api/portal-cliente/push/chave`.
 *
 * O caminho completo de um aviso:
 *   1. o cliente autoriza no portal        → PushSubscription no banco
 *   2. alguém chama `enviarPushProprietario`
 *   3. o serviço do fabricante (FCM/Apple) entrega ao aparelho
 *   4. `public/sw.js` recebe o evento `push` e exibe a notificação
 *
 * ⚠️ "Enviado" aqui significa ACEITO pelo serviço de push, não visto pelo
 * cliente. O aparelho pode estar desligado (entrega depois), sem bateria, ou
 * com a notificação silenciada. Não existe confirmação de leitura no Web Push —
 * não prometa isso na tela.
 */
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export interface ConteudoPush {
  titulo: string;
  mensagem: string;
  /** Tela aberta ao tocar na notificação. Default: `/portal-cliente`. */
  url?: string;
  /** Notificações de mesma `tag` se substituem no celular em vez de empilhar. */
  tag?: string;
}

export interface ResultadoEnvio {
  /** Aceitos pelo serviço de push. */
  enviados: number;
  /** Inscrições mortas (404/410) que foram apagadas nesta chamada. */
  removidos: number;
  /** Erros que NÃO são inscrição morta — merecem olhar. */
  falhas: string[];
}

/** `null` quando as chaves não estão configuradas no ambiente. */
export function getChavePublicaVapid(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

/**
 * Carrega as chaves no web-push. Feito a cada chamada de propósito: em
 * serverless o módulo pode ser reidratado a frio, e `setVapidDetails` é barato.
 * Lança se faltar configuração — melhor um erro claro na tela do admin do que
 * um envio que falha em silêncio.
 */
function configurarVapid(): void {
  const publica = process.env.VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:contato@solvesm.eng.br";

  if (!publica || !privada) {
    throw new Error(
      "Notificações push não configuradas: faltam VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no ambiente. Gere com `npx tsx scripts/gen-vapid-keys.ts`.",
    );
  }

  webpush.setVapidDetails(subject, publica, privada);
}

/**
 * Dispara o mesmo aviso para TODOS os aparelhos inscritos do proprietário.
 *
 * Inscrição morta é apagada na hora: quando o cliente desinstala o app ou
 * revoga a permissão, o serviço responde 404/410 e aquele endpoint nunca mais
 * vai funcionar. Guardar essas linhas só faz cada disparo futuro acumular erro.
 */
export async function enviarPushProprietario(
  proprietarioId: string,
  conteudo: ConteudoPush,
): Promise<ResultadoEnvio> {
  configurarVapid();

  const inscricoes = await prisma.pushSubscription.findMany({
    where: { proprietarioId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  const payload = JSON.stringify({
    titulo: conteudo.titulo,
    mensagem: conteudo.mensagem,
    url: conteudo.url ?? "/portal-cliente",
    tag: conteudo.tag,
  });

  const resultado: ResultadoEnvio = { enviados: 0, removidos: 0, falhas: [] };
  const idsEntregues: string[] = [];
  const idsMortos: string[] = [];

  await Promise.all(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: inscricao.endpoint,
            keys: { p256dh: inscricao.p256dh, auth: inscricao.auth },
          },
          payload,
          // TTL: quanto tempo o serviço segura o aviso se o celular estiver
          // offline. 24h — passou disso, a informação já envelheceu.
          { TTL: 60 * 60 * 24 },
        );
        resultado.enviados += 1;
        idsEntregues.push(inscricao.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          idsMortos.push(inscricao.id);
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        resultado.falhas.push(`${status ?? "?"}: ${msg}`);
      }
    }),
  );

  if (idsMortos.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: idsMortos } } });
    resultado.removidos = idsMortos.length;
  }

  if (idsEntregues.length > 0) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: idsEntregues } },
      data: { ultimoEnvioEm: new Date() },
    });
  }

  return resultado;
}
