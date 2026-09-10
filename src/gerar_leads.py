# -*- coding: utf-8 -*-
"""Monta o banco de contatos de uma UF a partir do cadastro ja ingerido.

Uso:
    python src/gerar_leads.py --uf SC
    python src/gerar_leads.py --uf SC --cidades Blumenau Timbo
    python src/gerar_leads.py --uf SC --xlsx        # exporta tambem as planilhas

Entra: data/receita/*.csv.gz (veja ingestar_receita.py)
Sai:   data/uf/<UF>/contatos.db  -- banco pesquisavel, fonte da interface
       data/uf/<UF>/_INDICE.md   -- relatorio da rodada

Cada UF tem sua propria pasta e seu proprio banco: regerar SC nao encosta no
PR, e apagar um estado e apagar uma pasta.
"""

import argparse
import csv
import gzip
import json
import os
import re
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import banco
import cnae as mod_cnae
import contatos as ct
import ibge
import relatorio as mod_relatorio

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Ver a nota em ingestar_receita: a pasta de dados vive fora da instalacao.
DADOS = os.path.join(RAIZ, "data")
RECEITA = os.path.join(DADOS, "receita")


def usar_pasta_dados(caminho):
    global DADOS, RECEITA
    DADOS = os.path.abspath(caminho)
    RECEITA = os.path.join(DADOS, "receita")

PORTES = {"00": "Nao informado", "01": "Microempresa",
          "03": "Pequeno porte", "05": "Medio/grande"}

LOTE = 20000


def pasta_uf(uf):
    return os.path.join(DADOS, "uf", uf.upper())


def _sem_acento(texto):
    base = unicodedata.normalize("NFKD", texto or "")
    return "".join(c for c in base if not unicodedata.combining(c))


def _titulo(texto):
    """MERCADO DO JOAO LTDA -> Mercado do Joao Ltda"""
    miudas = {"de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o"}
    palavras = (texto or "").strip().lower().split()
    return " ".join(p if (i and p in miudas) else p.capitalize()
                    for i, p in enumerate(palavras))


# Empresario individual entra no cadastro com o CPF grudado no nome, ora antes
# ("41.273.902 ALCINDO ROSA"), ora depois ("INGRID ALVES 03151432077"). Sao 45%
# das razoes sociais. Alem de sujar a saudacao da campanha, e dado pessoal que
# a lista nao precisa carregar.
_CPF_PREFIXO = re.compile(r"^[\d][\d.\-/]{5,}\s+")
_CPF_SUFIXO = re.compile(r"\s+\d{9,14}$")


def _limpar_nome(texto):
    limpo = _CPF_SUFIXO.sub("", (texto or "").strip())
    limpo = _CPF_PREFIXO.sub("", limpo)
    # Se sobrou so pontuacao ou nada, o nome original era melhor que vazio.
    return limpo.strip(" .-") or (texto or "").strip()


def carregar_tabela(nome):
    with gzip.open(os.path.join(RECEITA, f"{nome}.csv.gz"), "rt",
                   encoding="utf-8") as fh:
        return {l[0]: l[1] for l in csv.reader(fh) if len(l) >= 2}


def carregar_empresas(uf, log=print):
    """cnpj_basico -> (razao_social, porte).

    Guarda tuplas em vez de dicionarios: sao 1,5 milhao de entradas e a
    diferenca de memoria entre as duas formas e de centenas de megabytes.
    """
    caminho = os.path.join(RECEITA, f"empresas_{uf.lower()}.csv.gz")
    if not os.path.exists(caminho):
        log(f"  aviso: {os.path.basename(caminho)} ausente, "
            "razao social ficara vazia")
        return {}
    mapa = {}
    with gzip.open(caminho, "rt", encoding="utf-8") as fh:
        leitor = csv.reader(fh)
        next(leitor, None)
        for linha in leitor:
            if len(linha) >= 6:
                mapa[linha[0]] = (linha[1], linha[5])
    return mapa


