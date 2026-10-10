import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { loadHistory } from "@/lib/chat-history";
import { db } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { BotaoSair } from "./botao-sair";
import { Chat } from "./chat";
import styles from "./chat.module.css";

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
    <main className={styles.pagina}>
      <header className={styles.cabecalho}>
        <span className={styles.marca}>Voltz</span>
        <div className={styles["usuario-info"]}>
          <span>{cliente.nome}</span>
          <BotaoSair />
        </div>
      </header>
      <Chat nome={cliente.nome.split(" ")[0]} historicoInicial={await loadHistory(sessao.clienteId)} />
    </main>
  );
}
