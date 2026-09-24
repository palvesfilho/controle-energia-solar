/**
 * Template "Informar Rateio" do portal da RGE, já preenchido com o rateio
 * montado na tela — o operador sobe o arquivo no portal e recebe o protocolo.
 *
 * Cabeçalho copiado do `Template-InformarRateio.csv` que a RGE fornece
 * (enviado pelo Paulo em 23/09/2026): `uc,cpf_cnpj,rateio,uc_ancora`.
 * Formato confirmado por ele: vírgula entre colunas, percentual com PONTO e
 * 2 casas, âncora `S`/`N`, UC e CPF/CNPJ só com dígitos.
 *
 * As linhas são exatamente os itens que o rateio vai gravar (mesmo filtro do
 * `montarItems` da tela, geradora a 0% inclusa) — arquivo e rateio salvo não
 * podem divergir.
 */

export const CABECALHO_TEMPLATE_RGE = "uc,cpf_cnpj,rateio,uc_ancora";

export interface LinhaTemplateRge {
  codigoUc: string | null;
  cpfCnpj: string | null;
  percentual: number;
  ancora: boolean;
}

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Problemas que tornam o arquivo incompleto — a tela mostra, não esconde. */
export function avisosTemplateRge(linhas: LinhaTemplateRge[]): string[] {
  const avisos: string[] = [];
  const semUc = linhas.filter((l) => !digitos(l.codigoUc)).length;
  const semDoc = linhas.filter((l) => !digitos(l.cpfCnpj)).length;
  const ancoras = linhas.filter((l) => l.ancora).length;
  if (semUc) avisos.push(`${semUc} UC${semUc > 1 ? "s" : ""} sem código`);
  if (semDoc) avisos.push(`${semDoc} UC${semDoc > 1 ? "s" : ""} sem CPF/CNPJ`);
  // Âncora é a de maior consumo; empate ou consumo desconhecido não se decide
  // aqui — o arquivo sai como a tela marcou, e o operador confere.
  if (ancoras === 0) avisos.push("nenhuma UC âncora (sem consumo conhecido) — marque uma com S");
  if (ancoras > 1) avisos.push(`${ancoras} UCs âncora empatadas — deixe só uma com S`);
  return avisos;
}

export function montarCsvTemplateRge(linhas: LinhaTemplateRge[]): string {
  const corpo = linhas.map((l) =>
    [digitos(l.codigoUc), digitos(l.cpfCnpj), l.percentual.toFixed(2), l.ancora ? "S" : "N"].join(","),
  );
  return [CABECALHO_TEMPLATE_RGE, ...corpo].join("\r\n") + "\r\n";
}

export function baixarCsvTemplateRge(linhas: LinhaTemplateRge[], nomeUsina: string) {
  const blob = new Blob([montarCsvTemplateRge(linhas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = nomeUsina
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  a.href = url;
  a.download = `Template-InformarRateio-${slug || "usina"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
