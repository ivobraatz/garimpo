# -*- coding: utf-8 -*-
"""Normalizacao de e-mail e telefone vindos do cadastro da Receita.

As regras do importador do DataRunner mandam no formato:

  * Nome e obrigatorio -- linha sem nome e pulada.
  * E preciso pelo menos um endereco: e-mail ou CELULAR. Telefone fixo nao e
    canal de envio; uma linha que so tem fixo e contada e pulada. Por isso o
    celular vem primeiro na coluna Telefone e linhas sem celular e sem e-mail
    ficam de fora das planilhas de campanha.
  * Dois numeros na mesma celula, separados por barra, viram dois cadastros.
"""

import re

# Provedores gratuitos: quem usa um deles quase sempre nao tem dominio proprio
# -- e quem nao tem dominio proprio normalmente nao tem site.
PROVEDORES_GRATUITOS = {
    "gmail.com", "hotmail.com", "outlook.com", "outlook.com.br", "yahoo.com",
    "yahoo.com.br", "bol.com.br", "uol.com.br", "terra.com.br", "ig.com.br",
    "globo.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com",
    "zipmail.com.br", "oi.com.br", "r7.com", "protonmail.com", "gmail.com.br",
    "hotmail.com.br", "yahoo.com.ar", "bol.com", "click21.com.br", "superig.com.br",
}

# E-mails que existem no cadastro mas nao servem para contato comercial.
EMAIL_DESCARTAVEL = re.compile(
    r"^(nao|n)?(tem|possui|consta|informado|declarado)|^(sem|nada|xxx+|teste|test|"
    r"exemplo|email|e-mail|naotem|naopossui)@|@(exemplo|teste|test|email)\.",
    re.I,
)
EMAIL_VALIDO = re.compile(r"^[^@\s;,]+@[a-z0-9]([a-z0-9\-.]*[a-z0-9])?\.[a-z]{2,}$", re.I)

def normalizar_email(bruto):
    """Devolve o primeiro e-mail plausivel do campo, ou string vazia."""
    if not bruto:
        return ""
    texto = bruto.strip().lower()
    for pedaco in re.split(r"[;,/\s]+", texto):
        pedaco = pedaco.strip(".<>()[]\"'")
        if not pedaco or "@" not in pedaco:
            continue
        if EMAIL_DESCARTAVEL.search(pedaco) or not EMAIL_VALIDO.match(pedaco):
            continue
        if len(pedaco) > 90:
            continue
        return pedaco
    return ""


def dominio(email):
    return email.split("@", 1)[1] if "@" in email else ""


def tem_dominio_proprio(email):
    """True quando o e-mail nao esta num provedor gratuito."""
    d = dominio(email)
    return bool(d) and d not in PROVEDORES_GRATUITOS


def normalizar_telefone(ddd, numero):
    """(ddd, numero) do cadastro -> E.164, ou string vazia se inaproveitavel.

    O cadastro da Receita guarda o assinante com oito digitos, anterior a
    migracao do nono digito: "99887649" e um celular cujo numero atual e
    "999887649". Tratar os oito digitos como estao classifica todo celular
    como fixo -- e fixo nao e canal de envio.

    A regra nacional: assinante de oito digitos comecando em 6, 7, 8 ou 9 e
    movel e recebe o nono digito; comecando em 2, 3, 4 ou 5 e fixo.
    """
    ddd = re.sub(r"\D", "", ddd or "")
    numero = re.sub(r"\D", "", numero or "")
    if not numero:
        return ""
    # Alguns cadastros repetem o DDD dentro do proprio numero.
    if not ddd and len(numero) in (10, 11):
        ddd, numero = numero[:2], numero[2:]
    if len(ddd) != 2 or not ddd.isdigit() or ddd[0] == "0":
        return ""
    if len(numero) == 8 and numero[0] in "6789":
        numero = "9" + numero
    if len(numero) not in (8, 9):
        return ""
    if numero[0] == "0" or len(set(numero)) == 1:
        return ""
    return f"+55{ddd}{numero}"


def eh_celular(e164):
    """No Brasil o celular tem 9 digitos e comeca com 9."""
    if not e164:
        return False
    resto = e164[5:]
    return len(resto) == 9 and resto[0] == "9"


def formatar(e164):
    if not e164:
        return ""
    d = e164[3:]
    ddd, resto = d[:2], d[2:]
    return f"({ddd}) {resto[:-4]}-{resto[-4:]}"


def link_whatsapp(e164):
    return f"https://wa.me/{e164[1:]}" if eh_celular(e164) else ""


def montar_telefones(ddd1, tel1, ddd2, tel2):
    """Lista de numeros unicos, celulares primeiro.

    A ordem importa: o DataRunner usa o primeiro numero da celula como canal,
    e mandar mensagem para um fixo nao chega a ninguem.
    """
    numeros = []
    for d, t in ((ddd1, tel1), (ddd2, tel2)):
        e164 = normalizar_telefone(d, t)
        if e164 and e164 not in numeros:
            numeros.append(e164)
    numeros.sort(key=lambda n: not eh_celular(n))
    return numeros
