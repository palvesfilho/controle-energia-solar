"use client";

/**
 * Janela para escolher a empresa que executou o sistema, quando não foi a
 * Brasil Solar. Abre sozinha ao marcar "Terceiro" no cadastro.
 *
 * Três coisas acontecem aqui:
 *  1. escolher uma empresa da lista;
 *  2. "Cadastrar nova" quando ela não existe ainda;
 *  3. RENOMEAR uma existente — que é como se conserta o caso de a mesma empresa
 *     ter entrado duas vezes com nomes ligeiramente diferentes.
 *
 * 🔑 O item 3 só resolve porque renomear para um nome que já existe **junta** as
 * duas (a API devolve 409 com a contagem, e aqui se confirma). Renomear sem
 * juntar deixaria os clientes divididos entre duas entradas — exatamente o
 * problema que se quer desfazer.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, Check, Pencil, Plus, Search, Merge, Loader2 } from "lucide-react";

interface Empresa {
  id: string;
  nome: string;
  _count?: { proprietarios: number };
}

interface Colisao {
  alvo: { id: string; nome: string; clientes: number };
  origem: { id: string; nome: string; clientes: number };
}

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Empresa já escolhida (para marcar na lista). */
  value: string;
  /** Devolve id + nome — o nome é usado no resumo do formulário. */
  onSelect: (empresa: { id: string; nome: string }) => void;
}

export function EmpresaTerceiraDialog({ open, onOpenChange, value, onSelect }: Props) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Modo "cadastrar nova"
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");

  // Modo "renomear" — id da empresa em edição
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [colisao, setColisao] = useState<Colisao | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/brasil-solar/empresas-terceiras");
      const d = await r.json();
      setEmpresas(d.empresas ?? []);
    } catch {
      setErro("Não foi possível carregar a lista");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void carregar();
      setBusca("");
      setErro(null);
      setCriando(false);
      setNovoNome("");
      setEditandoId(null);
      setColisao(null);
    }
  }, [open, carregar]);

  const filtradas = empresas.filter((e) =>
    e.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  async function criar() {
    const nome = novoNome.trim();
    if (nome.length < 2) {
      setErro("Informe o nome da empresa");
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/brasil-solar/empresas-terceiras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data?.error ?? "Não foi possível cadastrar");
        return;
      }
      await carregar();
      onSelect(data.empresa);
      onOpenChange(false);
    } catch {
      setErro("Falha de rede ao cadastrar");
    } finally {
      setOcupado(false);
    }
  }

  async function renomear(id: string, merge = false) {
    const nome = nomeEditado.trim();
    if (nome.length < 2) {
      setErro("Informe o nome da empresa");
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch(`/api/brasil-solar/empresas-terceiras/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, merge }),
      });
      const data = await res.json();

      if (res.status === 409 && data?.error === "NOME_JA_EXISTE") {
        setColisao({ alvo: data.alvo, origem: data.origem });
        return;
      }
      if (!res.ok) {
        setErro(data?.error ?? "Não foi possível renomear");
        return;
      }

      await carregar();
      setEditandoId(null);
      setColisao(null);
      // Se a empresa selecionada foi absorvida pela junção, o vínculo passa a
      // ser a que sobrou — senão o formulário guardaria um id que não existe mais.
      if (data.juntou && value === id) onSelect(data.empresa);
      if (data.juntou) {
        setErro(
          `Empresas juntadas — ${data.clientesMovidos} cliente(s) passaram para "${data.empresa.nome}".`,
        );
      }
    } catch {
      setErro("Falha de rede ao renomear");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Empresa que executou o sistema
          </DialogTitle>
          <DialogDescription>
            O sistema deste cliente não foi executado pela Brasil Solar. Escolha
            quem executou.
          </DialogDescription>
        </DialogHeader>

        {/* Confirmação da junção — substitui a lista enquanto está pendente */}
        {colisao ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium flex items-center gap-1.5">
                <Merge className="h-4 w-4" />
                Já existe uma empresa com esse nome
              </p>
              <p className="mt-2 text-xs leading-relaxed">
                <strong>{colisao.alvo.nome}</strong> — {colisao.alvo.clientes} cliente(s)
                <br />
                <strong>{colisao.origem.nome}</strong> — {colisao.origem.clientes} cliente(s)
              </p>
              <p className="mt-2 text-xs leading-relaxed">
                Juntar move os {colisao.origem.clientes} cliente(s) de{" "}
                <strong>{colisao.origem.nome}</strong> para{" "}
                <strong>{colisao.alvo.nome}</strong> e apaga a entrada duplicada.
                Nenhum cliente é perdido. Não dá para desfazer pela tela.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setColisao(null)} disabled={ocupado}>
                Cancelar
              </Button>
              <Button onClick={() => void renomear(colisao.origem.id, true)} disabled={ocupado}>
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Juntar as duas"}
              </Button>
            </div>
          </div>
        ) : criando ? (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nome da nova empresa</label>
              <input
                autoFocus
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void criar();
                  }
                }}
                placeholder="Ex.: Solar Sul Engenharia"
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg bg-background"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Se já existir uma com esse nome, ela é selecionada em vez de duplicar.
              </p>
            </div>
            {erro && <p className="text-xs text-amber-700">{erro}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCriando(false)} disabled={ocupado}>
                Voltar
              </Button>
              <Button onClick={() => void criar()} disabled={ocupado}>
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar e usar"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar empresa…"
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg bg-background"
              />
            </div>

            <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
              {carregando ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
              ) : filtradas.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {empresas.length === 0
                    ? "Nenhuma empresa cadastrada ainda."
                    : "Nenhuma empresa encontrada com esse nome."}
                </p>
              ) : (
                filtradas.map((e) =>
                  editandoId === e.id ? (
                    <div key={e.id} className="flex gap-2 p-1">
                      <input
                        autoFocus
                        value={nomeEditado}
                        onChange={(ev) => setNomeEditado(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") {
                            ev.preventDefault();
                            void renomear(e.id);
                          }
                          if (ev.key === "Escape") {
                            ev.preventDefault();
                            setEditandoId(null);
                          }
                        }}
                        className="flex-1 px-2 py-1.5 text-sm border rounded-md bg-background"
                      />
                      <Button size="sm" onClick={() => void renomear(e.id)} disabled={ocupado}>
                        Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditandoId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div
                      key={e.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                        value === e.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelect({ id: e.id, nome: e.nome });
                          onOpenChange(false);
                        }}
                        className="flex-1 text-left text-sm"
                      >
                        {e.nome}
                        {e._count && e._count.proprietarios > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {e._count.proprietarios} cliente(s)
                          </span>
                        )}
                      </button>
                      {value === e.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                      <button
                        type="button"
                        title="Renomear (renomear para um nome existente junta as duas)"
                        onClick={() => {
                          setEditandoId(e.id);
                          setNomeEditado(e.nome);
                          setErro(null);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ),
                )
              )}
            </div>

            {erro && <p className="text-xs text-amber-700">{erro}</p>}

            <DialogFooter className="sm:justify-between gap-2">
              <Button variant="outline" onClick={() => { setCriando(true); setErro(null); }}>
                <Plus className="h-4 w-4 mr-1" />
                Cadastrar nova
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
