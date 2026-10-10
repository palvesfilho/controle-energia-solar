"use client";

/**
 * Botão + janela do pacote de documentos que a RGE pede ao registrar um rateio.
 *
 * A janela abre CONFERINDO, e só depois oferece o download: o ZIP vai para a
 * concessionária, e o que falta nele precisa aparecer antes de o operador subir
 * o arquivo, não na devolução do protocolo. Quem monta o pacote é o servidor —
 * ver [[rateio-pacote-rge]].
 *
 * Os três documentos da associação (CNH, cartão CNPJ, constituição) são
 * enviados aqui mesmo, uma vez, e passam a valer para todo rateio.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CircleCheck,
  CircleX,
  Download,
  FileArchive,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCodigoUc } from "@/lib/uc-codigo";
import {
  AtalhoCartaoCnpj,
  TextoValidadeCartaoCnpj,
} from "@/components/rateios/validade-cartao-cnpj";
import type {
  ChaveDocFixo,
  ConferenciaPacoteRge,
  EstadoDoc,
} from "@/lib/rateio-pacote-rge";

interface Props {
  plantId: string;
  /** UCs do rateio, na ordem em que aparecem na tela. */
  consumerUnitIds: string[];
  /** `linha` = botão discreto, para a barra de ações de um rateio já gravado. */
  aparencia?: "botao" | "linha";
}

function Marca({ estado }: { estado: EstadoDoc }) {
  if (estado === "ok") return <CircleCheck className="mx-auto h-4 w-4 text-emerald-600" />;
  return (
    <span
      className="inline-flex items-center gap-1 text-red-600"
      title={
        estado === "falta"
          ? "Não está no cadastro desta UC"
          : "Está no cadastro, mas o arquivo não abriu"
      }
    >
      <CircleX className="h-4 w-4" />
      {estado === "ilegivel" && <span className="text-[11px]">não abriu</span>}
    </span>
  );
}

