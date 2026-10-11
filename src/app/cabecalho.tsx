import Link from "next/link";
import { BotaoSair } from "./chat/botao-sair";
import styles from "./cabecalho.module.css";

// Cabeçalho das páginas de quem está logado: marca, navegação entre Loja e Chat, nome e botão de sair.
export function Cabecalho({
  nome,
  atual,
  largura = 760,
}: {
  nome: string;
  atual: "loja" | "chat";
  // Largura máxima em pixels, para o cabeçalho ficar alinhado com o conteúdo da página.
  largura?: number;
}) {
  return (
    <header className={styles.cabecalho} style={{ maxWidth: largura }}>
      <div className={styles.esquerda}>
        <span className={styles.marca}>Voltz</span>
        <nav className={styles.navegacao} aria-label="Principal">
          <Link
            href="/loja"
            className={`${styles.link} ${atual === "loja" ? styles.ativo : ""}`}
            aria-current={atual === "loja" ? "page" : undefined}
          >
            Loja
          </Link>
          <Link
            href="/chat"
            className={`${styles.link} ${atual === "chat" ? styles.ativo : ""}`}
            aria-current={atual === "chat" ? "page" : undefined}
          >
            Chat
          </Link>
        </nav>
      </div>

      <div className={styles.usuario}>
        <span>{nome}</span>
        <BotaoSair />
      </div>
    </header>
  );
}
