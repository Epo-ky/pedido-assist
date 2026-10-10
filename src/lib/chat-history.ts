import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mensagensChat } from "@/lib/db/schema";

// Quantas mensagens ficam guardadas por cliente (o resto, as mais antigas, é apagado a cada nova conversa).
export const MAX_GUARDADAS_POR_CLIENTE = 50;

export type MensagemGuardada = { role: "user" | "assistant"; content: string };

// As últimas mensagens do cliente, da mais antiga para a mais nova (a ordem em que o modelo precisa lê-las).
export async function loadHistory(
  clienteId: number,
  limite: number = MAX_GUARDADAS_POR_CLIENTE,
): Promise<MensagemGuardada[]> {
  const linhas = await db
    .select({ role: mensagensChat.papel, content: mensagensChat.conteudo })
    .from(mensagensChat)
    .where(eq(mensagensChat.clienteId, clienteId))
    .orderBy(desc(mensagensChat.id))
    .limit(limite);

  return linhas.reverse();
}

// Guarda a pergunta e a resposta juntas (ou as duas entram, ou nenhuma) e apaga o que passar do limite.
export async function saveExchange(clienteId: number, pergunta: string, resposta: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Duas inserções separadas, na ordem: a identidade garante que a pergunta recebe o id menor.
    await tx.insert(mensagensChat).values({ clienteId, papel: "user", conteudo: pergunta });
    await tx.insert(mensagensChat).values({ clienteId, papel: "assistant", conteudo: resposta });

    await tx.delete(mensagensChat).where(
      and(
        eq(mensagensChat.clienteId, clienteId),
        sql`${mensagensChat.id} not in (
          select id from ${mensagensChat}
          where ${mensagensChat.clienteId} = ${clienteId}
          order by id desc
          limit ${MAX_GUARDADAS_POR_CLIENTE}
        )`,
      ),
    );
  });
}

export async function clearHistory(clienteId: number): Promise<void> {
  await db.delete(mensagensChat).where(eq(mensagensChat.clienteId, clienteId));
}

// Usado só pelos testes e para conferir a ordem; não é parte do fluxo do chat.
export async function countMessages(clienteId: number): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mensagensChat)
    .where(eq(mensagensChat.clienteId, clienteId));
  return linha.total;
}
