import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BotaoTema } from "./botao-tema";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voltz",
  description: "Acompanhe seus pedidos de eletrônicos com o Volt, o assistente da Voltz.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: o script abaixo muda o atributo data-tema do <html> antes do React assumir.
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo ANTES de a página aparecer, para não piscar o tema errado. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("tema");if(t==="claro"||t==="escuro")document.documentElement.dataset.tema=t}catch(e){}',
          }}
        />
      </head>
      <body>
        {children}
        <BotaoTema />
      </body>
    </html>
  );
}
