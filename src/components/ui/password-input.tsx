"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo de senha com o "olho" para conferir o que foi digitado — o mesmo gesto
 * dos cards de credencial do portal (`plant-credentials-form` /
 * `uc-credentials-form`).
 *
 * Aqui o olho só alterna o `type` do input: mostra o que ESTÁ SENDO DIGITADO,
 * nunca uma senha vinda do banco. Revelar senha salva é outra coisa — passa por
 * endpoint próprio, só admin e com log de quem pediu (ver
 * `api/plants/[id]/credentials/senha`).
 *
 * `className` sobrescreve o estilo padrão (o `cn` usa tailwind-merge), então cada
 * tela pode passar as classes dos campos vizinhos e o campo não destoa.
 */
export function PasswordInput({
  className,
  wrapperClassName,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  /**
   * Vai no `div` que embrulha o campo. É aqui que entram margens (o `mt-1` que
   * separa do label, por exemplo) — no input elas desalinhariam o olho, que se
   * posiciona pelo centro do wrapper.
   */
  wrapperClassName?: string;
}) {
  const [visivel, setVisivel] = React.useState(false);

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input
        {...props}
        type={visivel ? "text" : "password"}
        // pr-9 abre espaço pro botão; vem depois do className pra não ser
        // sobrescrito por um padding da tela e o texto passar por baixo do olho.
        className={cn(className, "pr-9")}
      />
      <button
        type="button"
        // Fora da navegação por Tab: quem está preenchendo o formulário segue
        // direto pro próximo campo, como nos cards de credencial.
        tabIndex={-1}
        onClick={() => setVisivel((v) => !v)}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {visivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
