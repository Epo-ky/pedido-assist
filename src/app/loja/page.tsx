import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clientes, produtos } from "@/lib/db/schema";
import { formatBRL } from "@/lib/money";
import { iconeDoProduto } from "@/lib/product-icon";
import { Cabecalho } from "../cabecalho";
import { Comprar } from "./comprar";
import styles from "./loja.module.css";

const LARGURA = 960;

export default async function LojaPage() {
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

  const vitrine = await db
    .select({ id: produtos.id, nome: produtos.nome, preco: produtos.preco })
    .from(produtos)
    .orderBy(asc(produtos.id));

  return (
    <main className={styles.pagina}>
      <Cabecalho nome={cliente.nome} atual="loja" largura={LARGURA} />

      <section className={styles.conteudo} style={{ maxWidth: LARGURA }}>
        <h1 className={styles.titulo}>Eletrônicos</h1>

        <ul className={styles.grade}>
          {vitrine.map((produto) => (
            <li key={produto.id} className={styles.cartao}>
              <span className={styles.icone} aria-hidden="true">
                {iconeDoProduto(produto.nome)}
              </span>
              <h2 className={styles.nome}>{produto.nome}</h2>
              <p className={styles.preco}>{formatBRL(produto.preco)}</p>
              <Comprar produtoId={produto.id} nome={produto.nome} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
