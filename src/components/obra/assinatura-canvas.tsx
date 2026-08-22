"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/**
 * Campo de assinatura a mão livre. Funciona com dedo (celular/tablet),
 * caneta e mouse — usa Pointer Events, que cobrem os três.
 *
 * Emite PNG data URL em `onChange` só quando o traço termina, não a cada
 * movimento: assinar não pode disparar um PUT por pixel.
 *
 * ⚠️ O traço saía DESLOCADO PARA A DIREITA, e o desvio crescia conforme se
 * escrevia. Causa: o bitmap do canvas era dimensionado uma vez no mount e só
 * re-sincronizava no `resize` da janela. Qualquer outra mudança de largura da
 * caixa (layout assentando, barra de rolagem, reflow do grid) deixava o bitmap
 * menor que o box CSS — e o navegador ESTICA o bitmap para preencher, então o
 * erro é proporcional a x. Daí a sensação de a assinatura "fugir" para a
 * direita. Duas defesas agora:
 *   1. ResizeObserver no próprio canvas, não na janela;
 *   2. `pos()` converte a coordenada dividindo o descompasso, então o traço
 *      cai sob o cursor mesmo num instante em que os dois estejam fora de sync.
 */
export function AssinaturaCanvas({
  titulo,
  descricao,
  nome,
  valor,
  disabled,
  onChangeNome,
  onChange,
}: {
  titulo: string;
  descricao: string;
  nome: string;
  valor: string | null;
  disabled?: boolean;
  onChangeNome: (v: string) => void;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);
  // O que o canvas deve estar mostrando. Lido pelo ResizeObserver, que não tem
  // como enxergar o state mais recente por closure.
  const imagemRef = useRef<string | null>(valor);

  const [imagem, setImagem] = useState<string | null>(valor);
  const [assinado, setAssinado] = useState(!!valor);
  // Rastreadores para ajustar estado quando a prop muda durante o render
  // (padrão do React) em vez de num efeito, que cascatearia re-render.
  const [valorAnterior, setValorAnterior] = useState<string | null>(valor);
  const [emitido, setEmitido] = useState<string | null>(null);

  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    // Valor trocado por fora (recarga da tela, reabertura da retirada). O que
    // veio do nosso próprio traço já está desenhado — ignora.
    if (valor !== emitido) {
      setImagem(valor);
      setAssinado(!!valor);
    }
  }

  // Casa o bitmap com o tamanho exibido e repõe a assinatura guardada.
  const desenhar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const largura = canvas.clientWidth;
    const altura = canvas.clientHeight;
    if (!largura || !altura) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, largura, altura);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    const src = imagemRef.current;
    if (src) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, largura, altura);
      img.src = src;
    }
  }, []);

  // Observa o canvas, não a janela: a caixa muda de largura por reflow, por
  // barra de rolagem e por troca de breakpoint, e nenhum desses dispara
  // `window.resize`. A primeira notificação chega logo no observe(), então
  // este efeito também cobre o desenho inicial.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      // Redesenhar no meio de um traço apagaria o que ainda não virou PNG.
      if (desenhando.current) return;
      desenhar();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [desenhar]);

  useEffect(() => {
    if (imagemRef.current === imagem) return;
    imagemRef.current = imagem;
    desenhar();
  }, [imagem, desenhar]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Se o bitmap estiver fora de sync com o box exibido, o navegador o estica.
    // Dividir esse fator aqui mantém a tinta sob o cursor de qualquer jeito.
    const escalaX = rect.width ? canvas.width / (dpr * rect.width) : 1;
    const escalaY = rect.height ? canvas.height / (dpr * rect.height) : 1;
    return {
      x: (e.clientX - rect.left) * escalaX,
      y: (e.clientY - rect.top) * escalaY,
    };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Ponto único (um toque seco) também precisa marcar tinta
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
    setAssinado(true);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function onUp() {
    if (!desenhando.current) return;
    desenhando.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    imagemRef.current = dataUrl;
    setImagem(dataUrl);
    setEmitido(dataUrl);
    onChange(dataUrl);
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    imagemRef.current = null;
    setImagem(null);
    setEmitido(null);
    setAssinado(false);
    onChange(null);
  }

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={limpar}
            className="inline-flex h-7 items-center gap-1 rounded border px-2 text-xs text-muted-foreground hover:bg-muted"
            title="Limpar assinatura"
          >
            <Eraser className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>

      <input
        value={nome}
        onChange={(e) => onChangeNome(e.target.value)}
        disabled={disabled}
        placeholder="Nome de quem assina"
        className="mb-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
      />

      {/* A borda fica no wrapper, não no canvas: borda no próprio canvas entra
          no getBoundingClientRect mas não na área de desenho, e vira um
          deslocamento fixo do traço. */}
      <div
        className={`relative overflow-hidden rounded-md border border-dashed bg-white ${
          disabled ? "opacity-70" : ""
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onPointerCancel={onUp}
          className={`block h-32 w-full ${
            disabled ? "cursor-not-allowed" : "cursor-crosshair"
          }`}
          style={{ touchAction: "none" }}
        />
        {!assinado && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            {disabled ? "Sem assinatura" : "Assine aqui com o dedo ou o mouse"}
          </span>
        )}
      </div>
    </div>
  );
}
