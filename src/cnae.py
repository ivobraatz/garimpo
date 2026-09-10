# -*- coding: utf-8 -*-
"""CNAE -> segmento comercial + oportunidade de venda.

As regras sao casadas por prefixo, do mais longo para o mais curto: um codigo
especifico (5223100, estacionamento) vence a divisao inteira (52, transporte).
Assim ~1.300 CNAEs viram algumas dezenas de segmentos sem listar um a um.
"""

# prefixo do CNAE -> (segmento, o que vender)
REGRAS = {
    # ---------- Industria ----------
    "10": ("Industria de alimentos", "ERP de producao, rastreabilidade de lote e portal B2B"),
    "11": ("Industria de bebidas", "ERP, controle de producao e clube de assinatura"),
    "12": ("Industria", "ERP e controle de producao"),
    "13": ("Industria textil", "ERP, ficha tecnica, controle de grade e portal B2B"),
    "14": ("Confeccao e vestuario", "Catalogo B2B para lojistas, ficha tecnica e controle de grade"),
    "15": ("Couro e calcados", "ERP, catalogo B2B e controle de grade"),
    "16": ("Madeira e serraria", "ERP, romaneio digital e controle de patio"),
    "17": ("Papel e celulose", "ERP e controle de producao"),
    "18": ("Grafica e impressao", "Orcamento online, aprovacao de arte e portal do cliente"),
    "19": ("Industria quimica", "ERP e controle de producao"),
    "20": ("Industria quimica", "ERP, ficha de seguranca e controle de lote"),
    "21": ("Industria farmaceutica", "ERP, rastreabilidade e controle sanitario"),
    "22": ("Plasticos e borracha", "ERP, apontamento de producao e portal B2B"),
    "23": ("Minerais nao-metalicos", "ERP e controle de producao"),
    "24": ("Metalurgia", "ERP, apontamento de chao de fabrica e rastreio de pedido"),
    "25": ("Metalurgia e serralheria", "Orcamento digital, ordem de producao e rastreio de pedido"),
    "26": ("Eletroeletronica", "ERP, controle de producao e assistencia tecnica"),
    "27": ("Material eletrico", "ERP, catalogo B2B e controle de producao"),
    "28": ("Maquinas e equipamentos", "ERP, pos-venda, contrato de manutencao e portal de pecas"),
    "29": ("Industria automotiva", "ERP, controle de producao e portal do distribuidor"),
    "30": ("Industria de transportes", "ERP e controle de producao"),
    "31": ("Industria de moveis", "Projeto 3D, orcamento, ordem de producao e portal do cliente"),
    "32": ("Industria diversos", "ERP, e-commerce e controle de producao"),
    "33": ("Manutencao industrial", "Ordem de servico, contrato preventivo e agenda de tecnico"),
    "35": ("Energia", "Portal do cliente e gestao de contrato"),
    "36": ("Saneamento", "Portal do cliente e gestao de rede"),
    "37": ("Saneamento", "Portal do cliente e gestao de rede"),
    "38": ("Residuos e reciclagem", "Roteirizacao de coleta, pesagem e certificado de destinacao"),
    "39": ("Residuos e reciclagem", "Roteirizacao de coleta e certificado de destinacao"),

    # ---------- Construcao ----------
    "41": ("Construtora e incorporadora", "Gestao de obra, medicao, portal do comprador e contrato digital"),
    "42": ("Obras de infraestrutura", "Gestao de obra, medicao e diario de obra"),
    "43": ("Servicos de obra e instalacao", "Ordem de servico, orcamento digital e agenda de equipe"),

    # ---------- Veiculos ----------
    "45": ("Concessionaria e revenda", "CRM de vendas, catalogo online e gestao de test-drive"),
    "452": ("Oficina mecanica", "Ordem de servico digital, orcamento e historico do veiculo"),
    "453": ("Autopecas", "E-commerce, catalogo por aplicacao e balcao digital"),
    "454": ("Motos e pecas", "Catalogo online, ordem de servico e CRM"),
    "4520005": ("Funilaria e pintura", "Ordem de servico, orcamento com foto e integracao com seguradora"),
    "4520007": ("Borracharia e alinhamento", "Agendamento e ordem de servico"),

    # ---------- Atacado ----------
    "46": ("Atacado e distribuidora", "Portal B2B de pedidos, tabela por cliente e roteirizacao"),
    "4623": ("Atacado agropecuario", "Portal B2B, receituario agronomico e controle de estoque"),

    # ---------- Varejo ----------
    "47": ("Varejo diversos", "E-commerce, catalogo online e PDV integrado"),
    "471": ("Supermercado", "E-commerce, encarte digital e cartao fidelidade"),
    "4712": ("Mercearia e conveniencia", "PDV, delivery de bairro e fidelidade"),
    "4721": ("Padaria e confeitaria", "Encomenda online, PDV e fidelidade"),
    "4722": ("Acougue e peixaria", "Pedido por WhatsApp, estoque e delivery"),
    "4723": ("Adega e bebidas", "E-commerce, delivery e clube de assinatura"),
    "4724": ("Hortifruti", "Clube de assinatura, delivery e catalogo semanal"),
    "4729": ("Alimentos especializados", "E-commerce e delivery"),
    "473": ("Posto de combustivel", "Gestao de conveniencia, controle de frota e fidelidade"),
    "4741": ("Material de construcao", "E-commerce B2B, orcamento rapido e entrega"),
    "4742": ("Material de construcao", "E-commerce B2B e catalogo com estoque"),
    "4743": ("Vidracaria", "Orcamento digital e ordem de servico"),
    "4744": ("Material de construcao", "E-commerce B2B, orcamento rapido e entrega"),
    "4751": ("Informatica", "E-commerce, ordem de servico e contrato de suporte"),
    "4752": ("Celulares e eletronicos", "Ordem de servico, controle de garantia e e-commerce"),
    "4753": ("Eletrodomesticos", "E-commerce, assistencia tecnica e garantia"),
    "4754": ("Moveis e decoracao", "E-commerce, projeto 3D e gestao de entrega"),
    "4755": ("Tecidos e armarinho", "E-commerce, catalogo B2B e controle de estoque"),
    "4756": ("Equipamentos para escritorio", "E-commerce B2B e contrato de locacao"),
    "4757": ("Material eletrico varejo", "E-commerce e catalogo"),
    "4759": ("Casa e decoracao", "E-commerce e catalogo"),
    "4761": ("Livraria e papelaria", "E-commerce, lista escolar online e B2B"),
    "4762": ("Midia e games", "E-commerce e catalogo"),
    "4763": ("Brinquedos e artigos esportivos", "E-commerce e catalogo"),
    "4771": ("Farmacia", "E-commerce, delivery de receita e controle de estoque"),
    "4772": ("Perfumaria e cosmeticos", "E-commerce, catalogo e fidelidade"),
    "4773": ("Produtos medicos e oticas", "Catalogo, agenda de exame e controle de locacao"),
    "4774": ("Otica", "Catalogo online, agenda de exame e ordem de laboratorio"),
    "4781": ("Loja de roupas", "E-commerce, controle de grade e CRM de clientes"),
    "4782": ("Loja de calcados", "E-commerce e controle de grade"),
    "4783": ("Joalheria e relojoaria", "E-commerce, catalogo e ordem de conserto"),
    "4784": ("Artigos religiosos e presentes", "E-commerce e catalogo"),
    "4785": ("Brechos e usados", "E-commerce e catalogo"),
    "4789": ("Varejo especializado", "E-commerce e catalogo"),
    "4789004": ("Pet shop", "Agendamento de banho e tosa, e-commerce e clube de assinatura"),
    "479": ("Venda direta e e-commerce", "Loja online propria e CRM"),

    # ---------- Transporte e logistica ----------
    "49": ("Transporte e logistica", "Rastreio de carga, roteirizacao e portal do embarcador"),
    "50": ("Transporte aquaviario", "Rastreio de carga e portal do cliente"),
    "51": ("Transporte aereo", "Portal do cliente e rastreio"),
    "52": ("Logistica e armazenagem", "WMS, rastreio de carga e portal do embarcador"),
    "5223100": ("Estacionamento", "Sistema de gestao de patio, controle de vagas, ticket e mensalista"),
    "53": ("Correio e entrega", "Rastreio, roteirizacao e portal do cliente"),

    # ---------- Hospedagem e alimentacao ----------
    "55": ("Hotel e pousada", "Motor de reserva proprio, PMS e check-in digital"),
    "5590601": ("Aluguel por temporada", "Site de reserva direta e contrato digital"),
    "56": ("Alimentacao", "Cardapio digital, delivery proprio e comanda eletronica"),
    "5611201": ("Restaurante", "Cardapio digital, delivery proprio e sistema de comanda/mesa"),
    "5611203": ("Lanchonete e cafeteria", "App de delivery proprio, painel de cozinha e fidelidade"),
    "5611204": ("Bar e casa noturna", "Comanda eletronica, controle de mesa e venda de ingresso"),
    "5611205": ("Bar e casa noturna", "Comanda eletronica, controle de mesa e venda de ingresso"),
    "5620": ("Buffet e eventos", "Orcamento, agenda de evento e contrato digital"),

    # ---------- Comunicacao e TI ----------
    "58": ("Editora e midia", "Portal de conteudo, assinatura e paywall"),
    "59": ("Audiovisual", "Portfolio online, gestao de projeto e entrega de arquivo"),
    "60": ("Radio e TV", "Portal, streaming e gestao de comercial"),
    "61": ("Telecom e provedor", "Portal do assinante, abertura de chamado e cobranca recorrente"),
    "62": ("TI e software", "Parceria, terceirizacao de desenvolvimento e squad"),
    "63": ("Dados e internet", "Parceria tecnica e integracao"),

    # ---------- Financeiro e imobiliario ----------
    "64": ("Financeiro", "Portal do cliente, simulador e CRM"),
    "65": ("Seguros", "CRM, cotacao online e renovacao automatica"),
    "66": ("Corretora e seguros", "CRM, cotacao online e portal do segurado"),
    "68": ("Imobiliaria", "Portal de imoveis, CRM, tour 360 e contrato digital"),

    # ---------- Servicos profissionais ----------
    "69": ("Advocacia", "Site, CRM juridico, controle de prazo e portal do cliente"),
    "692": ("Contabilidade", "Portal do cliente, envio de documento e automacao fiscal"),
    "70": ("Consultoria empresarial", "Site, CRM e portal do cliente"),
    "71": ("Arquitetura e engenharia", "Portfolio, gestao de projeto e portal do cliente"),
    "72": ("Pesquisa e desenvolvimento", "Site institucional e gestao de projeto"),
    "73": ("Publicidade e marketing", "Site, gestao de job e aprovacao de arte"),
    "74": ("Design e fotografia", "Portfolio online, galeria de entrega e agenda"),
    "75": ("Veterinaria", "Prontuario do pet, agenda de vacina e lembrete"),

    # ---------- Servicos administrativos ----------
    "77": ("Locacao de equipamentos", "Contrato, disponibilidade, checklist e cobranca por periodo"),
    "7711": ("Locadora de veiculos", "Reserva, contrato e checklist de vistoria"),
    "78": ("RH e recrutamento", "Banco de talentos, triagem e portal de vagas"),
    "79": ("Agencia de viagem", "Site de pacotes, CRM e cotacao online"),
    "80": ("Seguranca patrimonial", "Ronda digital, escala de posto e portal do cliente"),
    "81": ("Limpeza e conservacao", "Escala de equipe, checklist e portal do cliente"),
    "8121": ("Limpeza e conservacao", "Escala, checklist digital e portal do cliente"),
    "8130": ("Paisagismo e jardinagem", "Orcamento, contrato recorrente e agenda"),
    "82": ("Servicos administrativos", "Automacao de processo, CRM e portal do cliente"),

    # ---------- Educacao ----------
    "85": ("Educacao", "Portal do aluno, matricula online e cobranca recorrente"),
    "8511": ("Educacao infantil", "Portal dos pais, agenda diaria, matricula e mensalidade"),
    "8512": ("Ensino fundamental", "Portal do aluno, matricula e cobranca recorrente"),
    "8513": ("Ensino fundamental", "Portal do aluno, matricula e cobranca recorrente"),
    "8520": ("Ensino medio", "Portal do aluno, matricula e cobranca recorrente"),
    "8531": ("Ensino superior", "Portal do aluno, EAD e matricula online"),
    "8541": ("Ensino tecnico", "Portal do aluno, EAD e matricula online"),
    "8591": ("Escola de idiomas", "Portal do aluno, turma, cobranca e EAD"),
    "8592": ("Escola de arte e musica", "Agenda de aula, turma e cobranca recorrente"),
    "8593": ("Escola de idiomas", "Portal do aluno, turma e cobranca recorrente"),
    "8599": ("Curso livre e treinamento", "Plataforma EAD, turma e cobranca recorrente"),
    "8599204": ("Autoescola", "Agendamento de aula, controle de aluno e simulado online"),

    # ---------- Saude ----------
    "86": ("Saude", "Agendamento online, prontuario eletronico e gestao de convenio"),
    "8610": ("Hospital", "Gestao hospitalar, agendamento e portal do paciente"),
    "8630": ("Clinica e consultorio", "Prontuario eletronico, agenda online e telemedicina"),
    "8630504": ("Odontologia", "Agenda, prontuario, orcamento e controle de convenio"),
    "8640": ("Laboratorio e diagnostico", "Portal de resultado, agendamento e integracao com convenio"),
    "8650": ("Terapias e fisioterapia", "Agenda, evolucao do paciente e pacote de sessao"),
    "8690": ("Saude complementar", "Agenda, prontuario e pacote de sessao"),
    "87": ("Clinica de repouso e cuidado", "Prontuario, escala de cuidador e portal da familia"),
    "88": ("Assistencia social", "Gestao de atendimento e portal"),

    # ---------- Setor publico ----------
    "84": ("Administracao publica", "Portal do cidadao, protocolo eletronico e gestao (via licitacao)"),

    # ---------- Cultura, esporte e lazer ----------
    "90": ("Arte e cultura", "Venda de ingresso, agenda e portal"),
    "91": ("Museu e patrimonio", "Venda de ingresso e controle de acesso"),
    "92": ("Loteria e apostas", "Portal e automacao de atendimento"),
    "93": ("Esporte e lazer", "Reserva de horario, mensalidade e gestao de turma"),
    "9313": ("Academia", "Controle de acesso, plano recorrente, treino no app e cobranca"),
    "9321": ("Parque e diversao", "Venda de ingresso online e controle de acesso"),

    # ---------- Servicos pessoais ----------
    "94": ("Associacao e sindicato", "Portal do associado, carteirinha digital e cobranca"),
    "9601": ("Lavanderia", "Coleta e entrega, rastreio de peca e assinatura"),
    "9602": ("Salao de beleza e barbearia", "Agendamento online, comissao por profissional e fidelidade"),
    "9603": ("Funeraria", "Gestao de contrato, plano recorrente e atendimento 24h"),
    "9609": ("Servicos pessoais", "Agendamento online e cobranca"),
    "9609202": ("Estetica e bem-estar", "Agendamento, pacote de sessao e ficha de anamnese"),
    "95": ("Assistencia tecnica", "Ordem de servico, controle de garantia e status online"),
    "9511": ("Assistencia tecnica de informatica", "Ordem de servico, contrato de suporte e chamado online"),

    # ---------- Agro ----------
    "01": ("Agropecuaria", "Gestao de safra, rastreabilidade e venda direta"),
    "02": ("Silvicultura", "Gestao de talhao, romaneio e rastreabilidade"),
    "03": ("Pesca e aquicultura", "Rastreabilidade, venda direta e gestao de producao"),
    "05": ("Extracao mineral", "ERP e controle de producao"),
    "06": ("Extracao mineral", "ERP e controle de producao"),
    "07": ("Extracao mineral", "ERP e controle de producao"),
    "08": ("Extracao mineral", "ERP, romaneio e controle de patio"),
    "09": ("Apoio a extracao", "Ordem de servico e gestao de contrato"),
}

