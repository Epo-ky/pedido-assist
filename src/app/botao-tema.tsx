"use client";

import styles from "./botao-tema.module.css";

// Alterna entre claro e escuro. O rótulo é fixo de propósito: o tema "atual" só é conhecido no navegador,
// e um rótulo que dependesse dele daria diferença entre o HTML do servidor e o do navegador.
export function BotaoTema() {
  function alternar() {
    const raiz = document.documentElement;
    const atual =
      raiz.dataset.tema ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro");
    const proximo = atual === "escuro" ? "claro" : "escuro";

    raiz.dataset.tema = proximo;
    try {
      localStorage.setItem("tema", proximo);
    } catch {
      // Sem armazenamento (janela privada, por exemplo): o tema vale só até recarregar a página.
    }
  }

  return (
    <button type="button" className={styles.botao} onClick={alternar} aria-label="Alternar entre tema claro e escuro">
      ◐ Tema
    </button>
  );
}
