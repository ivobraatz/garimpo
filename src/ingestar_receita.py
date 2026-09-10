# -*- coding: utf-8 -*-
"""Baixa o cadastro de CNPJ da Receita e guarda o recorte de uma ou mais UFs.

Uso:
    python src/ingestar_receita.py --uf SC
    python src/ingestar_receita.py --uf SC PR SP      # tres estados, um download

Escreve data/receita/estabelecimentos_<uf>.csv.gz e empresas_<uf>.csv.gz.

Os arquivos da Receita sao nacionais, nao ha download por estado. Pedir um
estado por vez baixaria e descomprimiria os mesmos 6,7 GB de novo a cada
rodada: aqui cada bloco e lido uma vez e distribuido para todas as UFs
pedidas. Tres estados custam o mesmo download que um.

As linhas sao gravadas conforme saem do parser: guardar os milhoes de
estabelecimentos em memoria nao caberia na RAM.
"""

import argparse
import csv
import gzip
import json
import os
import sys
import time
import zipfile
from array import array
from bisect import bisect_left

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import receita

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Onde os dados ficam. O padrao e a pasta do repositorio, mas o app instalado
# passa --dados apontando para fora da instalacao: assim uma atualizacao troca
# o programa sem encostar no que foi baixado.
DADOS = os.path.join(RAIZ, "data")
DESTINO = os.path.join(DADOS, "receita")


def usar_pasta_dados(caminho):
    global DADOS, DESTINO
    DADOS = os.path.abspath(caminho)
    DESTINO = os.path.join(DADOS, "receita")
    os.makedirs(DESTINO, exist_ok=True)

COLUNAS = [
    "cnpj", "matriz_filial", "nome_fantasia", "data_inicio", "cnae",
    "cnae_secundaria", "logradouro", "numero", "complemento", "bairro", "cep",
    "municipio", "ddd1", "telefone1", "ddd2", "telefone2", "email",
]


def _tmpdir():
    base = os.environ.get("TEMP") or os.environ.get("TMP") or "."
    caminho = os.path.join(base, "garimpo-cnpj")
    os.makedirs(caminho, exist_ok=True)
    return caminho


def _linha_saida(c):
    cnpj = c[receita.CNPJ_BASICO] + c[receita.CNPJ_ORDEM] + c[receita.CNPJ_DV]
    logr = " ".join(x for x in (c[receita.TIPO_LOGRADOURO], c[receita.LOGRADOURO]) if x)
    return [
        cnpj, c[receita.MATRIZ_FILIAL], c[receita.NOME_FANTASIA],
        c[receita.DATA_INICIO], c[receita.CNAE_PRINCIPAL], c[receita.CNAE_SECUNDARIA],
        logr, c[receita.NUMERO], c[receita.COMPLEMENTO], c[receita.BAIRRO],
        c[receita.CEP], c[receita.MUNICIPIO],
        c[receita.DDD_1], c[receita.TELEFONE_1],
        c[receita.DDD_2], c[receita.TELEFONE_2],
        c[receita.EMAIL].strip().lower(),
    ]


def caminho_estabelecimentos(uf):
    return os.path.join(DESTINO, f"estabelecimentos_{uf.lower()}.csv.gz")


def caminho_empresas(uf):
    return os.path.join(DESTINO, f"empresas_{uf.lower()}.csv.gz")


