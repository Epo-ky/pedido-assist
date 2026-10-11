"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBRL } from "@/lib/money";
import styles from "./loja.module.css";

const QUANTIDADES = [1, 2, 3, 4, 5];

type Resultado = { tipo: "ok"; id: number; total: string } | { tipo: "erro"; mensagem: string };

// Só manda QUAL produto e QUANTAS unidades. O preço e o total o servidor calcula a partir do banco.
export function Comprar({ produtoId, nome }: { produtoId: number; nome: string }) {
  const router = useRouter();
  const [quantidade, setQuantidade] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function comprar() {
    setEnviando(true);
    setResultado(null);

    try {
      const resposta = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [{ produtoId, quantidade }] }),
      });

      if (resposta.status === 401) {
        router.push("/login");
        router.refresh();
        return;
      }

      const corpo = await resposta.json().catch(() => null);

      if (resposta.ok && corpo?.pedido) {
        setResultado({ tipo: "ok", id: corpo.pedido.id, total: corpo.pedido.total });
      } else {
        setResultado({ tipo: "erro", mensagem: corpo?.erro ?? "Não foi possível comprar. Tente novamente." });
      }
    } catch {
      setResultado({ tipo: "erro", mensagem: "Não foi possível conectar ao servidor. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.compra}>
      <div className={styles.controles}>
        <select
          value={quantidade}
          onChange={(evento) => setQuantidade(Number(evento.target.value))}
          aria-label={`Quantidade de ${nome}`}
          disabled={enviando}
        >
          {QUANTIDADES.map((opcao) => (
            <option key={opcao} value={opcao}>
              {opcao}
            </option>
          ))}
        </select>
        <button type="button" onClick={comprar} disabled={enviando}>
          {enviando ? "Comprando..." : "Comprar"}
        </button>
      </div>

      <div role="status" aria-live="polite">
        {resultado?.tipo === "ok" && (
          <p className={styles.sucesso}>
            Pedido nº {resultado.id} criado ({formatBRL(resultado.total)}).{" "}
            <Link href="/chat">Perguntar ao Volt</Link>
          </p>
        )}
        {resultado?.tipo === "erro" && <p className={styles.erro}>{resultado.mensagem}</p>}
      </div>
    </div>
  );
}