# Porte pesa muito na nota: 90% do cadastro e microempresa, e sem esse
# criterio todo MEI com celular e gmail empatava em 100 com uma industria.
BONUS_PORTE = {"01": 0, "00": 3, "03": 10, "05": 20}


def _pontuar(segmento, celular, email, dominio_proprio, matriz, anos, porte):
    score = mod_cnae.peso(segmento) * 2.5
    if celular:
        score += 20
    if email:
        score += 15
        # Sem dominio proprio quase sempre significa sem site: o alvo mais
        # direto de quem vende presenca digital.
        if not dominio_proprio:
            score += 10
    score += BONUS_PORTE.get(porte, 0)
    if matriz:
        score += 5
    if anos >= 3:
        score += 5
    return min(round(score), 100)


def _montar(reg, cidade, empresas, ano_atual, stats=None):
    """Linha do cadastro -> tupla pronta para o banco, ou None."""
    email = ct.normalizar_email(reg["email"])
    fones = ct.montar_telefones(reg["ddd1"], reg["telefone1"],
                                reg["ddd2"], reg["telefone2"])
    celular = fones[0] if fones and ct.eh_celular(fones[0]) else ""

    # Regra do importador: sem e-mail e sem celular a linha seria pulada.
    if not email and not celular:
        if stats:
            stats.sem_canal += 1
        return None

    razao, porte = empresas.get(reg["cnpj"][:8], ("", "00"))
    nome = _titulo(_limpar_nome(reg["nome_fantasia"].strip() or razao))
    if not nome:
        if stats:
            stats.sem_nome += 1
        return None

    segmento, oportunidade = mod_cnae.classificar(reg["cnae"])
    dominio = ct.tem_dominio_proprio(email) if email else False
    ano = reg["data_inicio"][:4]
    try:
        anos = ano_atual - int(ano)
    except (ValueError, TypeError):
        anos = 0

    score = _pontuar(segmento, celular, email, dominio,
                     reg["matriz_filial"] == "1", anos, porte)
    nome_porte = PORTES.get(porte, "Nao informado")
    empresa = _titulo(_limpar_nome(razao)) or nome
    cidade_bonita = _titulo(cidade)

    if stats:
        stats.registrar(segmento, cidade_bonita, email, celular,
                        dominio, nome_porte, score, ano)

    return (
        reg["cnpj"],
        nome,
        empresa,
        email,
        " / ".join(ct.formatar(f) for f in fones),
        ct.link_whatsapp(celular),
        cidade_bonita,
        reg["municipio"],
        _titulo(reg["bairro"]),
        _titulo(" ".join(x for x in (reg["logradouro"], reg["numero"]) if x)),
        segmento,
        oportunidade,
        nome_porte,
        ano,
        1 if dominio else 0,
        1 if celular else 0,
        score,
        banco.chave_busca(nome, empresa, cidade_bonita, segmento),
    )


def construir(conn, municipios, empresas, uf, stats, cidades_alvo=None, log=print):
    """Le o cadastro inteiro e grava no banco em lotes."""
    caminho = os.path.join(RECEITA, f"estabelecimentos_{uf.lower()}.csv.gz")
    alvo = {_sem_acento(c).upper() for c in cidades_alvo} if cidades_alvo else None
    ano = time.localtime().tm_year
    lote = []

    with gzip.open(caminho, "rt", encoding="utf-8") as fh:
        for reg in csv.DictReader(fh):
            stats.lidos += 1
            cidade = municipios.get(reg["municipio"], "")
            if alvo and _sem_acento(cidade).upper() not in alvo:
                stats.fora_do_recorte += 1
                continue
            linha = _montar(reg, cidade, empresas, ano, stats)
            if not linha:
                continue
            lote.append(linha)
            if len(lote) >= LOTE:
                banco.inserir(conn, lote)
                lote.clear()
            if stats.lidos % 250000 == 0:
                log(f"    {stats.lidos} lidos, {stats.aproveitados} aproveitados")
    if lote:
        banco.inserir(conn, lote)
    conn.commit()
    log(f"  {stats.lidos} lidos, {stats.aproveitados} gravados")


