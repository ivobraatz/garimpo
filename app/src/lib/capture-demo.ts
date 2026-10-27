/** Dados fictícios, estáveis e exclusivamente locais para as gravações de produto. */
type Contato = { id: number; cnpj: string; nome: string; empresa: string; email: string; telefone: string; whatsapp: string; cidade: string; bairro: string; endereco: string; segmento: string; oportunidade: string; porte: string; abertura: string; dominio_proprio: boolean; score: number };
type Area = { codigo: string; nome: string; contatos: number; com_email: number; com_celular: number; sem_dominio: number; score_medio: number };

const contatos: Contato[] = [
  { id: 1, cnpj: "12.345.678/0001-01", nome: "Metalúrgica Horizonte", empresa: "Horizonte Indústria", email: "compras@horizonte.example", telefone: "(41) 99842-1180", whatsapp: "https://example.invalid/whatsapp/horizonte", cidade: "Curitiba", bairro: "Cidade Industrial", endereco: "Rua das Indústrias, 420", segmento: "Metalurgia", oportunidade: "Compra recorrente e operação sem domínio próprio.", porte: "Medio/grande", abertura: "2012-04-18", dominio_proprio: false, score: 96 },
  { id: 2, cnpj: "23.456.789/0001-02", nome: "Madeiras Pinheiro", empresa: "Pinheiro Comércio de Madeiras", email: "contato@pinheiro.example", telefone: "(41) 99124-0731", whatsapp: "", cidade: "São José dos Pinhais", bairro: "Afonso Pena", endereco: "Av. das Araucárias, 91", segmento: "Madeira e móveis", oportunidade: "Boa presença de e-mail; priorize uma abordagem de catálogo.", porte: "Medio/grande", abertura: "2007-11-03", dominio_proprio: true, score: 91 },
  { id: 3, cnpj: "34.567.890/0001-03", nome: "Clínica Vida Norte", empresa: "Vida Norte Serviços", email: "agenda@vidanorte.example", telefone: "(41) 98811-2486", whatsapp: "https://example.invalid/whatsapp/vida-norte", cidade: "Curitiba", bairro: "Bacacheri", endereco: "Rua do Sol, 18", segmento: "Saúde", oportunidade: "Contato direto por WhatsApp e alta pontuação de aderência.", porte: "Pequeno", abertura: "2018-08-21", dominio_proprio: false, score: 88 },
  { id: 4, cnpj: "45.678.901/0001-04", nome: "Logística Vale", empresa: "Vale Logística", email: "operacao@vale.example", telefone: "(41) 99741-5092", whatsapp: "", cidade: "Araucária", bairro: "Thomaz Coelho", endereco: "Rod. do Xisto, km 8", segmento: "Transporte", oportunidade: "Equipe operacional concentrada em um único contato.", porte: "Medio/grande", abertura: "2005-02-10", dominio_proprio: true, score: 84 },
  { id: 5, cnpj: "56.789.012/0001-05", nome: "Café do Mercado", empresa: "Café do Mercado Ltda.", email: "", telefone: "(41) 99620-1138", whatsapp: "https://example.invalid/whatsapp/cafe", cidade: "Pinhais", bairro: "Centro", endereco: "Rua Camilo, 55", segmento: "Alimentação", oportunidade: "WhatsApp é o canal principal para o primeiro contato.", porte: "Pequeno", abertura: "2020-01-14", dominio_proprio: false, score: 79 },
];
const municipios: Area[] = [
  { codigo: "4106902", nome: "Curitiba", contatos: 4820, com_email: 3488, com_celular: 3145, sem_dominio: 1820, score_medio: 71.4 },
  { codigo: "4125506", nome: "São José dos Pinhais", contatos: 2104, com_email: 1390, com_celular: 1512, sem_dominio: 714, score_medio: 68.2 },
  { codigo: "4101804", nome: "Araucária", contatos: 1286, com_email: 802, com_celular: 911, sem_dominio: 484, score_medio: 66.8 },
  { codigo: "4119509", nome: "Pinhais", contatos: 1011, com_email: 650, com_celular: 744, sem_dominio: 401, score_medio: 65.7 },
  { codigo: "4109401", nome: "Colombo", contatos: 803, com_email: 511, com_celular: 568, sem_dominio: 322, score_medio: 63.9 },
];
const ramos: Area[] = [
  { codigo: "metalurgia", nome: "Metalurgia", contatos: 1746, com_email: 1134, com_celular: 1211, sem_dominio: 682, score_medio: 74.2 },
  { codigo: "comercio", nome: "Comércio varejista", contatos: 1624, com_email: 1002, com_celular: 1190, sem_dominio: 641, score_medio: 70.8 },
  { codigo: "construcao", nome: "Construção", contatos: 1382, com_email: 911, com_celular: 1014, sem_dominio: 550, score_medio: 69.1 },
  { codigo: "saude", nome: "Saúde", contatos: 1249, com_email: 948, com_celular: 782, sem_dominio: 398, score_medio: 72.6 },
  { codigo: "transporte", nome: "Transporte", contatos: 1090, com_email: 640, com_celular: 804, sem_dominio: 438, score_medio: 67.3 },
  { codigo: "alimentos", nome: "Alimentação", contatos: 933, com_email: 612, com_celular: 704, sem_dominio: 390, score_medio: 65.8 },
];
const estados = [
  { uf: "PR", contatos: 10024, municipios: 5, versao_receita: "2026-08", gerado_em: "2026-09-20", recorte: "região de Curitiba", tamanho_mb: 84.2 },
  { uf: "SC", contatos: 7480, municipios: 4, versao_receita: "2026-08", gerado_em: "2026-09-20", recorte: "Vale do Itajaí", tamanho_mb: 61.8 },
  { uf: "SP", contatos: 15620, municipios: 6, versao_receita: "2026-08", gerado_em: "2026-09-20", recorte: "Campinas e região", tamanho_mb: 118.6 },
];
const geo = (areas: { codigo: string; x: number; y: number }[]) => ({ type: "FeatureCollection", features: areas.map(({ codigo, x, y }) => ({ type: "Feature", properties: { codarea: codigo }, geometry: { type: "Polygon", coordinates: [[[x, y], [x + 2.2, y], [x + 2.2, y + 1.4], [x, y + 1.4], [x, y]]] } })) });
const brasil = geo([{ codigo: "41", x: -54, y: -27 }, { codigo: "42", x: -51, y: -27 }, { codigo: "35", x: -48, y: -23 }]);
const parana = geo([{ codigo: "4106902", x: -49.5, y: -25.7 }, { codigo: "4125506", x: -47.1, y: -25.3 }, { codigo: "4101804", x: -49.1, y: -26.6 }, { codigo: "4119509", x: -48.2, y: -25.4 }, { codigo: "4109401", x: -49.0, y: -25.0 }]);

