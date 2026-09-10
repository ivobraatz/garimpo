# -*- coding: utf-8 -*-
"""Relatorio Markdown da geracao: indice dos arquivos + resumo do que saiu."""

import os
import time
from collections import Counter, defaultdict

PORTES_ORDEM = ["Medio/grande", "Pequeno porte", "Microempresa", "Nao informado"]

FAIXAS_SCORE = [
    (90, 100, "90-100", "Prioridade maxima"),
    (75, 89, "75-89", "Alta"),
    (60, 74, "60-74", "Media"),
    (0, 59, "abaixo de 60", "Baixa"),
]


class Estatisticas:
    """Acumula os numeros durante a geracao, sem guardar os contatos."""

    def __init__(self):
        self.lidos = 0
        self.fora_do_recorte = 0
        self.sem_canal = 0
        self.sem_nome = 0
        self.aproveitados = 0
        self.com_email = 0
        self.com_celular = 0
        self.com_ambos = 0
        self.dominio_proprio = 0
        self.portes = Counter()
        self.cidades = Counter()
        self.scores = Counter()
        self.decadas = Counter()
        self.por_segmento = defaultdict(Counter)
        self.cidade_do_segmento = defaultdict(Counter)

    def registrar(self, segmento, cidade, email, celular, dominio, porte, score, ano):
        self.aproveitados += 1
        s = self.por_segmento[segmento]
        s["total"] += 1
        if email:
            self.com_email += 1
            s["email"] += 1
            if dominio:
                self.dominio_proprio += 1
                s["dominio"] += 1
        if celular:
            self.com_celular += 1
            s["celular"] += 1
        if email and celular:
            self.com_ambos += 1
            s["ambos"] += 1
        self.portes[porte] += 1
        s[porte] += 1
        self.cidades[cidade] += 1
        self.cidade_do_segmento[segmento][cidade] += 1
        self.scores[score] += 1
        try:
            self.decadas[f"{int(ano) // 10 * 10}s"] += 1
        except (TypeError, ValueError):
            pass


def _pct(parte, total):
    return f"{100 * parte / total:.1f}%" if total else "-"


def _mil(n):
    return f"{n:,}".replace(",", ".")


def _faixa(scores):
    saida = []
    total = sum(scores.values())
    for baixo, alto, rotulo, nome in FAIXAS_SCORE:
        n = sum(v for k, v in scores.items() if baixo <= k <= alto)
        if n:
            saida.append((rotulo, nome, n, _pct(n, total)))
    return saida


