"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CloudDownload, Database, FolderOpen, HardDrive, Play, RefreshCw, Trash2,
} from "lucide-react";

import {
  ajustes as lerAjustes, apagarEstado, definirPastaDados,
  type Ajustes, type EstadoDisponivel,
} from "@/lib/api";
import type { Trabalho } from "@/lib/trabalho";
import { mil } from "@/lib/formato";
import estilos from "./Base.module.css";

// As 27 unidades da federação, agrupadas por região — assim a grade tem ordem
// geográfica em vez de uma lista alfabética de 27 caixinhas.
const REGIOES: { nome: string; ufs: string[] }[] = [
  { nome: "Sul", ufs: ["PR", "RS", "SC"] },
  { nome: "Sudeste", ufs: ["ES", "MG", "RJ", "SP"] },
  { nome: "Centro-Oeste", ufs: ["DF", "GO", "MS", "MT"] },
  { nome: "Nordeste", ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
  { nome: "Norte", ufs: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"] },
];

export default function Base({
  estados,
  ufAtual,
  aoTrocarUf,
  aoTerminar,
  avisar,
  trabalho,
}: {
  estados: EstadoDisponivel[];
  ufAtual: string;
  aoTrocarUf: (uf: string) => void;
  aoTerminar: () => void;
  avisar: (texto: string, tipo?: "bom" | "ruim") => void;
  trabalho: Trabalho;
}) {
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [baixar, setBaixar] = useState(true);
  const [config, setConfig] = useState<Ajustes | null>(null);
  const [apagando, setApagando] = useState("");
  const fimLog = useRef<HTMLDivElement>(null);

  const recarregarAjustes = useCallback(() => {
    lerAjustes().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => { recarregarAjustes(); }, [recarregarAjustes, estados]);

  const trocarPasta = async () => {
    const escolhida = await open({ directory: true, title: "Onde guardar os dados" });
    if (!escolhida || typeof escolhida !== "string") return;
    try {
      await definirPastaDados(escolhida, true);
      avisar("Pasta trocada; os dados foram movidos.", "bom");
      recarregarAjustes();
      aoTerminar();
    } catch (e) {
      avisar(String(e), "ruim");
    }
  };

  const apagar = async (uf: string, comDownloads: boolean) => {
    setApagando(uf);
    try {
      const gb = await apagarEstado(uf, comDownloads);
      avisar(`${uf} apagado — ${gb.toFixed(1)} GB liberados.`, "bom");
      recarregarAjustes();
      aoTerminar();
    } catch (e) {
      avisar(String(e), "ruim");
    } finally {
      setApagando("");
    }
  };

  const jaTem = useMemo(
    () => new Map(estados.map((e) => [e.uf, e])),
    [estados],
  );

  // O log vem do trabalho, que vive acima das abas.
  const { rodando, linhas } = trabalho;

  useEffect(() => {
    fimLog.current?.scrollIntoView({ block: "end" });
  }, [linhas]);

  const alternar = (uf: string) => {
    setEscolhidos((s) => {
      const novo = new Set(s);
      if (novo.has(uf)) novo.delete(uf); else novo.add(uf);
      return novo;
    });
  };

  const rodar = () => {
    const ufs = [...escolhidos];
    setEscolhidos(new Set());
    // Não espera terminar: o trabalho segue no nível do app e a tela continua
    // usável, inclusive em outra aba.
    void trabalho.iniciar(ufs, baixar, []);
  };

  const novos = [...escolhidos].filter((uf) => !jaTem.has(uf)).length;
  const refazer = [...escolhidos].filter((uf) => jaTem.has(uf)).length;

  return (
    <div className={estilos.tela}>
      <section className={estilos.coluna}>
        <h2 className={estilos.titulo}>Estados na base</h2>
        {estados.length === 0 ? (
          <div className="vazio">
            <Database size={22} />
            <strong>Nenhum estado ainda.</strong>
            <span>Escolha ao lado e mande baixar.</span>
          </div>
        ) : (
          <div className={estilos.cartoes}>
            {estados.map((e) => (
              <div key={e.uf} className={estilos.cartao} data-ativo={e.uf === ufAtual}>
                <button className={estilos.cartaoAbrir} onClick={() => aoTrocarUf(e.uf)}
                        type="button">
                  <span className={estilos.sigla}>{e.uf}</span>
                  <span className={estilos.corpo}>
                    <span className={estilos.numero + " mono"}>{mil(e.contatos)}</span>
                    <span className={estilos.legenda}>
                      contatos · {mil(e.municipios)} municípios
                    </span>
                    <span className={estilos.meta}>
                      cadastro de {e.versao_receita || "?"} · gerado em{" "}
                      {e.gerado_em || "?"}
                      {e.recorte && e.recorte !== "estado inteiro" && ` · ${e.recorte}`}
                    </span>
                  </span>
                </button>
                <span className={estilos.direita}>
                  <span className={estilos.tamanho + " mono"}>
                    {e.tamanho_mb.toFixed(0)} MB
                  </span>
                  <span className={estilos.acoesCartao}>
                    <button
                      className={estilos.apagar}
                      onClick={() => apagar(e.uf, false)}
                      disabled={apagando === e.uf}
                      title="Apaga o banco. Os arquivos baixados ficam, então refazer não precisa de rede."
                      type="button"
                    >
                      <Trash2 size={12} />
                      banco
                    </button>
                    <button
                      className={estilos.apagar}
                      data-forte="true"
                      onClick={() => apagar(e.uf, true)}
                      disabled={apagando === e.uf}
                      title="Apaga o banco e os arquivos baixados. Refazer exigirá baixar tudo de novo."
                      type="button"
                    >
                      <Trash2 size={12} />
                      tudo
                    </button>
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={estilos.coluna}>
        <h2 className={estilos.titulo}>Armazenamento</h2>
        {config && (
          <div className={estilos.armazenamento}>
            <div className={estilos.linhaPasta}>
              <HardDrive size={13} />
              <span className={estilos.caminho + " mono"}>{config.dados}</span>
              <button className="botao botao--calmo" onClick={trocarPasta} type="button">
                <FolderOpen size={12} />
                Trocar
              </button>
            </div>
            <div className={estilos.numerosDisco}>
              <span>
                <b className="mono">{config.ocupado_gb.toFixed(1)} GB</b> em uso
              </span>
              <span>
                <b className="mono">{config.livre_gb.toFixed(1)} GB</b> livres no disco
              </span>
            </div>
            <p className={estilos.notaPasta}>
              {config.repo
                ? "Rodando do repositório — os dados ficam em data/ do projeto."
                : "Fora da pasta de instalação: uma atualização do app não encosta nos dados."}
            </p>
          </div>
        )}

        <h2 className={estilos.titulo} style={{ marginTop: 22 }}>Baixar estados</h2>
        <p className={estilos.explicacao}>
          Marque quantos quiser: os arquivos da Receita são nacionais, então
          três estados custam o mesmo download que um. O cadastro sai uma vez
          por mês e não existe download por município.
        </p>

        <div className={estilos.regioes}>
          {REGIOES.map((r) => (
            <div key={r.nome} className={estilos.regiao}>
              <span className={estilos.regiaoNome}>{r.nome}</span>
              <div className={estilos.grade}>
                {r.ufs.map((uf) => {
                  const existente = jaTem.get(uf);
                  return (
                    <button
                      key={uf}
                      type="button"
                      className={estilos.pastilha}
                      data-marcado={escolhidos.has(uf)}
                      data-existe={!!existente}
                      onClick={() => alternar(uf)}
                      disabled={rodando}
                      title={
                        existente
                          ? `${mil(existente.contatos)} contatos · marcar para refazer`
                          : "ainda não baixado"
                      }
                    >
                      {uf}
                      {existente && <i className={estilos.pontinho} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <label className="marcar" style={{ marginTop: 14 }}>
          <input
            type="checkbox"
            checked={baixar}
            onChange={(e) => setBaixar(e.target.checked)}
            disabled={rodando}
          />
          Baixar o cadastro
          <span className={estilos.custo}>~6,7 GB · 25 min</span>
        </label>
        <p className={estilos.dicaCaixa}>
          Desmarque para só reprocessar o que já está em disco — útil depois de
          mexer no score ou nos ramos.
        </p>

        <button
          className="botao botao--principal"
          onClick={rodar}
          disabled={rodando || escolhidos.size === 0}
          style={{ marginTop: 14 }}
          type="button"
        >
          {rodando
            ? <><CloudDownload size={13} />Rodando… (pode trocar de aba)</>
            : <><Play size={13} />
                {escolhidos.size === 0
                  ? "Escolha os estados"
                  : `Baixar ${escolhidos.size} estado${escolhidos.size > 1 ? "s" : ""}`}
              </>}
        </button>

        {escolhidos.size > 0 && !rodando && (
          <p className={estilos.resumoEscolha}>
            {novos > 0 && `${novos} novo${novos > 1 ? "s" : ""}`}
            {novos > 0 && refazer > 0 && " · "}
            {refazer > 0 && (
              <span className={estilos.refazer}>
                <RefreshCw size={11} />
                {refazer} será{refazer > 1 ? "ão" : ""} refeito
                {refazer > 1 ? "s" : ""}
              </span>
            )}
          </p>
        )}

        {linhas.length > 0 && (
          <div className={estilos.log}>
            {linhas.map((l, i) => (
              <div
                key={i}
                className={l.erro ? estilos.logErro : l.fim ? estilos.logFim : undefined}
              >
                {l.texto}
              </div>
            ))}
            <div ref={fimLog} />
          </div>
        )}
      </section>
    </div>
  );
}