def carregar_versao(uf):
    """Metadados gravados pela ingestao, para o relatorio citar a fonte."""
    caminho = os.path.join(RECEITA, f"_versao_{uf.lower()}.json")
    if not os.path.exists(caminho):
        return {}
    with open(caminho, encoding="utf-8") as fh:
        return json.load(fh)


def segmentos_do_banco(conn):
    """[(segmento, contatos, None)] na ordem do relatorio."""
    return [(r["nome"], r["contatos"], None) for r in conn.execute(
        "SELECT nome, contatos FROM segmentos ORDER BY contatos DESC")]


def main():
    ap = argparse.ArgumentParser(description="Monta o banco de contatos de uma UF")
    ap.add_argument("--uf", default="SC",
                    help="estado ja ingerido por ingestar_receita.py")
    ap.add_argument("--cidades", nargs="+", help="restringe a estes municipios")
    ap.add_argument("--xlsx", action="store_true",
                    help="exporta tambem uma planilha por segmento")
    ap.add_argument("--min-linhas", type=int, default=400,
                    help="com --xlsx, abaixo disso o segmento vai para Outros")
    ap.add_argument("--dados", help="pasta de dados (padrao: data/ do projeto)")
    args = ap.parse_args()
    if args.dados:
        usar_pasta_dados(args.dados)
    uf = args.uf.upper()

    base = os.path.join(RECEITA, f"estabelecimentos_{uf.lower()}.csv.gz")
    if not os.path.exists(base):
        print(f"Nao encontrei {base}.\n"
              f"Rode primeiro: python src/ingestar_receita.py --uf {uf}")
        return 1

    inicio = time.time()
    destino = pasta_uf(uf)
    print(f"Carregando tabelas ({uf})...", flush=True)
    municipios = carregar_tabela("municipios")
    empresas = carregar_empresas(uf)
    print(f"  {len(municipios)} municipios, {len(empresas)} razoes sociais")

    caminho_db = os.path.join(destino, "contatos.db")
    conn = banco.abrir(caminho_db, criar=True)
    banco.preparar(conn)

    stats = mod_relatorio.Estatisticas()
    try:
        print("\nGravando contatos...", flush=True)
        construir(conn, municipios, empresas, uf, stats, args.cidades)
        del empresas

        print("\nFinalizando o banco...", flush=True)
        meta = carregar_versao(uf)
        banco.finalizar(conn, uf, {
            "uf": uf,
            "versao_receita": meta.get("versao_receita", ""),
            "baixado_em": meta.get("baixado_em", ""),
            "gerado_em": time.strftime("%Y-%m-%d %H:%M"),
            "contatos": stats.aproveitados,
            "recorte": ", ".join(args.cidades) if args.cidades else "estado inteiro",
        })

        print("\nCasando com os codigos do IBGE...", flush=True)
        banco.aplicar_codigos_ibge(
            conn, ibge.mapa_nome_codigo(DADOS, uf, banco.chave_busca))

        print("\nPreparando malha do mapa...", flush=True)
        ibge.garantir_malhas(DADOS, uf)

        escritos = segmentos_do_banco(conn)
        if args.xlsx:
            print("\nExportando planilhas...", flush=True)
            import exportar
            escritos = exportar.por_segmento(conn, destino, args.min_linhas)
    finally:
        conn.close()

    segundos = time.time() - inicio
    caminho = mod_relatorio.gerar(
        escritos, stats, uf, carregar_versao(uf), args.cidades,
        args.min_linhas, segundos, os.path.join(destino, "_INDICE.md"),
        banco_em=caminho_db)

    tamanho = os.path.getsize(caminho_db) / 1e6
    print(f"\nBanco: {caminho_db} ({tamanho:.0f} MB, "
          f"{stats.aproveitados} contatos)")
    print(f"Relatorio: {caminho}")
    print(f"Concluido em {segundos/60:.1f} min")
    return 0


if __name__ == "__main__":
    sys.exit(main())