# Peso comercial: quanto vale a pena investir na abordagem desse segmento.
PESO = {
    "Metalurgia e serralheria": 10, "Metalurgia": 10, "Industria de moveis": 10,
    "Confeccao e vestuario": 10, "Industria textil": 10, "Maquinas e equipamentos": 10,
    "Construtora e incorporadora": 10, "Atacado e distribuidora": 10,
    "Plasticos e borracha": 9, "Industria de alimentos": 9, "Eletroeletronica": 9,
    "Imobiliaria": 9, "Transporte e logistica": 9, "Logistica e armazenagem": 9,
    "Telecom e provedor": 9, "Estacionamento": 9, "Material de construcao": 9,
    "Industria automotiva": 9, "Madeira e serraria": 9, "Manutencao industrial": 9,
    "Oficina mecanica": 8, "Clinica e consultorio": 8, "Odontologia": 8,
    "Contabilidade": 8, "Advocacia": 8, "Academia": 8, "Hotel e pousada": 8,
    "Concessionaria e revenda": 8, "Supermercado": 8, "Servicos de obra e instalacao": 8,
    "Grafica e impressao": 8, "Laboratorio e diagnostico": 8, "Locacao de equipamentos": 8,
    "Restaurante": 7, "Educacao": 7, "Educacao infantil": 7, "Autoescola": 7,
    "Pet shop": 7, "Salao de beleza e barbearia": 7, "Farmacia": 7,
    "Assistencia tecnica": 7, "Buffet e eventos": 7, "Agropecuaria": 7,
    # Venda por licitacao ou publico incerto: nao deve disputar o topo da lista.
    "Associacao e sindicato": 4, "Assistencia social": 3, "Loteria e apostas": 3,
    "Administracao publica": 2,
}


def classificar(codigo):
    """(segmento, oportunidade) para um CNAE de 7 digitos."""
    codigo = (codigo or "").strip()
    for tamanho in (7, 6, 5, 4, 3, 2):
        regra = REGRAS.get(codigo[:tamanho])
        if regra:
            return regra
    return ("Outros", "Site institucional e sistema sob medida")


def peso(segmento):
    return PESO.get(segmento, 5)
