import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const c = await prisma.cpflCredential.count({
    where: { consumerUnit: { distribuidora: "RGE", active: true } },
  });
  console.log("Total RGE com credencial:", c);
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
