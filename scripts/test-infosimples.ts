import "dotenv/config";

async function main() {
  const token = process.env.INFOSIMPLES_API_TOKEN;
  if (!token) {
    console.error("INFOSIMPLES_API_TOKEN nao configurado");
    process.exit(1);
  }
  console.log("Token:", token.substring(0, 10) + "...");

  const body = new URLSearchParams({
    token,
    email: "teste@teste.com",
    senha: "senhaqualquer",
    instalacao: "00000000",
    timeout: "60",
  });

  const url = "https://api.infosimples.com/api/v2/consultas/contas/cpfl/download-ocr";
  console.log("Chamando:", url);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  console.log("HTTP Status:", res.status);
  const json = await res.json();
  console.log("Code:", json.code);
  console.log("Message:", json.code_message);
  console.log("Errors:", JSON.stringify(json.errors ?? []));
  if (json.header) console.log("Header:", JSON.stringify(json.header).substring(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
