# -*- coding: utf-8 -*-
"""Banco SQLite de contatos, um por UF.

Uma planilha de 114 mil linhas nao se pesquisa; um indice de texto responde na
hora. O banco passa a ser a fonte, e o Excel vira exportacao sob demanda.

Fica em data/uf/<UF>/contatos.db, para que cada estado seja independente:
regerar SC nao encosta no PR, e apagar um estado e apagar uma pasta.
"""

import os
import re
import sqlite3
import unicodedata

COLUNAS = [
    "cnpj", "nome", "empresa", "email", "telefone", "whatsapp",
    "cidade", "cod_municipio", "bairro", "endereco",
    "segmento", "oportunidade", "porte", "abertura",
    "dominio_proprio", "tem_celular", "score",
]

ESQUEMA = """
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS contatos (
    id              INTEGER PRIMARY KEY,
    cnpj            TEXT,
    nome            TEXT NOT NULL,
    empresa         TEXT,
    email           TEXT,
    telefone        TEXT,
    whatsapp        TEXT,
    cidade          TEXT,
    cod_municipio   TEXT,
    bairro          TEXT,
    endereco        TEXT,
    segmento        TEXT,
    oportunidade    TEXT,
    porte           TEXT,
    abertura        TEXT,
    dominio_proprio INTEGER,
    tem_celular     INTEGER,
    score           INTEGER,
    busca           TEXT
);

CREATE TABLE IF NOT EXISTS meta (
    chave TEXT PRIMARY KEY,
    valor TEXT
);

-- Agregados por municipio e por segmento: o mapa e os filtros da tela pedem
-- contagens a cada interacao, e varrer 1,4 milhao de linhas para isso seria
-- lento a toa.
-- A chave e o codigo da Receita, que e o que vem nos contatos. O codigo do
-- IBGE entra depois, casado pelo nome, e so serve para desenhar o mapa.
CREATE TABLE IF NOT EXISTS municipios (
    cod_municipio TEXT PRIMARY KEY,
    codigo_ibge   TEXT,
    nome          TEXT,
    uf            TEXT,
    contatos      INTEGER,
    com_email     INTEGER,
    com_celular   INTEGER,
    sem_dominio   INTEGER,
    score_medio   REAL
);

CREATE TABLE IF NOT EXISTS segmentos (
    nome        TEXT PRIMARY KEY,
    contatos    INTEGER,
    com_email   INTEGER,
    com_celular INTEGER,
    sem_dominio INTEGER,
    score_medio REAL
);
"""

INDICES = """
CREATE INDEX IF NOT EXISTS idx_cidade    ON contatos(cidade);
CREATE INDEX IF NOT EXISTS idx_municipio ON contatos(cod_municipio);
CREATE INDEX IF NOT EXISTS idx_segmento  ON contatos(segmento);
CREATE INDEX IF NOT EXISTS idx_score     ON contatos(score DESC);
CREATE INDEX IF NOT EXISTS idx_porte     ON contatos(porte);
CREATE INDEX IF NOT EXISTS idx_mun_ibge  ON municipios(codigo_ibge);
"""

# FTS externo: o indice nao duplica o texto, so aponta para a tabela de
# contatos. Busca sobre a coluna `busca`, que ja vem sem acento.
FTS = """
CREATE VIRTUAL TABLE IF NOT EXISTS contatos_fts USING fts5(
    busca,
    content='contatos',
    content_rowid='id',
    tokenize='unicode61'
);
"""


def sem_acento(texto):
    base = unicodedata.normalize("NFKD", texto or "")
    return "".join(c for c in base if not unicodedata.combining(c))


def chave_busca(*partes):
    """Texto normalizado para o indice: sem acento, minusculo, so alfanumerico."""
    junto = " ".join(p for p in partes if p)
    return re.sub(r"[^a-z0-9 ]+", " ", sem_acento(junto).lower()).strip()


def caminho_uf(raiz, uf):
    return os.path.join(raiz, "uf", uf.upper(), "contatos.db")


def abrir(caminho, criar=False):
    if criar:
        os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
    conn = sqlite3.connect(caminho)
    conn.row_factory = sqlite3.Row
    return conn


