"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Viewer de PDF que renderiza as páginas em <canvas> via pdf.js.
 *
 * Motivo: tablets (iOS Safari e vários Android) NÃO renderizam PDF dentro de
 * <iframe> — mostram apenas um prompt "abrir PDF". Renderizar em canvas com
 * pdf.js funciona em qualquer dispositivo. O worker é servido de
 * /pdf.worker.min.mjs (copiado de pdfjs-dist em public/).
 *
 * A URL é same-origin e protegida por sessão admin; o cookie é enviado
 * automaticamente (withCredentials garante mesmo em edge cases).
 */
export function ReportPdfViewer({
  url,
  fallbackHref,
}: {
  url: string;
  fallbackHref: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      try {
        setStatus("loading");

        // Tablets antigos (Safari/Android desatualizados) não têm
        // Promise.withResolvers, usado pelo pdf.js — polyfill antes de importar.
        const P = globalThis.Promise as PromiseConstructor & {
          withResolvers?: unknown;
        };
        if (typeof P.withResolvers !== "function") {
          (P as { withResolvers: unknown }).withResolvers = function <T>() {
            let resolve!: (v: T | PromiseLike<T>) => void;
            let reject!: (r?: unknown) => void;
            const promise = new Promise<T>((res, rej) => {
              resolve = res;
              reject = rej;
            });
            return { promise, resolve, reject };
          };
        }

        // Build "legacy" do pdf.js: transpilado para navegadores mais antigos
        // (o build padrão quebra em tablets desatualizados).
        const pdfjs: typeof import("pdfjs-dist") = await import(
          "pdfjs-dist/legacy/build/pdf.mjs"
        );
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const task = pdfjs.getDocument({ url, withCredentials: true });
        const pdf = await task.promise;
        if (cancelled) return;

        container.replaceChildren();

        // Renderiza em alta resolução para telas retina, mas limita o custo.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetWidth = Math.max(container.clientWidth || 800, 320);

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;

          const base = page.getViewport({ scale: 1 });
          const cssScale = targetWidth / base.width;
          const viewport = page.getViewport({ scale: cssScale * dpr });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.style.borderRadius = "6px";
          canvas.style.boxShadow = "0 2px 10px rgba(0,0,0,.25)";
          if (i < pdf.numPages) canvas.style.marginBottom = "12px";

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          container.appendChild(canvas);

          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (cancelled) return;
        }

        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="pg-pdfcanvaswrap">
      {status === "loading" && (
        <div className="pg-pdfmsg">Carregando relatório…</div>
      )}
      {status === "error" && (
        <div className="pg-pdfmsg">
          Não foi possível exibir o relatório aqui.{" "}
          <a href={fallbackHref} target="_blank" rel="noopener noreferrer">
            Abrir em nova aba
          </a>
          .
        </div>
      )}
      <div ref={containerRef} className="pg-pdfpages" />
    </div>
  );
}
