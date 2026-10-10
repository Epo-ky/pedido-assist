CREATE TABLE "limites_uso" (
	"chave" text NOT NULL,
	"janela_inicio" timestamp with time zone NOT NULL,
	"contagem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "limites_uso_chave_janela_inicio_pk" PRIMARY KEY("chave","janela_inicio")
);