def baixar_estabelecimentos(versao, ufs, blocos=10, log=print):
    """Uma passada pelos blocos, alimentando o arquivo de cada UF.

    Devolve {uf: set de CNPJ basicos}, que a etapa de Empresas usa para saber
    quais razoes sociais interessam.

    `blocos` existe para conferir o resultado com um bloco so, sem esperar os
    5,3 GB dos dez.
    """
    os.makedirs(DESTINO, exist_ok=True)
    tmp = _tmpdir()
    arquivos, escritores = {}, {}
    totais = {uf: 0 for uf in ufs}
    basicos = {uf: set() for uf in ufs}

    try:
        for uf in ufs:
            fh = gzip.open(caminho_estabelecimentos(uf), "wt",
                           encoding="utf-8", newline="")
            arquivos[uf] = fh
            escritores[uf] = csv.writer(fh)
            escritores[uf].writerow(COLUNAS)

        for i in range(blocos):
            nome = f"Estabelecimentos{i}.zip"
            caminho = os.path.join(tmp, nome)
            t0 = time.time()
            log(f"  [{i+1}/{blocos}] {nome}", flush=True)
            try:
                receita._baixar(f"{receita.ESPELHO}/{versao}/{nome}", caminho, log=log)
                antes = dict(totais)
                for linha in receita._linhas_do_zip(caminho, ufs):
                    c = receita._converter(linha)
                    if not c:
                        continue
                    uf = c[receita.UF]
                    if uf not in escritores:
                        continue
                    if c[receita.SITUACAO] != receita.ATIVA:
                        continue
                    escritores[uf].writerow(_linha_saida(c))
                    basicos[uf].add(int(c[receita.CNPJ_BASICO]))
                    totais[uf] += 1
                ganho = ", ".join(f"{uf} +{totais[uf]-antes[uf]}" for uf in ufs)
                log(f"      {ganho} ({time.time()-t0:.0f}s)", flush=True)
            finally:
                if os.path.exists(caminho):
                    os.remove(caminho)
    finally:
        for fh in arquivos.values():
            fh.close()

    for uf in ufs:
        log(f"  {totais[uf]} estabelecimentos ativos em {uf}")
    return basicos, totais


def _indice(conjunto):
    """Conjunto de basicos -> array ordenado, para consulta com pouca memoria.

    Um set de milhoes de inteiros do Python passa de 200 MB por estado; o mesmo
    conteudo como array de 32 bits cabe em poucas dezenas.
    """
    vetor = array("I", sorted(conjunto))
    return vetor


def _contem(vetor, valor):
    i = bisect_left(vetor, valor)
    return i < len(vetor) and vetor[i] == valor


def baixar_empresas(versao, basicos, ufs, blocos=10, log=print):
    """Razao social, natureza, porte e capital, tambem numa passada so."""
    tmp = _tmpdir()
    indices = {uf: _indice(basicos[uf]) for uf in ufs}
    for uf in ufs:
        basicos[uf].clear()

    arquivos, escritores = {}, {}
    achados = {uf: 0 for uf in ufs}
    try:
        for uf in ufs:
            fh = gzip.open(caminho_empresas(uf), "wt", encoding="utf-8", newline="")
            arquivos[uf] = fh
            escritores[uf] = csv.writer(fh)
            escritores[uf].writerow(["cnpj_basico", "razao_social", "natureza",
                                     "qualificacao", "capital_social", "porte"])

        for i in range(blocos):
            nome = f"Empresas{i}.zip"
            caminho = os.path.join(tmp, nome)
            t0 = time.time()
            log(f"  [{i+1}/{blocos}] {nome}", flush=True)
            try:
                receita._baixar(f"{receita.ESPELHO}/{versao}/{nome}", caminho, log=log)
                antes = dict(achados)
                with zipfile.ZipFile(caminho) as zf:
                    with zf.open(zf.namelist()[0]) as bruto:
                        resto = b""
                        while True:
                            bloco = bruto.read(1 << 22)
                            if not bloco:
                                break
                            bloco = resto + bloco
                            linhas = bloco.split(b"\n")
                            resto = linhas.pop()
                            for linha in linhas:
                                # O CNPJ basico sao os 8 digitos logo apos a
                                # primeira aspa: da para descartar a maioria
                                # das linhas sem separar campo a campo.
                                if len(linha) < 12:
                                    continue
                                try:
                                    basico = int(linha[1:9])
                                except ValueError:
                                    continue
                                alvos = [uf for uf in ufs
                                         if _contem(indices[uf], basico)]
                                if not alvos:
                                    continue
                                c = receita._converter(linha, minimo=6)
                                if not c:
                                    continue
                                for uf in alvos:
                                    escritores[uf].writerow(c[:6])
                                    achados[uf] += 1
                ganho = ", ".join(f"{uf} +{achados[uf]-antes[uf]}" for uf in ufs)
                log(f"      {ganho} ({time.time()-t0:.0f}s)", flush=True)
            finally:
                if os.path.exists(caminho):
                    os.remove(caminho)
    finally:
        for fh in arquivos.values():
            fh.close()

    for uf in ufs:
        log(f"  {achados[uf]}/{len(indices[uf])} razoes sociais em {uf}")
    return achados


