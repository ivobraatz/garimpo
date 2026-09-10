# -*- coding: utf-8 -*-
"""Baixa as malhas do IBGE usadas pelo mapa sem reprocessar a base de leads."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ibge

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UFS = {
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
    "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
}


def main():
    ap = argparse.ArgumentParser(description="Baixa malhas do mapa")
    ap.add_argument("--uf", nargs="+", required=True, help="uma ou mais siglas")
    ap.add_argument("--dados", default=os.path.join(RAIZ, "data"))
    args = ap.parse_args()

    for uf in dict.fromkeys(sigla.strip().upper() for sigla in args.uf):
        if uf not in UFS:
            print(f"UF invalida: {uf}", file=sys.stderr)
            return 1
        print(f"Preparando malha de {uf}...", flush=True)
        ibge.garantir_malhas(os.path.abspath(args.dados), uf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
