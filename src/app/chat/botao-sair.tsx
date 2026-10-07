"use client";

import { useRouter } from "next/navigation";

export function BotaoSair() {
  const router = useRouter();

  async function sair() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={sair}>
      Sair
    </button>
  );
}
