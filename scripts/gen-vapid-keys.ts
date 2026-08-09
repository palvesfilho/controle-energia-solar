/**
 * Gera o par de chaves VAPID usado pelas notificações push do Portal do Cliente.
 *
 *   npx tsx scripts/gen-vapid-keys.ts
 *
 * VAPID é só um par de chaves que identifica QUEM envia o push. Não há serviço
 * externo nem custo: o navegador do cliente guarda a chave pública na inscrição
 * e o servidor assina cada envio com a privada.
 *
 * ⚠️ Trocar as chaves INVALIDA todas as inscrições existentes — os celulares já
 * inscritos param de receber e precisam autorizar de novo. Gere uma vez e
 * guarde; use o mesmo par em dev e em produção enquanto for teste.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("Cole no .env local e nas variáveis do Railway:\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:contato@solvesm.eng.br`);
console.log(
  "\nA chave pública é servida ao navegador por /api/portal-cliente/push/chave,",
);
console.log("então NÃO precisa de NEXT_PUBLIC_ nem de rebuild ao trocar.");
