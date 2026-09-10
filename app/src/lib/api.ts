// Ponte com o backend Rust. Nada aqui fala com o banco direto: o Rust abre o
// SQLite em modo leitura e devolve JSON.

import { invoke } from "@tauri-apps/api/core";

export type Contato = {
  id: number;
  cnpj: string;
  nome: string;
  empresa: string;
  email: string;
  telefone: string;
  whatsapp: string;
  cidade: string;
  bairro: string;
  endereco: string;
  segmento: string;
  oportunidade: string;
  porte: string;
  abertura: string;
  dominio_proprio: boolean;
  score: number;
};

export type PaginaContatos = { total: number; itens: Contato[] };

export type ContagemArea = {
  codigo: string;
  nome: string;
  contatos: number;
  com_email: number;
  com_celular: number;
  sem_dominio: number;
  score_medio: number;
};

export type EstadoDisponivel = {
  uf: string;
  contatos: number;
  municipios: number;
  versao_receita: string;
  gerado_em: string;
  recorte: string;
  tamanho_mb: number;
};

export type Filtros = {
  termo: string;
  cidade: string;
  segmento: string;
  porte: string;
  score_minimo: number;
  somente_celular: boolean;
  somente_email: boolean;
  somente_sem_dominio: boolean;
  ordem: string;
};

export const filtrosVazios = (): Filtros => ({
  termo: "",
  cidade: "",
  segmento: "",
  porte: "",
  score_minimo: 0,
  somente_celular: false,
  somente_email: false,
  somente_sem_dominio: false,
  ordem: "score",
});

export const estados = () => invoke<EstadoDisponivel[]>("estados");

export type Ajustes = {
  /** Pasta dos dados — fica fora da instalação e sobrevive a atualizações. */
  dados: string;
  /** Pasta dos scripts — vem junto com o app e é trocada a cada atualização. */
  scripts: string;
  /** Verdadeiro quando rodando de dentro do repositório. */
  repo: boolean;
  livre_gb: number;
  ocupado_gb: number;
};

export const ajustes = () => invoke<Ajustes>("ajustes");

/** Troca a pasta de dados. Com `mover`, leva o conteúdo atual junto. */
export const definirPastaDados = (caminho: string, mover: boolean) =>
  invoke<void>("definir_pasta_dados", { caminho, mover });

/** Apaga um estado; devolve quantos GB foram liberados. */
export const apagarEstado = (uf: string, downloads: boolean) =>
  invoke<number>("apagar_estado", { uf, downloads });

export const buscar = (uf: string, filtros: Filtros, pagina: number, porPagina: number) =>
  invoke<PaginaContatos>("buscar", { uf, filtros, pagina, porPagina });

export const municipios = (uf: string) =>
  invoke<ContagemArea[]>("municipios", { uf });

export const segmentos = (uf: string) =>
  invoke<ContagemArea[]>("segmentos", { uf });

export const malha = (nome: string) =>
  invoke<GeoJSON.FeatureCollection>("malha", { nome });

export const garantirMalha = (uf: string) =>
  invoke<void>("garantir_malha", { uf });

export const exportar = (args: {
  uf: string;
  cidade: string;
  segmento: string;
  scoreMinimo: number;
  ids: number[];
  destino: string;
}) => invoke<string>("exportar", args);

/** Baixa e monta os estados pedidos. Várias UFs custam um download só. */
export const atualizar = (
  ufs: string[],
  baixarCadastro: boolean,
  cidades: string[],
) => invoke<void>("atualizar", { ufs, baixarCadastro, cidades });

// Codigo IBGE de cada UF: acha a malha do estado e colore o mapa do Brasil.
export const CODIGO_UF: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27",
  SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41",
  SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53",
};

export const UF_POR_CODIGO: Record<string, string> = Object.fromEntries(
  Object.entries(CODIGO_UF).map(([uf, codigo]) => [codigo, uf]),
);
