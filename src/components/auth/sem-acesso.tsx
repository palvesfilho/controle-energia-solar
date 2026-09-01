"use client";

import { useClerk } from "@clerk/nextjs";
import { ShieldOff, LogOut } from "lucide-react";

/**
 * Tela TERMINAL de "sem acesso" (403).
 *
 * Renderizada quando o Clerk autenticou mas a conta não tem autorização no
 * sistema (`active: false`, ou sem `User` local). É deliberadamente terminal:
 * **nenhum redirect**. Mandar essa pessoa pro `/login` faz o Clerk devolvê-la
 * pra dentro do app — sessão dela é válida — e o par vira um laço infinito, que
 * é justamente o defeito que esta tela existe pra fechar.
 *
 * A única saída oferecida é "Sair", que encerra a sessão do Clerk. Sem ela a
 * pessoa fica presa: não entra e não consegue nem trocar de conta.
 */
export function SemAcesso({ email, nome }: { email: string; nome?: string }) {
  const { signOut } = useClerk();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <ShieldOff className="h-8 w-8 text-slate-400" />
        </div>

        <h1 className="text-lg font-semibold text-slate-900">
          Sua conta ainda não tem acesso
        </h1>

        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
          {nome ? `${nome}, seu` : "Seu"} login foi criado, mas ainda não foi
          liberado por um administrador. O acesso a este sistema é{" "}
          <strong>emitido</strong> — não é liberado por cadastro.
        </p>

        {email ? (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
            {email}
          </p>
        ) : null}

        <p className="mt-4 text-sm text-slate-600">
          Se você deveria ter acesso, fale com o administrador do sistema e
          informe este email.
        </p>

        <button
          type="button"
          onClick={() => signOut({ redirectUrl: "/login-clerk" })}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  );
}