export function respostaDemo(comando: string, args: Record<string, unknown>): unknown {
  switch (comando) {
    case "estados": return estados;
    case "buscar": { const f = (args.filtros ?? {}) as { termo?: string; segmento?: string; score_minimo?: number; somente_celular?: boolean; somente_email?: boolean; somente_sem_dominio?: boolean }; const termo = (f.termo ?? "").toLocaleLowerCase(); const itens = contatos.filter((c) => (!termo || `${c.nome} ${c.empresa} ${c.cidade}`.toLocaleLowerCase().includes(termo)) && (!f.segmento || c.segmento === f.segmento) && (!f.score_minimo || c.score >= f.score_minimo) && (!f.somente_celular || !!c.whatsapp) && (!f.somente_email || !!c.email) && (!f.somente_sem_dominio || (!!c.email && !c.dominio_proprio))); return { total: termo || f.segmento || f.score_minimo ? itens.length : 10024, itens }; }
    case "municipios": return municipios;
    case "segmentos": return ramos;
    case "facetas": return { municipios, segmentos: ramos };
    case "malha": return String(args.nome).includes("br") ? brasil : parana;
    case "garantir_malha": case "atualizar": case "definir_pasta_dados": return undefined;
    case "ajustes": return { dados: "C:\\Garimpo\\dados", scripts: "C:\\Garimpo\\app", repo: true, livre_gb: 482.7, ocupado_gb: 0.3 };
    case "apagar_estado": return 0;
    case "exportar": return "C:\\Garimpo\\exportacao-demo.xlsx";
    default: throw new Error(`Comando de demonstração desconhecido: ${comando}`);
  }
}
