/**
 * Aparência comum das telas do Clerk: login (/login-clerk) e cadastro por
 * convite (/cadastro-clerk).
 */
export const clerkAppearance = {
  // Algumas variables (colorText, colorInputBackground, etc.) não estão
  // no type oficial mas ainda funcionam em runtime. Cast pra preservar.
  variables: {
    colorPrimary: "#0C3948",
    colorText: "#1A2A30",
    colorTextSecondary: "#4B5A62",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#1A2A30",
    colorBackground: "#FFFFFF",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-inter)",
    fontSize: "14px",
  } as Record<string, string>,
  elements: {
    rootBox: "w-full max-w-md",
    card: "bg-white border border-[#E5E5E0] rounded-2xl shadow-none p-8",
    header: "mb-2",
    headerTitle:
      "text-2xl font-bold text-[#1A2A30] tracking-tight text-left",
    headerSubtitle: "text-sm text-[#4B5A62] text-left",
    socialButtonsBlockButton: "hidden",
    socialButtons: "hidden",
    dividerRow: "hidden",
    formFieldLabel:
      "text-[11px] font-semibold text-[#4B5A62] uppercase tracking-[0.14em]",
    formFieldInput:
      "w-full px-3.5 py-2.5 bg-white border border-[#E5E5E0] rounded-xl text-[#1A2A30] placeholder:text-[#8A9298] focus:outline-none focus:border-[#0C3948] focus:ring-2 focus:ring-[#0C3948]/15 transition",
    formButtonPrimary:
      "bg-[#0C3948] hover:bg-[#082A36] text-white text-sm font-semibold normal-case rounded-lg py-2.5",
    footer: "hidden",
    footerAction: "hidden",
    identityPreview:
      "bg-[#F5F5F2] border border-[#E5E5E0] rounded-xl",
  },
};