def preparar(conn):
    conn.executescript(ESQUEMA)
    conn.execute("DELETE FROM contatos")
    conn.execute("DELETE FROM municipios")
    conn.execute("DELETE FROM segmentos")
    # Inserir com os indices no lugar custa caro; eles sao criados no fim.
    conn.execute("DROP INDEX IF EXISTS idx_cidade")
    conn.execute("DROP INDEX IF EXISTS idx_municipio")
    conn.execute("DROP INDEX IF EXISTS idx_segmento")
    conn.execute("DROP INDEX IF EXISTS idx_score")
    conn.execute("DROP INDEX IF EXISTS idx_porte")
    conn.execute("DROP TABLE IF EXISTS contatos_fts")
    conn.commit()


_INSERT = (f"INSERT INTO contatos ({', '.join(COLUNAS)}, busca) "
           f"VALUES ({', '.join('?' * (len(COLUNAS) + 1))})")


def inserir(conn, linhas):
    conn.executemany(_INSERT, linhas)


def finalizar(conn, uf, meta=None, log=print):
    """Cria indices, agregados e o indice de texto, nesta ordem."""
    log("  criando indices...")
    conn.executescript(INDICES)

    log("  montando agregados por municipio e segmento...")
    conn.execute("""
        INSERT INTO municipios
            (cod_municipio, codigo_ibge, nome, uf, contatos, com_email,
             com_celular, sem_dominio, score_medio)
        SELECT cod_municipio, '', cidade, ?,
               COUNT(*),
               SUM(email <> ''),
               SUM(tem_celular),
               SUM(email <> '' AND dominio_proprio = 0),
               AVG(score)
        FROM contatos GROUP BY cod_municipio, cidade
    """, (uf.upper(),))
    conn.execute("""
        INSERT INTO segmentos
            (nome, contatos, com_email, com_celular, sem_dominio, score_medio)
        SELECT segmento, COUNT(*), SUM(email <> ''), SUM(tem_celular),
               SUM(email <> '' AND dominio_proprio = 0), AVG(score)
        FROM contatos GROUP BY segmento
    """)

    log("  construindo indice de busca...")
    conn.executescript(FTS)
    conn.execute("INSERT INTO contatos_fts(contatos_fts) VALUES('rebuild')")

    for chave, valor in (meta or {}).items():
        conn.execute("INSERT OR REPLACE INTO meta (chave, valor) VALUES (?, ?)",
                     (chave, str(valor)))
    conn.commit()
    log("  compactando...")
    conn.execute("VACUUM")
    conn.execute("PRAGMA optimize")
    conn.commit()


# Palavras de ligacao que os dois cadastros usam de forma diferente: a Receita
# grava "Balneario de Picarras" onde o IBGE grava "Balneario Picarras".
LIGACOES = {"de", "do", "da", "dos", "das", "e"}


def _sem_ligacoes(chave):
    return " ".join(p for p in chave.split() if p not in LIGACOES)


def aplicar_codigos_ibge(conn, mapa_nome_para_codigo, log=print):
    """Casa o municipio da Receita com o codigo do IBGE, pelo nome sem acento.

    Os dois cadastros usam codigos proprios e incompativeis, e so o do IBGE
    serve para desenhar o mapa. Quando o nome nao casa exato, tenta de novo sem
    as palavras de ligacao -- e a unica divergencia real entre os dois.
    """
    frouxo = {_sem_ligacoes(k): v for k, v in mapa_nome_para_codigo.items()}
    casados = perdidos = 0
    for linha in conn.execute("SELECT cod_municipio, nome FROM municipios").fetchall():
        chave = chave_busca(linha["nome"])
        codigo = (mapa_nome_para_codigo.get(chave)
                  or frouxo.get(_sem_ligacoes(chave)))
        if codigo:
            conn.execute("UPDATE municipios SET codigo_ibge = ? "
                         "WHERE cod_municipio = ?", (codigo, linha["cod_municipio"]))
            casados += 1
        else:
            perdidos += 1
            log(f"    sem codigo IBGE: {linha['nome']!r}")
    conn.commit()
    log(f"  {casados} municipios com codigo IBGE, {perdidos} sem")
    return casados, perdidos
