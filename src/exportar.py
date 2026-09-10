# -*- coding: utf-8 -*-
"""Exporta contatos do banco para planilhas no formato do DataRunner.

Uso:
    python src/exportar.py --uf SC
    python src/exportar.py --uf SC --cidade Blumenau --saida blumenau.xlsx
    python src/exportar.py --uf SC --segmento "Oficina mecanica"

O banco e a fonte; o Excel e so um recorte que se pede quando precisa. Isso
evita manter 200 MB de planilha no disco para uma lista que muda todo mes.
"""

import argparse
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import banco
import planilha_datarunner as pdr

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DADOS = os.path.join(RAIZ, "data")

# banco -> coluna da planilha
DE_PARA = {
    "Nome": "nome", "E-mail": "email", "Telefone": "telefone",
    "Observações": "oportunidade", "Empresa": "empresa", "Cidade": "cidade",
    "Segmento": "segmento", "WhatsApp": "whatsapp", "Bairro": "bairro",
    "Endereço": "endereco", "Porte": "porte", "Abertura": "abertura",
    "CNPJ": "cnpj", "Score": "score",
}


def _slug(texto):
    base = unicodedata.normalize("NFKD", texto or "")
    base = "".join(c for c in base if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-") or "contatos"


def _linha(reg):
    saida = {campo: reg[coluna] for campo, coluna in DE_PARA.items()}
    saida["Telegram"] = ""
    saida["E-mail próprio"] = ("Sim" if reg["dominio_proprio"]
                               else ("Nao" if reg["email"] else ""))
    return saida


def escrever_consulta(conn, sql, params, caminho, nota):
    p = pdr.Planilha(caminho, nota=nota)
    for reg in conn.execute(sql, params):
        p.escrever(_linha(reg))
    return p.fechar()


def por_segmento(conn, destino, min_linhas, log=print):
    """Uma planilha por segmento, como antes, mas lendo do banco."""
    pasta = os.path.join(destino, "planilhas")
    os.makedirs(pasta, exist_ok=True)
    for antigo in os.listdir(pasta):
        if antigo.endswith(".xlsx"):
            os.remove(os.path.join(pasta, antigo))

    linhas = conn.execute(
        "SELECT nome, contatos FROM segmentos ORDER BY contatos DESC").fetchall()
    grandes = [r["nome"] for r in linhas if r["contatos"] >= min_linhas]
    pequenos = [r["nome"] for r in linhas if r["contatos"] < min_linhas]

    escritos = []
    base = ("SELECT * FROM contatos WHERE segmento = ? "
            "ORDER BY score DESC, cidade, nome")
    for segmento in grandes:
        arquivo = _slug(segmento) + ".xlsx"
        n = escrever_consulta(
            conn, base, (segmento,), os.path.join(pasta, arquivo),
            f"{segmento} — importe na aba Contatos do DataRunner. "
            f"Ordenado por Score.")
        escritos.append((segmento, n, arquivo))
        log(f"  {n:7d}  {arquivo}")

    if pequenos:
        marcas = ",".join("?" * len(pequenos))
        n = escrever_consulta(
            conn, f"SELECT * FROM contatos WHERE segmento IN ({marcas}) "
                  f"ORDER BY score DESC, segmento, nome", pequenos,
            os.path.join(pasta, "outros-segmentos.xlsx"),
            f"Segmentos com menos de {min_linhas} contatos, reunidos. "
            f"Filtre pela coluna Segmento.")
        escritos.append(("Outros segmentos", n, "outros-segmentos.xlsx"))
        log(f"  {n:7d}  outros-segmentos.xlsx")
    return escritos


def main():
    ap = argparse.ArgumentParser(description="Exporta contatos para Excel")
    ap.add_argument("--uf", default="SC")
    ap.add_argument("--cidade")
    ap.add_argument("--segmento")
    ap.add_argument("--score-minimo", type=int, default=0)
    ap.add_argument("--ids", help="ids separados por virgula; exporta so esses")
    ap.add_argument("--ids-arquivo",
                    help="arquivo com um id por linha (para seleção grande, que "
                         "não cabe na linha de comando)")
    ap.add_argument("--limite", type=int)
    ap.add_argument("--saida")
    ap.add_argument("--por-segmento", action="store_true",
                    help="gera uma planilha por segmento, como no relatorio")
    ap.add_argument("--min-linhas", type=int, default=400)
    ap.add_argument("--dados", help="pasta de dados (padrao: data/ do projeto)")
    args = ap.parse_args()
    uf = args.uf.upper()
    global DADOS
    if args.dados:
        DADOS = os.path.abspath(args.dados)

    caminho_db = banco.caminho_uf(DADOS, uf)
    if not os.path.exists(caminho_db):
        print(f"Nao encontrei {caminho_db}.\n"
              f"Rode primeiro: python src/gerar_leads.py --uf {uf}")
        return 1

    conn = banco.abrir(caminho_db)
    try:
        if args.por_segmento:
            escritos = por_segmento(conn, os.path.dirname(caminho_db),
                                    args.min_linhas)
            print(f"\n{len(escritos)} planilhas em "
                  f"{os.path.join(os.path.dirname(caminho_db), 'planilhas')}")
            return 0

        onde, params = ["1=1"], []

        ids = []
        if args.ids:
            ids = [i.strip() for i in args.ids.split(",") if i.strip()]
        elif args.ids_arquivo:
            with open(args.ids_arquivo, encoding="utf-8") as fh:
                ids = [l.strip() for l in fh if l.strip()]
        if ids:
            # A selecao manda sozinha: os demais filtros ja foram aplicados na
            # tela para chegar ate ela.
            marcas = ",".join("?" * len(ids))
            onde = [f"id IN ({marcas})"]
            params = [int(i) for i in ids]

        if not ids and args.cidade:
            onde.append("cidade = ?")
            params.append(args.cidade)
        if not ids and args.segmento:
            onde.append("segmento = ?")
            params.append(args.segmento)
        if not ids and args.score_minimo:
            onde.append("score >= ?")
            params.append(args.score_minimo)
        sql = (f"SELECT * FROM contatos WHERE {' AND '.join(onde)} "
               f"ORDER BY score DESC, cidade, nome")
        if args.limite:
            sql += f" LIMIT {int(args.limite)}"

        rotulo = ("seleção" if ids else (args.cidade or args.segmento or uf))
        saida = args.saida or os.path.join(os.path.dirname(caminho_db),
                                           _slug(rotulo) + ".xlsx")
        n = escrever_consulta(conn, sql, params, saida,
                              f"{rotulo} — importe na aba Contatos do DataRunner.")
        print(f"{n} contatos -> {saida}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
