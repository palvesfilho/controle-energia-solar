import { Leaf, Sun, Droplets, Wind } from "lucide-react";
import { brand, brandGradient } from "@/lib/brand-colors";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel - hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 text-white">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1920&auto=format&fit=crop')",
          }}
        />
        {/* Brand gradient overlay (espelha capa do PDF do investidor) */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${brand.tealDark}EE 0%, ${brand.teal}E6 50%, ${brand.orange}D9 100%)`,
          }}
        />
        {/* Círculos decorativos translúcidos, ecoando a capa do PDF */}
        <div
          className="absolute -top-24 -right-20 h-72 w-72 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
        />
        <div
          className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        />

        {/* Content over image */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg backdrop-blur-sm border border-white/20 flex items-center justify-center"
              style={{ background: brandGradient }}
            >
              <Leaf className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">AURA</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Energia limpa,{" "}
            <span style={{ color: brand.orangeLight }}>futuro sustentável</span>
          </h1>
          <p className="text-lg text-white/85 max-w-md">
            Acompanhe a geração de energia solar das suas usinas, visualize
            relatórios e contribua para um planeta mais verde.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 pt-2">
            <div className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-2 text-sm">
              <Sun className="h-4 w-4" style={{ color: brand.orangeLight }} />
              <span>Energia Solar</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-2 text-sm">
              <Droplets className="h-4 w-4 text-white/85" />
              <span>Sustentabilidade</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-2 text-sm">
              <Wind className="h-4 w-4 text-white/85" />
              <span>Energia Limpa</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-8 pt-4">
            <div>
              <p
                className="text-3xl font-bold"
                style={{ color: brand.orangeLight }}
              >
                12.000+
              </p>
              <p className="text-sm text-white/65">kWh gerados</p>
            </div>
            <div>
              <p
                className="text-3xl font-bold"
                style={{ color: brand.orangeLight }}
              >
                R$ 2M+
              </p>
              <p className="text-sm text-white/65">economizados</p>
            </div>
            <div>
              <p
                className="text-3xl font-bold"
                style={{ color: brand.orangeLight }}
              >
                12
              </p>
              <p className="text-sm text-white/65">usinas ativas</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full animate-pulse"
            style={{ backgroundColor: brand.orangeLight }}
          />
          <p className="text-sm text-white/60">
            AURA - Gestão de Energia Sustentável
          </p>
        </div>
      </div>

      {/* Right panel - form area */}
      <div
        className="flex w-full lg:w-1/2 items-center justify-center p-6"
        style={{
          background: `linear-gradient(180deg, #ffffff 0%, ${brand.teal}0D 100%)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
