import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

// Destino do link do convite de acesso. O Clerk anexa `__clerk_ticket` na URL e
// o <SignUp> consome o ticket sozinho: o email já vem preenchido e a pessoa só
// define a senha. Sem ticket, o sign-up está em "Invite-only" no painel do
// Clerk e recusa — esta tela não reabre o auto-cadastro.
//
// Antes (até 25/09/2026) o convite apontava para a home do role (/admin,
// /painel…), que é rota protegida: o middleware mandava a pessoa anônima para
// /login-clerk SEM o ticket, e ela caía no <SignIn> com "usuário não existe".
export default function ClerkCadastroPage() {
  return (
    <div className="w-full max-w-md">
      {/* Logo compacta para mobile */}
      <div className="md:hidden text-center mb-6">
        <div className="font-extrabold text-2xl mb-1">
          <span className="font-light text-[#8A9298]">gestor</span>
          <span className="text-[#0C3948]">AURA</span>
          <span className="text-[#EA6E2C]">solar</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#8A9298]">
          Gestão de Energia Sustentável
        </div>
      </div>

      <SignUp
        path="/cadastro-clerk"
        routing="path"
        signInUrl="/login-clerk"
        fallbackRedirectUrl="/portal"
        forceRedirectUrl="/portal"
        appearance={clerkAppearance}
      />
    </div>
  );
}
