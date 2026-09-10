# -*- coding: utf-8 -*-
"""Escreve planilhas no formato que o importador do DataRunner espera.

A aba precisa se chamar "Contatos" -- e ela que o importador le. As tres
ultimas colunas do modelo sao livres: viram campo do contato e filtro na tela,
entao carregam aqui os dados que separam a prospeccao (cidade, segmento, porte).

A escrita usa o modo write_only do openpyxl: um segmento pode ter mais de cem
mil contatos, e montar isso como celulas na memoria nao cabe nesta maquina.
"""

import os

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

# As cinco primeiras sao os canais e campos fixos do importador; o resto vira
# campo personalizado do contato.
COLUNAS = [
    ("Nome", 34), ("E-mail", 30), ("Telefone", 26), ("Telegram", 10),
    ("Observações", 46), ("Empresa", 34), ("Cidade", 18), ("Segmento", 26),
    ("WhatsApp", 14), ("Bairro", 20), ("Endereço", 32), ("Porte", 16),
    ("Abertura", 11), ("CNPJ", 20), ("E-mail próprio", 14), ("Score", 8),
]
NOMES = [c[0] for c in COLUNAS]

CABECALHO_FILL = PatternFill("solid", fgColor="1F3864")
CABECALHO_FONTE = Font(color="FFFFFF", bold=True, size=11)
FONTE_LINK = Font(color="0563C1", underline="single")
CENTRO = Alignment(horizontal="center")
ITALICO = Font(italic=True, size=10, color="555555")

CENTRALIZADAS = {"Score", "Abertura", "E-mail próprio", "Telegram"}


class Planilha:
    """Grava uma planilha DataRunner linha a linha."""

    def __init__(self, caminho, nota=None):
        self.caminho = caminho
        self.wb = Workbook(write_only=True)
        self.ws = self.wb.create_sheet("Contatos")
        self.linhas = 0

        for i, (_, largura) in enumerate(COLUNAS, start=1):
            self.ws.column_dimensions[get_column_letter(i)].width = largura

        cabecalho_em = 1
        if nota:
            c = WriteOnlyCell(self.ws, value=nota)
            c.font = ITALICO
            self.ws.append([c])
            self.ws.append([])
            cabecalho_em = 3

        cab = []
        for nome in NOMES:
            c = WriteOnlyCell(self.ws, value=nome)
            c.fill = CABECALHO_FILL
            c.font = CABECALHO_FONTE
            c.alignment = Alignment(horizontal="center", vertical="center")
            cab.append(c)
        self.ws.append(cab)

        self.ws.freeze_panes = f"B{cabecalho_em + 1}"
        self._cabecalho_em = cabecalho_em

    def escrever(self, reg):
        linha = []
        for nome in NOMES:
            valor = reg.get(nome, "")
            c = WriteOnlyCell(self.ws, value=valor)
            if nome == "E-mail" and valor:
                c.hyperlink = f"mailto:{valor}"
                c.font = FONTE_LINK
            elif nome == "WhatsApp" and valor:
                c.hyperlink = valor
                c.value = "Chamar"
                c.font = FONTE_LINK
                c.alignment = CENTRO
            elif nome in CENTRALIZADAS:
                c.alignment = CENTRO
            linha.append(c)
        self.ws.append(linha)
        self.linhas += 1

    def fechar(self):
        if self.linhas:
            fim = self._cabecalho_em + self.linhas
            self.ws.auto_filter.ref = (
                f"A{self._cabecalho_em}:{get_column_letter(len(COLUNAS))}{fim}")
        os.makedirs(os.path.dirname(os.path.abspath(self.caminho)), exist_ok=True)
        self.wb.save(self.caminho)
        self.wb.close()
        return self.linhas


def escrever(registros, caminho, nota=None):
    """Atalho para gravar uma lista pronta."""
    p = Planilha(caminho, nota=nota)
    for reg in registros:
        p.escrever(reg)
    return p.fechar()