def basicos_do_arquivo(uf, log=print):
    """CNPJ basicos ja gravados, para refazer so a etapa de Empresas."""
    caminho = caminho_estabelecimentos(uf)
    basicos = set()
    with gzip.open(caminho, "rt", encoding="utf-8") as fh:
        leitor = csv.reader(fh)
        next(leitor, None)
        for linha in leitor:
            if linha:
                basicos.add(int(linha[0][:8]))
    log(f"  {len(basicos)} CNPJ basicos lidos de {os.path.basename(caminho)}")
    return basicos


def registrar_versao(uf, versao, estabelecimentos, log=print):
    """Guarda de qual publicacao da Receita os dados vieram.

    O relatorio precisa dizer a data do cadastro: um lead de tres meses atras
    tem valor diferente de um de ontem, e sem isso nao ha como saber.
    """
    caminho = os.path.join(DESTINO, f"_versao_{uf.lower()}.json")
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump({
            "uf": uf,
            "versao_receita": versao,
            "baixado_em": time.strftime("%Y-%m-%d %H:%M"),
            "estabelecimentos_ativos": estabelecimentos,
        }, fh, ensure_ascii=False, indent=2)
    log(f"  versao registrada para {uf}")


def main():
    ap = argparse.ArgumentParser(description="Ingestao dos Dados Abertos de CNPJ")
    ap.add_argument("--uf", nargs="+", default=["SC"],
                    help="uma ou mais siglas; varias custam o mesmo download")
    ap.add_argument("--pular-empresas", action="store_true")
    ap.add_argument("--somente-empresas", action="store_true",
                    help="reaproveita o arquivo de estabelecimentos ja baixado")
    ap.add_argument("--blocos", type=int, default=10,
                    help="quantos dos 10 blocos ler; menos serve para conferir")
    ap.add_argument("--dados", help="pasta de dados (padrao: data/ do projeto)")
    args = ap.parse_args()

    ufs = []
    for uf in args.uf:
        sigla = uf.strip().upper()
        if len(sigla) == 2 and sigla.isalpha() and sigla not in ufs:
            ufs.append(sigla)
    if not ufs:
        print("Informe ao menos uma sigla de estado, com duas letras.")
        return 1

    if args.dados:
        usar_pasta_dados(args.dados)

    inicio = time.time()
    versao = receita.ultima_versao()
    print(f"  estados: {', '.join(ufs)}")
    print(f"  dados em: {DADOS}")

    if args.somente_empresas:
        print("\nEmpresas (CNPJs lidos dos arquivos existentes):")
        basicos = {uf: basicos_do_arquivo(uf) for uf in ufs}
        baixar_empresas(versao, basicos, ufs)
        print(f"\nConcluido em {(time.time()-inicio)/60:.1f} min")
        return 0

    os.makedirs(DESTINO, exist_ok=True)
    for nome in ("Municipios", "Cnaes"):
        tabela = receita.tabela_auxiliar(versao, nome)
        with gzip.open(os.path.join(DESTINO, f"{nome.lower()}.csv.gz"), "wt",
                       encoding="utf-8", newline="") as fh:
            esc = csv.writer(fh)
            esc.writerow(["codigo", "descricao"])
            for k, v in tabela.items():
                esc.writerow([k, v])

    print("\nEstabelecimentos:")
    basicos, totais = baixar_estabelecimentos(versao, ufs, args.blocos)
    for uf in ufs:
        registrar_versao(uf, versao, totais[uf])

    if not args.pular_empresas:
        print("\nEmpresas:")
        baixar_empresas(versao, basicos, ufs)

    print(f"\nConcluido em {(time.time()-inicio)/60:.1f} min")
    print(f"Agora rode: " + "; ".join(
        f"python src/gerar_leads.py --uf {uf}" for uf in ufs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