def gerar(escritos, stats, uf, meta, cidades_alvo, min_linhas, segundos,
          caminho, banco_em=None):
    """Escreve o relatorio. `escritos` = [(segmento, linhas, arquivo), ...]"""
    total = sum(n for _, n, _ in escritos)
    L = []
    a = L.append

    recorte = ", ".join(cidades_alvo) if cidades_alvo else f"todo o estado ({uf})"
    versao = meta.get("versao_receita", "desconhecida")
    baixado = meta.get("baixado_em", "-")

    a(f"# Prospecção — {uf}")
    a("")
    unidade = "planilhas" if any(x[2] for x in escritos) else "segmentos"
    a(f"**{_mil(total)} contatos** em **{_mil(len(stats.cidades))} municípios**, "
      f"distribuídos em **{len(escritos)} {unidade}**.")
    a("")
    a("| | |")
    a("|---|---|")
    a(f"| Recorte | {recorte} |")
    a(f"| Cadastro da Receita | publicação de `{versao}` |")
    a(f"| Baixado em | {baixado} |")
    a(f"| Gerado em | {time.strftime('%Y-%m-%d %H:%M')} |")
    a(f"| Tempo de geração | {segundos/60:.1f} min |")
    if banco_em:
        tam = os.path.getsize(banco_em) / 1e6 if os.path.exists(banco_em) else 0
        a(f"| Banco | `{os.path.basename(banco_em)}` ({tam:.0f} MB) |")
    a("")
    if banco_em:
        a("Os contatos ficam no banco `contatos.db`, pesquisável por nome, "
          "município e segmento. As planilhas são exportações sob demanda — "
          "veja `src/exportar.py`.")
    else:
        a("Cada arquivo tem uma aba **Contatos** pronta para o importador do "
          "DataRunner. Ordenados por `Score`, do melhor lead para o mais fraco.")
    a("")

    # ---- Funil ----
    a("## Do cadastro à lista")
    a("")
    a("| Etapa | Registros | |")
    a("|---|---:|---:|")
    a(f"| Estabelecimentos ativos lidos | {_mil(stats.lidos)} | 100% |")
    if stats.fora_do_recorte:
        a(f"| Fora do recorte de cidades | −{_mil(stats.fora_do_recorte)} | "
          f"{_pct(stats.fora_do_recorte, stats.lidos)} |")
    a(f"| Sem e-mail e sem celular | −{_mil(stats.sem_canal)} | "
      f"{_pct(stats.sem_canal, stats.lidos)} |")
    if stats.sem_nome:
        a(f"| Sem nome utilizável | −{_mil(stats.sem_nome)} | "
          f"{_pct(stats.sem_nome, stats.lidos)} |")
    a(f"| **Contatos na lista** | **{_mil(total)}** | "
      f"**{_pct(total, stats.lidos)}** |")
    a("")
    a("Linha sem e-mail e sem celular fica de fora de propósito: o importador "
      "do DataRunner a contaria e pularia, porque telefone fixo não é canal "
      "de envio.")
    a("")

    # ---- Canais ----
    ap = stats.aproveitados
    a("## Canais de contato")
    a("")
    a("| Canal | Contatos | % da lista |")
    a("|---|---:|---:|")
    a(f"| Com e-mail | {_mil(stats.com_email)} | {_pct(stats.com_email, ap)} |")
    a(f"| Com celular (WhatsApp) | {_mil(stats.com_celular)} | "
      f"{_pct(stats.com_celular, ap)} |")
    a(f"| Com os dois | {_mil(stats.com_ambos)} | {_pct(stats.com_ambos, ap)} |")
    a("")
    sem_dominio = stats.com_email - stats.dominio_proprio
    a("### Domínio próprio no e-mail")
    a("")
    a("| | Contatos | % de quem tem e-mail |")
    a("|---|---:|---:|")
    a(f"| **Sem** domínio próprio (`@gmail`, `@hotmail`…) | {_mil(sem_dominio)} | "
      f"{_pct(sem_dominio, stats.com_email)} |")
    a(f"| Com domínio próprio (`@empresa.com.br`) | {_mil(stats.dominio_proprio)} | "
      f"{_pct(stats.dominio_proprio, stats.com_email)} |")
    a("")
    a(f"Os **{_mil(sem_dominio)} sem domínio próprio** são o alvo mais direto para "
      "vender site: quem não tem domínio quase nunca tem presença digital. "
      "Para quem já tem domínio, a venda é sistema, CRM ou app.")
    a("")

    # ---- Porte ----
    a("## Porte da empresa")
    a("")
    a("| Porte | Contatos | % |")
    a("|---|---:|---:|")
    for p in PORTES_ORDEM:
        if stats.portes.get(p):
            a(f"| {p} | {_mil(stats.portes[p])} | {_pct(stats.portes[p], ap)} |")
    a("")
    a("O porte entra no `Score`: sem ele, todo MEI com celular e Gmail empatava "
      "com uma indústria de médio porte.")
    a("")

    # ---- Score ----
    a("## Distribuição do Score")
    a("")
    a("| Faixa | Prioridade | Contatos | % |")
    a("|---|---|---:|---:|")
    for rotulo, nome, n, pct in _faixa(stats.scores):
        a(f"| {rotulo} | {nome} | {_mil(n)} | {pct} |")
    a("")

    # ---- Idade ----
    if stats.decadas:
        a("## Ano de abertura")
        a("")
        a("| Década | Contatos | % |")
        a("|---|---:|---:|")
        for d, n in sorted(stats.decadas.items(), reverse=True):
            a(f"| {d} | {_mil(n)} | {_pct(n, ap)} |")
        a("")

    # ---- Cidades ----
    a("## Top 30 municípios")
    a("")
    a("| # | Município | Contatos | % |")
    a("|---:|---|---:|---:|")
    for i, (cidade, n) in enumerate(stats.cidades.most_common(30), 1):
        a(f"| {i} | {cidade} | {_mil(n)} | {_pct(n, ap)} |")
    a("")
    if len(stats.cidades) > 30:
        resto = ap - sum(n for _, n in stats.cidades.most_common(30))
        a(f"Outros {len(stats.cidades) - 30} municípios somam {_mil(resto)} contatos.")
        a("")

    # ---- Indice ----
    a("## Índice por segmento")
    a("")
    a("Ordenado por volume. `Cel.` = tem celular, `E-mail` = tem e-mail, "
      "`Sem dom.` = e-mail em provedor gratuito (candidato a site).")
    a("")
    tem_arquivo = any(arq for _, _, arq in escritos)
    cab_arq = " Arquivo |" if tem_arquivo else ""
    a("| # | Segmento | Contatos | Cel. | E-mail | Sem dom. | Principal cidade |" + cab_arq)
    a("|---:|---|---:|---:|---:|---:|---|" + ("---|" if tem_arquivo else ""))
    for i, (segmento, n, arquivo) in enumerate(escritos, 1):
        s = stats.por_segmento.get(segmento, Counter())
        if segmento == "Outros segmentos":
            cidade = "—"
            cel = mail = semdom = "—"
        else:
            topo = stats.cidade_do_segmento.get(segmento, Counter()).most_common(1)
            cidade = topo[0][0] if topo else "—"
            cel = _mil(s.get("celular", 0))
            mail = _mil(s.get("email", 0))
            semdom = _mil(s.get("email", 0) - s.get("dominio", 0))
        fim = f" `{arquivo}` |" if tem_arquivo else ""
        a(f"| {i} | {segmento} | {_mil(n)} | {cel} | {mail} | {semdom} | "
          f"{cidade} |" + fim)
    a("")
    if tem_arquivo:
        a(f"Segmentos com menos de {min_linhas} contatos foram reunidos em "
          "`outros-segmentos.xlsx` — filtre pela coluna `Segmento`.")
    a("")

    # ---- Como refazer ----
    a("## Como refazer")
    a("")
    a("```bash")
    a("# 1. baixar o cadastro (uma vez por mês; a Receita publica mensalmente)")
    a(f"python src/ingestar_receita.py --uf {uf}")
    a("")
    a("# 2. gerar as planilhas (rápido, usa o que já está em disco)")
    a(f"python src/gerar_leads.py --uf {uf}")
    a("```")
    a("")
    a("| Quero | Comando |")
    a("|---|---|")
    a("| Outro estado | `python src/ingestar_receita.py --uf PR` e depois "
      "`python src/gerar_leads.py --uf PR` |")
    a("| Só algumas cidades | `python src/gerar_leads.py --cidades Blumenau Timbo` |")
    a("| Menos arquivos, mais gordos | `python src/gerar_leads.py --min-linhas 8000` |")
    a("| Refazer só as razões sociais | "
      "`python src/ingestar_receita.py --somente-empresas` |")
    a("")
    a("A etapa 1 baixa ~6,7 GB que inflam para ~70 GB, mas nada disso fica em "
      "disco: cada bloco é baixado, filtrado e apagado. Pico de ~2,2 GB de disco "
      "e ~500 MB de RAM. A etapa 2 não usa rede.")
    a("")
    a("---")
    a("")
    a("Fonte: Dados Abertos do CNPJ, Receita Federal do Brasil. Boa parte desta "
      "base é MEI e empresário individual — nesses casos o e-mail e o celular "
      "são de pessoa física e a LGPD se aplica: identifique-se, diga como chegou "
      "ao contato e respeite pedido de descadastro.")

    os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    return caminho
