"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/**
 * Campo de assinatura a mão livre. Funciona com dedo (celular/tablet),
 * caneta e mouse — usa Pointer Events, que cobrem os três.
 *
 * Emite PNG data URL em `onChange` só quando o traço termina, não a cada
 * movimento: assinar não pode disparar um PUT por pixel.
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
  // O que o canvas já está mostrando. Sem isso, o `valor` que volta do nosso
  // próprio onChange redesenharia por cima — e o redesenho é assíncrono
  // (img.onload), o que pisca e pode comer o traço seguinte.
  const noCanvas = useRef<string | null>(valor);

  const [imagem, setImagem] = useState<string | null>(valor);
  const [assinado, setAssinado] = useState(!!valor);
  // Rastreadores para ajustar estado quando a prop muda, durante o render
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

  // Redimensiona para a densidade da tela e desenha a assinatura recebida.
  const preparar = useCallback((src: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    if (src) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = src;
    }
  }, []);

  useEffect(() => {
    if (noCanvas.current === imagem && canvasRef.current?.width) return;
    noCanvas.current = imagem;
    preparar(imagem);
  }, [imagem, preparar]);

  useEffect(() => {
    const redesenhar = () => preparar(imagem);
    window.addEventListener("resize", redesenhar);
    return () => window.removeEventListener("resize", redesenhar);
  }, [imagem, preparar]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
    noCanvas.current = dataUrl;
    setImagem(dataUrl);
    setEmitido(dataUrl);
    onChange(dataUrl);
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    noCanvas.current = null;
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

      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onPointerCancel={onUp}
          className={`h-32 w-full rounded-md border border-dashed bg-white ${
            disabled ? "cursor-not-allowed opacity-70" : "cursor-crosshair"
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
