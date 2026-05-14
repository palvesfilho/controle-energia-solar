import bwipjs from "bwip-js/node";

/**
 * Gera PNG do codigo de barras (formato ITF/Interleaved 2 of 5) do boleto.
 * Retorna data URL "data:image/png;base64,..."
 */
export async function gerarCodigoBarrasPng(linhaDigitavel: string): Promise<string> {
  // linha digitavel tem 47 digitos com separadores; codigo de barras de fato tem 44 digitos
  const digits = linhaDigitavel.replace(/\D/g, "");
  const barcode = digits.length === 47 ? linhaDigitavelToCodigoBarras(digits) : digits;

  const pngBuffer = await bwipjs.toBuffer({
    bcid: "interleaved2of5",
    text: barcode,
    scale: 2,
    height: 16,
    includetext: false,
    backgroundcolor: "FFFFFF",
  });

  return `data:image/png;base64,${Buffer.from(pngBuffer).toString("base64")}`;
}

/**
 * Converte linha digitavel (47 digitos) em codigo de barras (44 digitos).
 * Formato boleto bancario brasileiro.
 */
function linhaDigitavelToCodigoBarras(linha: string): string {
  if (linha.length !== 47) return linha;
  return (
    linha.slice(0, 4) +
    linha.slice(32, 33) +
    linha.slice(33, 47) +
    linha.slice(4, 9) +
    linha.slice(10, 20) +
    linha.slice(21, 31)
  );
}
