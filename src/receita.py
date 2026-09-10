# -*- coding: utf-8 -*-
"""Ingestao dos Dados Abertos de CNPJ da Receita Federal.

O cadastro oficial traz o que falta no OpenStreetMap: e-mail e telefone de
praticamente toda empresa ativa, alem de CNAE, porte e data de abertura.

Restricoes praticas que moldam este modulo:

  * O servidor da RFB (dadosabertos.rfb.gov.br) recusa conexao daqui; o espelho
    da Casa dos Dados serve os mesmos arquivos via CDN.
  * Sao ~6,7 GB compactados que inflam para ~70 GB. Guardar tudo nao cabe em
    disco e descomprimir em memoria com stream-inflate (Python puro) e lento
    demais, entao cada zip e baixado, lido com zipfile (zlib em C) e apagado.
  * O nome do municipio no cadastro vem sem acento e sem UF, e ha homonimos
    entre estados ("TIMBO" e "TIMBO GRANDE"). Filtrar por UF resolve: qualquer
    codigo que aparece com UF=SC e um municipio catarinense.
"""

import csv
import io
import os
import zipfile

import requests

ESPELHO = "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos"
UA = "prospeccao-vale-do-itajai/1.0 (levantamento comercial)"

# Posicoes no layout de ESTABELECIMENTOS (30 campos).
CNPJ_BASICO, CNPJ_ORDEM, CNPJ_DV = 0, 1, 2
MATRIZ_FILIAL, NOME_FANTASIA, SITUACAO = 3, 4, 5
DATA_INICIO, CNAE_PRINCIPAL, CNAE_SECUNDARIA = 10, 11, 12
TIPO_LOGRADOURO, LOGRADOURO, NUMERO, COMPLEMENTO, BAIRRO, CEP = 13, 14, 15, 16, 17, 18
UF, MUNICIPIO = 19, 20
DDD_1, TELEFONE_1, DDD_2, TELEFONE_2 = 21, 22, 23, 24
EMAIL = 27

ATIVA = "02"


def ultima_versao(log=print):
    """Descobre a pasta mais recente publicada no espelho."""
    import re
    resp = requests.get(ESPELHO, headers={"User-Agent": UA}, timeout=120)
    resp.raise_for_status()
    pastas = sorted(set(re.findall(r'href="(20\d\d-\d\d-\d\d)/"', resp.text)))
    if not pastas:
        raise RuntimeError("nenhuma versao encontrada no espelho")
    log(f"  versao dos dados: {pastas[-1]}")
    return pastas[-1]


def _baixar(url, destino, log=print):
    """Baixa para disco em blocos, informando o progresso."""
    with requests.get(url, stream=True, headers={"User-Agent": UA}, timeout=600) as r:
        r.raise_for_status()
        total = int(r.headers.get("Content-Length", 0))
        baixado = 0
        marco = 0
        with open(destino, "wb") as fh:
            for bloco in r.iter_content(chunk_size=1 << 20):
                fh.write(bloco)
                baixado += len(bloco)
                if total and baixado * 100 // total >= marco + 25:
                    marco = baixado * 100 // total
                    log(f"      download {marco}% ({baixado/1e6:.0f} MB)")
    return baixado


def tabela_auxiliar(versao, nome, log=print):
    """Le uma tabela pequena (Municipios, Cnaes) direto para um dicionario."""
    url = f"{ESPELHO}/{versao}/{nome}.zip"
    resp = requests.get(url, headers={"User-Agent": UA}, timeout=300)
    resp.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    dados = zf.read(zf.namelist()[0]).decode("latin-1")
    saida = {}
    for linha in csv.reader(io.StringIO(dados), delimiter=";", quotechar='"'):
        if len(linha) >= 2:
            saida[linha[0].strip()] = linha[1].strip()
    log(f"  {nome}: {len(saida)} entradas")
    return saida


