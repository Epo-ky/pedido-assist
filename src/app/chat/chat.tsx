"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./chat.module.css";

type Mensagem = { role: "user" | "assistant"; content: string; erro?: boolean };

const SUGESTOES = [
  "Quais são os meus pedidos?",
  "Tenho algum pedido atrasado?",
  "Onde está o meu pedido mais recente?",
];

export function Chat({ nome }: { nome: string }) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, carregando]);

  async function enviar(conteudo: string) {
    const message = conteudo.trim();
    if (!message || carregando) return;

    // Mensagens de erro da tela não fazem parte da conversa que o modelo deve ver.
    const history = mensagens
      .filter((m) => !m.erro)
      .map(({ role, content }) => ({ role, content }));

    setMensagens([...mensagens, { role: "user", content: message }]);
    setTexto("");
    setCarregando(true);

    try {
      const resposta = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });

      if (resposta.status === 401) {
        router.push("/login");
        router.refresh();
        return;
      }

      const corpo = await resposta.json().catch(() => null);

      if (resposta.ok && typeof corpo?.resposta === "string") {
        setMensagens((atuais) => [...atuais, { role: "assistant", content: corpo.resposta }]);
      } else {
        setMensagens((atuais) => [
          ...atuais,
          {
            role: "assistant",
            content: corpo?.erro ?? "Não foi possível falar com o Volt. Tente novamente.",
            erro: true,
          },
        ]);
      }
    } catch {
      setMensagens((atuais) => [
        ...atuais,
        {
          role: "assistant",
          content: "Não foi possível conectar ao servidor. Tente novamente.",
          erro: true,
        },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className={styles.chat}>
      <div className={styles.mensagens} aria-live="polite">
        {mensagens.length === 0 && (
          <div className={styles.boasVindas}>
            <p>
              Olá, {nome}! Eu sou o Volt, o assistente da Voltz. Posso ajudar com os seus
              pedidos, entregas e valores.
            </p>
            <div className={styles.sugestoes}>
              {SUGESTOES.map((sugestao) => (
                <button key={sugestao} type="button" onClick={() => enviar(sugestao)}>
                  {sugestao}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((mensagem, indice) => (
          <div
            key={indice}
            className={`${styles.balao} ${
              mensagem.role === "user" ? styles.usuario : styles.assistente
            } ${mensagem.erro ? styles.erro : ""}`}
          >
            {mensagem.content}
          </div>
        ))}

        {carregando && (
          <div className={`${styles.balao} ${styles.assistente} ${styles.digitando}`}>
            O Volt está consultando os seus pedidos...
          </div>
        )}

        <div ref={fimRef} />
      </div>

      <form
        className={styles.formulario}
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar(texto);
        }}
      >
        <input
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Pergunte sobre os seus pedidos"
          maxLength={2000}
          aria-label="Mensagem para o Volt"
          autoFocus
        />
        <button type="submit" disabled={carregando || texto.trim() === ""}>
          Enviar
        </button>
      </form>
    </section>
  );
}
