# -*- coding: utf-8 -*-
"""Codigos e malhas geograficas do IBGE, para o mapa da interface.

O cadastro da Receita usa codigo de municipio proprio, incompativel com o do
IBGE. O casamento e feito pelo nome sem acento, que e unico dentro de uma UF.

As malhas sao baixadas uma vez e guardadas em data/ibge/: sao estaveis e nao
ha motivo para ir a rede a cada abertura da tela.
"""

import json
import os

import requests

API = "https://servicodados.ibge.gov.br/api/v1/localidades"
MALHAS = "https://servicodados.ibge.gov.br/api/v3/malhas"
UA = "garimpo/1.0"

# Qualidade da malha: 'minima' basta para colorir e mantem o arquivo leve.
INTRARREGIAO = {"uf": "UF", "municipio": "municipio"}


def _pasta(raiz):
    caminho = os.path.join(raiz, "ibge")
    os.makedirs(caminho, exist_ok=True)
    return caminho


def _cache_json(caminho, buscar, log=print):
    if os.path.exists(caminho):
        with open(caminho, encoding="utf-8") as fh:
            return json.load(fh)
    dados = buscar()
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False)
    log(f"  guardado: {os.path.basename(caminho)}")
    return dados


def estados(raiz, log=print):
    """[{id, sigla, nome, regiao}] das 27 UFs."""
    def buscar():
        r = requests.get(f"{API}/estados", headers={"User-Agent": UA}, timeout=120)
        r.raise_for_status()
        return sorted(r.json(), key=lambda e: e["sigla"])
    return _cache_json(os.path.join(_pasta(raiz), "estados.json"), buscar, log)


def municipios(raiz, uf, log=print):
    """[{id, nome}] dos municipios de uma UF."""
    def buscar():
        r = requests.get(f"{API}/estados/{uf}/municipios",
                         headers={"User-Agent": UA}, timeout=180)
        r.raise_for_status()
        return [{"id": str(m["id"]), "nome": m["nome"]} for m in r.json()]
    return _cache_json(os.path.join(_pasta(raiz), f"municipios_{uf.upper()}.json"),
                       buscar, log)


def malha_brasil(raiz, log=print):
    """GeoJSON do Brasil dividido por UF."""
    def buscar():
        r = requests.get(f"{MALHAS}/paises/BR",
                         params={"formato": "application/vnd.geo+json",
                                 "intrarregiao": "UF", "qualidade": "minima"},
                         headers={"User-Agent": UA}, timeout=300)
        r.raise_for_status()
        return r.json()
    return _cache_json(os.path.join(_pasta(raiz), "malha_br.geojson"), buscar, log)


def malha_municipios(raiz, uf_id, log=print):
    """GeoJSON de uma UF dividido por municipio. `uf_id` e o codigo IBGE (ex 42)."""
    def buscar():
        r = requests.get(f"{MALHAS}/estados/{uf_id}",
                         params={"formato": "application/vnd.geo+json",
                                 "intrarregiao": "municipio",
                                 "qualidade": "minima"},
                         headers={"User-Agent": UA}, timeout=300)
        r.raise_for_status()
        return r.json()
    return _cache_json(os.path.join(_pasta(raiz), f"malha_{uf_id}.geojson"),
                       buscar, log)


def garantir_malhas(raiz, uf, log=print):
    """Baixa as malhas que a tela de mapa precisa para esta UF.

    Sao dois arquivos: o Brasil por estado (contexto e navegacao) e a UF por
    municipio (o coropletico em si). Ficam em cache, entao rodar de novo nao
    vai a rede.
    """
    codigo = codigo_da_uf(raiz, uf)
    if not codigo:
        log(f"  aviso: UF {uf} nao encontrada no IBGE, mapa ficara sem malha")
        return
    malha_brasil(raiz, log)
    malha_municipios(raiz, codigo, log)
    log(f"  malhas prontas para {uf}")


def codigo_da_uf(raiz, uf, log=print):
    """Codigo IBGE de uma sigla ('SC' -> '42')."""
    for e in estados(raiz, log):
        if e["sigla"].upper() == uf.upper():
            return str(e["id"])
    return None


def mapa_nome_codigo(raiz, uf, normalizar, log=print):
    """{nome normalizado: codigo IBGE} para casar com o cadastro da Receita."""
    return {normalizar(m["nome"]): m["id"] for m in municipios(raiz, uf, log)}