def _linhas_do_zip(caminho, ufs):
    """Percorre o CSV dentro do zip, devolvendo as linhas das UFs pedidas.

    O teste e feito em bytes antes de qualquer parsing: as UFs pedidas somam
    poucos por cento das dezenas de milhoes de linhas, e separar campo a campo
    o resto seria desperdicio.

    Aceita varias UFs de proposito. Os arquivos da Receita sao nacionais: pedir
    um estado por vez faz baixar e descomprimir os mesmos bytes de novo, e o que
    muda de um estado para o outro e so o filtro.
    """
    if isinstance(ufs, str):
        ufs = [ufs]
    marcas = [f'";"{uf}";"'.encode("latin-1") for uf in ufs]
    uma_marca = marcas[0] if len(marcas) == 1 else None

    def interessa(linha):
        if uma_marca is not None:
            return uma_marca in linha
        return any(m in linha for m in marcas)

    with zipfile.ZipFile(caminho) as zf:
        interno = zf.namelist()[0]
        with zf.open(interno) as fh:
            resto = b""
            while True:
                bloco = fh.read(1 << 22)
                if not bloco:
                    break
                bloco = resto + bloco
                linhas = bloco.split(b"\n")
                resto = linhas.pop()
                for linha in linhas:
                    if interessa(linha):
                        yield linha
            if interessa(resto):
                yield resto


def _converter(linha_bytes, minimo=30):
    """Separa uma linha do CSV. `minimo` protege contra linha truncada.

    Estabelecimentos tem 30 campos e Empresas apenas 7, entao o minimo cabe ao
    chamador: fixa-lo em 30 aqui descartava em silencio todo o arquivo Empresas.
    """
    texto = linha_bytes.decode("latin-1").rstrip("\r")
    campos = next(csv.reader(io.StringIO(texto), delimiter=";", quotechar='"'))
    if len(campos) < minimo:
        return None
    return campos


def coletar_estabelecimentos(versao, uf="SC", pasta_tmp=".", somente_ativas=True,
                             log=print):
    """Baixa os 10 blocos de Estabelecimentos e devolve as linhas da UF.

    Cada zip e apagado assim que processado: os dez juntos nao caberiam no
    disco disponivel.
    """
    saida = []
    for i in range(10):
        nome = f"Estabelecimentos{i}.zip"
        url = f"{ESPELHO}/{versao}/{nome}"
        caminho = os.path.join(pasta_tmp, nome)
        log(f"  [{i+1}/10] {nome}")
        try:
            _baixar(url, caminho, log=log)
            antes = len(saida)
            for linha in _linhas_do_zip(caminho, uf):
                campos = _converter(linha)
                if not campos or campos[UF] != uf:
                    continue
                if somente_ativas and campos[SITUACAO] != ATIVA:
                    continue
                saida.append(campos)
            log(f"      +{len(saida)-antes} estabelecimentos em {uf}")
        finally:
            if os.path.exists(caminho):
                os.remove(caminho)
    log(f"  total {uf}: {len(saida)} estabelecimentos ativos")
    return saida


def coletar_empresas(versao, basicos, pasta_tmp=".", log=print):
    """Razao social, porte e capital social dos CNPJ basicos de interesse."""
    alvo = set(basicos)
    mapa = {}
    for i in range(10):
        nome = f"Empresas{i}.zip"
        url = f"{ESPELHO}/{versao}/{nome}"
        caminho = os.path.join(pasta_tmp, nome)
        log(f"  [{i+1}/10] {nome}")
        try:
            _baixar(url, caminho, log=log)
            with zipfile.ZipFile(caminho) as zf:
                with zf.open(zf.namelist()[0]) as fh:
                    resto = b""
                    while True:
                        bloco = fh.read(1 << 22)
                        if not bloco:
                            break
                        bloco = resto + bloco
                        linhas = bloco.split(b"\n")
                        resto = linhas.pop()
                        for linha in linhas:
                            if len(linha) < 12:
                                continue
                            basico = linha[1:9].decode("latin-1")
                            if basico in alvo:
                                campos = _converter(linha)
                                if campos and len(campos) >= 6:
                                    mapa[basico] = campos
        finally:
            if os.path.exists(caminho):
                os.remove(caminho)
        log(f"      {len(mapa)}/{len(alvo)} razoes sociais resolvidas")
    return mapa