export function PacoteDocumentosRge({ plantId, consumerUnitIds, aparencia = "botao" }: Props) {
  const [open, setOpen] = useState(false);
  const [conf, setConf] = useState<ConferenciaPacoteRge | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [enviando, setEnviando] = useState<ChaveDocFixo | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const chaveEscolhida = useRef<ChaveDocFixo | null>(null);
  // Envio dos documentos do titular da usina — grava no mesmo cadastro do
  // cartão "Documentos" da página da usina.
  const [enviandoUsina, setEnviandoUsina] = useState<string | null>(null);
  const inputUsina = useRef<HTMLInputElement>(null);
  const tipoUsinaEscolhido = useRef<string | null>(null);

  // A lista vira texto para o efeito não refazer a conferência a cada render do
  // pai, que monta um array novo toda vez.
  const idsChave = consumerUnitIds.join(",");

  const conferir = useCallback(async () => {
    setConferindo(true);
    setErro(null);
    try {
      const res = await fetch(`/api/plants/${plantId}/rateios/documentos-rge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerUnitIds: idsChave.split(",").filter(Boolean) }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
      setConf(dados as ConferenciaPacoteRge);
    } catch (err) {
      setConf(null);
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setConferindo(false);
    }
  }, [plantId, idsChave]);

  useEffect(() => {
    if (open) void conferir();
  }, [open, conferir]);

  async function baixar() {
    setBaixando(true);
    try {
      const res = await fetch(`/api/plants/${plantId}/rateios/documentos-rge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerUnitIds, baixar: true }),
      });
      if (!res.ok) {
        const dados = await res.json().catch(() => ({}));
        throw new Error(dados.error ?? `HTTP ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `Documentos RGE - Usina ${conf?.usina ?? ""}.zip`.replace(/[\\/:*?"<>|]/g, "-");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Não consegui gerar o ZIP: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBaixando(false);
    }
  }

  async function enviarFixo(arquivo: File) {
    const chave = chaveEscolhida.current;
    if (!chave) return;
    setEnviando(chave);
    try {
      const form = new FormData();
      form.append("chave", chave);
      form.append("arquivo", arquivo);
      const res = await fetch("/api/rateios/documentos-fixos", { method: "POST", body: form });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
      toast.success("Documento guardado. Vale para todos os rateios.");
      await conferir();
    } catch (err) {
      toast.error(`Falha ao enviar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEnviando(null);
    }
  }

  async function enviarDaUsina(arquivo: File) {
    const tipo = tipoUsinaEscolhido.current;
    if (!tipo) return;
    setEnviandoUsina(tipo);
    try {
      const form = new FormData();
      form.append("type", tipo);
      form.append("file", arquivo);
      const res = await fetch(`/api/plants/${plantId}/documents`, { method: "POST", body: form });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
      toast.success("Documento da usina guardado.");
      await conferir();
    } catch (err) {
      toast.error(`Falha ao enviar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEnviandoUsina(null);
    }
  }

  const du = conf?.documentosUsina;
  const linhasUsina: { tipo: string; rotulo: string; estado: EstadoDoc }[] = du
    ? [
        { tipo: "CNH_RG", rotulo: "Identidade (CNH / RG)", estado: du.identidade },
        ...(du.cartaoCnpj
          ? [{ tipo: "CARTAO_CNPJ", rotulo: "Cartão CNPJ", estado: du.cartaoCnpj }]
          : []),
        ...(du.contratoSocial
          ? [{ tipo: "CONTRATO_SOCIAL", rotulo: "Contrato social", estado: du.contratoSocial }]
          : []),
        { tipo: "PROCURACAO", rotulo: "Procuração", estado: du.procuracao },
        { tipo: "TERMO_ADESAO", rotulo: "Termo de adesão", estado: du.termo },
      ]
    : [];
  const usinaFaltando = linhasUsina.filter((l) => l.estado !== "ok").length;

  const semAntigo = conf?.associados.filter((a) => !a.codigoAntigo) ?? [];
  const citaNovo = conf?.associados.filter((a) => a.procuracaoCita === "novo") ?? [];
  const semDocumento =
    conf?.associados.filter((a) =>
      [a.identidade, a.cartaoCnpj, a.contratoSocial, a.procuracao, a.termo].some(
        (e) => e !== null && e !== "ok",
      ),
    ) ?? [];
  const fixosFaltando = conf?.fixos.filter((f) => f.estado !== "ok") ?? [];
  const foraDoPrazo = (s?: string) => s === "vencido" || s === "vencendo";
  const cartoesForaDoPrazo =
    (conf?.associados.filter((a) => foraDoPrazo(a.cartaoCnpjValidade?.situacao)).length ?? 0) +
    (conf?.fixos.filter((f) => foraDoPrazo(f.validade?.situacao)).length ?? 0);
  const nadaParaBaixar = !conf || conf.arquivos.length === 0;

  return (
    <>
      {aparencia === "linha" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-foreground hover:bg-muted"
          title="ZIP com os documentos que a RGE pede para registrar este rateio"
        >
          <FileArchive className="h-3 w-3" />
          Documentos RGE
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          <FileArchive className="h-3.5 w-3.5" />
          Documentos para a RGE (ZIP)
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => !baixando && setOpen(v)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Documentos para a RGE{conf ? ` — ${conf.usina}` : ""}</DialogTitle>
            <DialogDescription>
              Um ZIP com a identificação (identidade, procuração e, nas empresas, cartão CNPJ
              e contrato social) e os termos de adesão do titular da usina e dos associados
              deste rateio, mais os três documentos da associação. Confira o que falta antes de subir no
              portal.
            </DialogDescription>
          </DialogHeader>

          {conferindo && !conf ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Conferindo os documentos de {consumerUnitIds.length} UC
              {consumerUnitIds.length === 1 ? "" : "s"}…
            </div>
          ) : erro ? (
            <p className="py-4 text-sm text-destructive">Não consegui conferir: {erro}</p>
          ) : conf ? (
            <div className="space-y-4">
              {/* A regra que mais devolve protocolo, dita antes de tudo. */}
              {(citaNovo.length > 0 || semAntigo.length > 0) && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold">
                      A RGE só aceita estes documentos com o código ANTIGO da UC.
                    </p>
                    {citaNovo.length > 0 && (
                      <p>
                        {citaNovo.length === 1
                          ? "1 procuração cita"
                          : `${citaNovo.length} procurações citam`}{" "}
                        só o código NOVO. O documento é assinado e não dá para alterar aqui —
                        ele entra no ZIP como está.
                      </p>
                    )}
                    {semAntigo.length > 0 && (
                      <p>
                        {semAntigo.length} UC{semAntigo.length === 1 ? "" : "s"} sem código antigo
                        no cadastro. Use o botão &ldquo;Buscar código&rdquo; na edição da UC.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {cartoesForaDoPrazo > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    <span className="font-semibold">
                      A RGE não aceita cartão CNPJ emitido há mais de 6 meses.
                    </span>{" "}
                    {cartoesForaDoPrazo === 1
                      ? "1 cartão deste pacote já passou de 5 meses"
                      : `${cartoesForaDoPrazo} cartões deste pacote já passaram de 5 meses`}{" "}
                    — veja a data ao lado de cada um.
                  </p>
                </div>
              )}

              {/* O lado que GERA: os documentos do titular da usina abrem os dois PDFs. */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium">
                  Usina — titular{" "}
                  <span className="font-normal text-muted-foreground">
                    {du?.cpfCnpj ? `(${du.cpfCnpj}) ` : ""}— entram antes dos associados nos dois
                    PDFs.{" "}
                    <a
                      href={`/admin/usinas/${plantId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Abrir a usina
                    </a>
                  </span>
                </p>
                <input
                  ref={inputUsina}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void enviarDaUsina(f);
                  }}
                />
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {linhasUsina.map((l) => (
                    <div
                      key={l.tipo}
                      className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                    >
                      {l.estado === "ok" ? (
                        <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <CircleX className="h-4 w-4 shrink-0 text-red-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{l.rotulo}</span>
                        {l.estado !== "ok" && (
                          <span className="block text-[11px] text-muted-foreground">
                            {l.estado === "falta" ? "ainda não enviado" : "não abriu — envie de novo"}
                          </span>
                        )}
                        {l.tipo === "CARTAO_CNPJ" && du?.cartaoCnpjValidade && (
                          <TextoValidadeCartaoCnpj
                            validade={du.cartaoCnpjValidade}
                            curto
                            className="block text-[11px]"
                          />
                        )}
                        {l.tipo === "CARTAO_CNPJ" &&
                          du?.cartaoCnpjValidade &&
                          du.cartaoCnpjValidade.situacao !== "ok" && (
                            <AtalhoCartaoCnpj cnpj={du.cpfCnpj} className="mt-1" />
                          )}
                      </div>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={enviandoUsina !== null}
                        onClick={() => {
                          tipoUsinaEscolhido.current = l.tipo;
                          inputUsina.current?.click();
                        }}
                      >
                        {enviandoUsina === l.tipo ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        {l.estado === "ok" ? "Trocar" : "Enviar"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs font-medium">
                Associados{" "}
                <span className="font-normal text-muted-foreground">
                  — as unidades consumidoras que recebem os créditos
                </span>
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Associado</th>
                      <th className="px-2 py-1.5 font-medium">UC antiga</th>
                      <th className="px-2 py-1.5 text-center font-medium">Identidade</th>
                      <th className="px-2 py-1.5 text-center font-medium">Cartão CNPJ</th>
                      <th className="px-2 py-1.5 text-center font-medium">Contrato social</th>
                      <th className="px-2 py-1.5 text-center font-medium">Procuração</th>
                      <th className="px-2 py-1.5 text-center font-medium">Termo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conf.associados.map((a) => (
                      <tr key={a.consumerUnitId} className="border-t align-top">
                        <td className="px-2 py-1.5">{a.nome}</td>
                        <td className="px-2 py-1.5 font-mono">
                          {a.codigoAntigo ? (
                            a.codigoAntigo
                          ) : (
                            <span className="font-sans text-amber-700 dark:text-amber-500">
                              sem código antigo
                              {a.codigoUc && (
                                <span className="block font-mono text-[11px] text-muted-foreground">
                                  nova: {formatCodigoUc(a.codigoUc)}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Marca estado={a.identidade} />
                        </td>
                        {/* Traço = pessoa física: o documento não se aplica. */}
                        <td className="px-2 py-1.5 text-center">
                          {a.cartaoCnpj ? <Marca estado={a.cartaoCnpj} /> : "—"}
                          {a.cartaoCnpjValidade && (
                            <TextoValidadeCartaoCnpj
                              validade={a.cartaoCnpjValidade}
                              curto
                              className="block text-[11px]"
                            />
                          )}
                          {a.cartaoCnpjValidade && a.cartaoCnpjValidade.situacao !== "ok" && (
                            <AtalhoCartaoCnpj
                              cnpj={a.cpfCnpj}
                              consumerUnitId={a.consumerUnitId}
                              onTrocado={() => void conferir()}
                              className="mt-1 justify-center"
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {a.contratoSocial ? <Marca estado={a.contratoSocial} /> : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Marca estado={a.procuracao} />
                          {a.procuracaoCita === "novo" && (
                            <span className="block text-[11px] text-amber-700 dark:text-amber-500">
                              cita a UC nova
                            </span>
                          )}
                          {a.procuracaoCita === "nenhum" && (
                            <span className="block text-[11px] text-amber-700 dark:text-amber-500">
                              não cita esta UC
                            </span>
                          )}
                          {a.procuracaoCita === "sem_texto" && (
                            <span className="block text-[11px] text-muted-foreground">
                              escaneada — confira à mão
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Marca estado={a.termo} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {semDocumento.length > 0 && (
                <p className="text-xs text-red-700 dark:text-red-400">
                  {semDocumento.length} UC{semDocumento.length === 1 ? "" : "s"} sem algum
                  documento guardado. Só as UCs que vieram da fila do CRM têm os arquivos no
                  cadastro; as demais ficam de fora do ZIP.
                </p>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-medium">
                  Documentos da associação{" "}
                  <span className="font-normal text-muted-foreground">
                    — enviados uma vez, valem para todo rateio.{" "}
                    <a
                      href="/admin/personalizacoes/documentos-associacao"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Ver o cadastro
                    </a>
                  </span>
                </p>
                <input
                  ref={inputArquivo}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void enviarFixo(f);
                  }}
                />
                {conf.fixos.map((f) => (
                  <div
                    key={f.chave}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                  >
                    {f.estado === "ok" ? (
                      <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <CircleX className="h-4 w-4 shrink-0 text-red-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{f.rotulo}</span>
                      {f.validade && f.estado === "ok" && (
                        <TextoValidadeCartaoCnpj validade={f.validade} className="block text-[11px]" />
                      )}
                      {f.validade && f.validade.situacao !== "ok" && f.estado === "ok" && (
                        <AtalhoCartaoCnpj cnpj={f.cnpj} className="mt-1" />
                      )}
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {f.estado === "falta"
                          ? "ainda não enviado"
                          : f.estado === "ilegivel"
                            ? `${f.nome ?? "arquivo"} — não abriu, envie de novo`
                            : `${f.nome ?? "arquivo"}${
                                f.enviadoEm
                                  ? ` · enviado em ${new Date(f.enviadoEm).toLocaleDateString("pt-BR")}`
                                  : ""
                              }`}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={enviando !== null}
                      onClick={() => {
                        chaveEscolhida.current = f.chave;
                        inputArquivo.current?.click();
                      }}
                    >
                      {enviando === f.chave ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      {f.estado === "ok" ? "Trocar" : "Enviar"}
                    </Button>
                  </div>
                ))}
              </div>

              <div className="rounded-md bg-muted/40 p-2.5 text-xs">
                <p className="font-medium">
                  {conf.arquivos.length === 0
                    ? "Nenhum arquivo para montar ainda."
                    : `O ZIP sai com ${conf.arquivos.length} de 5 arquivos:`}
                </p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {conf.arquivos.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={baixando} onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <Button type="button" disabled={baixando || conferindo || nadaParaBaixar} onClick={baixar}>
              {baixando ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Montando o ZIP…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  {semDocumento.length > 0 || fixosFaltando.length > 0 || usinaFaltando > 0
                    ? "Baixar ZIP incompleto"
                    : "Baixar ZIP"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
