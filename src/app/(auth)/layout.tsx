"use client";

import { useMemo } from "react";

const LOGIN_IMAGES = [
  "/login/FACHADA_EMPRESA.jpg",
  "/login/1.jpg",
  "/login/2.jpg",
  "/login/3.jpg",
  "/login/4.jpg",
  "/login/5.jpg",
  "/login/6.jpg",
  "/login/7.jpg",
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const imagemFundo = useMemo(
    () => LOGIN_IMAGES[Math.floor(Math.random() * LOGIN_IMAGES.length)],
    [],
  );

  return (
    <div
      className="min-h-screen flex bg-[#F5F5F2]"
      style={{ fontFamily: "var(--font-inter)" }}
    >
      {/* Painel esquerdo: foto da fachada com overlay petrol (esconde no mobile) */}
      <div className="hidden md:flex md:flex-[3] text-white items-end p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${imagemFundo})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(110deg, rgba(15,42,52,0.92) 0%, rgba(15,42,52,0.78) 45%, rgba(15,42,52,0.35) 100%)",
          }}
        />
        <div className="relative z-10 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
          <div className="font-extrabold text-3xl mb-2 tracking-[0.02em]">
            <span className="font-light text-white/80">gestor</span>
            <span className="text-white">AURA</span>
            <span className="text-[#EA6E2C]">solar</span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/70 mb-6">
            Gestão de Energia Sustentável
          </div>
          <p className="text-white/90 text-base max-w-md leading-relaxed">
            Acompanhe usinas, gerencie energia, gere relatórios e faça vendas em um único lugar.
          </p>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex-1 md:flex-[2] flex items-center justify-center p-6 md:p-12">
        {children}
      </div>
    </div>
  );
}
