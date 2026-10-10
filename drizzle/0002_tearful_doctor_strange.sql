CREATE TYPE "public"."papel_mensagem" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "mensagens_chat" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mensagens_chat_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cliente_id" integer NOT NULL,
	"papel" "papel_mensagem" NOT NULL,
	"conteudo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mensagens_chat" ADD CONSTRAINT "mensagens_chat_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensagens_chat_cliente_id_idx" ON "mensagens_chat" USING btree ("cliente_id","id");