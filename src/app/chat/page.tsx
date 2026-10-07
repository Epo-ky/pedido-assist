import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { BotaoSair } from "./botao-sair";

export default async function ChatPage() {
  const sessao = await getSession();

  if (!sessao) {
    redirect("/login");
  }

  const [cliente] = await db
    .select({ nome: clientes.nome })
    .from(clientes)
    .where(eq(clientes.id, sessao.clienteId))
    .limit(1);

  if (!cliente) {
    redirect("/login");
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>Olá, {cliente.nome}</h1>
      <p>O chat ainda está em construção.</p>
      <BotaoSair />
    </main>
  );
}
