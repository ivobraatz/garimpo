"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check, Copy, Download, Globe, Mail, MapPin, Phone, Search,
  SlidersHorizontal, X,
} from "lucide-react";

import {
  buscar, exportar, filtrosVazios, municipios, segmentos,
  type Contato, type ContagemArea, type Filtros,
} from "@/lib/api";
import { faixaScore, mil, porteBonito, telefonePrincipal } from "@/lib/formato";
import estilos from "./Contatos.module.css";

const POR_PAGINA = 80;

const PORTES = ["Medio/grande", "Pequeno porte", "Microempresa", "Nao informado"];
const ORDENS = [
  { valor: "score", nome: "Score" },
  { valor: "nome", nome: "Nome" },
  { valor: "cidade", nome: "Município" },
  { valor: "recente", nome: "Abertura recente" },
  { valor: "antiga", nome: "Abertura antiga" },
];

export default function Contatos({
  uf,
  ufs,
  aoTrocarUf,
  filtrosIniciais,
  avisar,
}: {
  uf: string;
  ufs: string[];
  aoTrocarUf: (uf: string) => void;
  filtrosIniciais: Partial<Filtros> | null;
  avisar: (texto: string, tipo?: "bom" | "ruim") => void;
}) {
  const [filtros, setFiltros] = useState<Filtros>(filtrosVazios);
  const [termoCru, setTermoCru] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<{ total: number; itens: Contato[] }>({
    total: 0, itens: [],
  });
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<Contato | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [listaMunicipios, setListaMunicipios] = useState<ContagemArea[]>([]);
  const [listaSegmentos, setListaSegmentos] = useState<ContagemArea[]>([]);
  const [exportando, setExportando] = useState(false);
  const areaTabela = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFiltros(filtrosIniciais ? { ...filtrosVazios(), ...filtrosIniciais } : filtrosVazios());
    setTermoCru("");
    setPagina(1);
    setMarcados(new Set());
    setAberto(null);
  }, [uf, filtrosIniciais]);

  useEffect(() => {
    let vivo = true;
    Promise.all([municipios(uf), segmentos(uf)]).then(([m, s]) => {
      if (!vivo) return;
      setListaMunicipios([...m].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setListaSegmentos(s);
    });
    return () => { vivo = false; };
  }, [uf]);

  // O termo digitado espera um instante antes de virar consulta.
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros((f) => (f.termo === termoCru ? f : { ...f, termo: termoCru }));
      setPagina(1);
    }, 200);
    return () => clearTimeout(t);
  }, [termoCru]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    buscar(uf, filtros, pagina, POR_PAGINA)
      .then((r) => { if (vivo) { setDados(r); setCarregando(false); } })
      .catch((e) => { if (vivo) { avisar(String(e), "ruim"); setCarregando(false); } });
    areaTabela.current?.scrollTo({ top: 0 });
    return () => { vivo = false; };
  }, [uf, filtros, pagina, avisar]);

  const mudar = useCallback(<C extends keyof Filtros>(campo: C, valor: Filtros[C]) => {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  }, []);

  const limpar = () => {
    setFiltros(filtrosVazios());
    setTermoCru("");
    setPagina(1);
    setMarcados(new Set());
  };

  const alternarMarca = (id: number) => {
    setMarcados((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const paginaToda = dados.itens.length > 0 && dados.itens.every((c) => marcados.has(c.id));

  const alternarPagina = () => {
    setMarcados((s) => {
      const novo = new Set(s);
      if (paginaToda) dados.itens.forEach((c) => novo.delete(c.id));
      else dados.itens.forEach((c) => novo.add(c.id));
      return novo;
    });
  };

  const filtrosAtivos = useMemo(() => {
    const f = filtros;
    const lista: { rotulo: string; limpar: () => void }[] = [];
    if (f.cidade) lista.push({ rotulo: f.cidade, limpar: () => mudar("cidade", "") });
    if (f.segmento) lista.push({ rotulo: f.segmento, limpar: () => mudar("segmento", "") });
    if (f.porte) lista.push({ rotulo: porteBonito(f.porte), limpar: () => mudar("porte", "") });
    if (f.score_minimo) {
      lista.push({ rotulo: "score ≥ " + f.score_minimo, limpar: () => mudar("score_minimo", 0) });
    }
    if (f.somente_celular) {
      lista.push({ rotulo: "com celular", limpar: () => mudar("somente_celular", false) });
    }
    if (f.somente_email) {
      lista.push({ rotulo: "com e-mail", limpar: () => mudar("somente_email", false) });
    }
    if (f.somente_sem_dominio) {
      lista.push({ rotulo: "sem domínio", limpar: () => mudar("somente_sem_dominio", false) });
    }
    return lista;
  }, [filtros, mudar]);

  const exportarAgora = async () => {
    const selecao = [...marcados];
    const rotulo = selecao.length
      ? "selecao-" + selecao.length
      : (filtros.cidade || filtros.segmento || uf);
    const destino = await save({
      defaultPath: rotulo.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".xlsx",
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!destino) return;
    setExportando(true);
    try {
      await exportar({
        uf,
        cidade: filtros.cidade,
        segmento: filtros.segmento,
        scoreMinimo: filtros.score_minimo,
        ids: selecao,
        destino,
      });
      const quantos = selecao.length || dados.total;
      avisar(mil(quantos) + " contatos no modelo DataRunner.", "bom");
    } catch (e) {
      avisar(String(e), "ruim");
    } finally {
      setExportando(false);
    }
  };

  const de = (pagina - 1) * POR_PAGINA + 1;
  const ate = Math.min(pagina * POR_PAGINA, dados.total);

  return (
    <div className={estilos.tela} data-detalhe={aberto ? "aberto" : "fechado"}>
      <aside className={estilos.filtros}>
        <div className={estilos.filtrosTopo}>
          <SlidersHorizontal size={12} />
          Filtros
        </div>

        <div className="busca">
          <Search size={13} />
          <input
            className="entrada"
            placeholder="nome, empresa, cidade…"
            value={termoCru}
            onChange={(e) => setTermoCru(e.target.value)}
            spellCheck={false}
          />
        </div>
        <p className={estilos.dica}>
          Prefixo já basta: <code>metalur</code> acha <em>Metalúrgica</em>.
        </p>

        <div className={estilos.grupo}>
          <label className="rotulo" htmlFor="f-uf">Estado</label>
          <select id="f-uf" className="escolha" value={uf}
                  onChange={(e) => aoTrocarUf(e.target.value)}>
            {ufs.map((sigla) => <option key={sigla} value={sigla}>{sigla}</option>)}
          </select>
        </div>

        <div className={estilos.grupo}>
          <label className="rotulo" htmlFor="f-cidade">Município</label>
          <select id="f-cidade" className="escolha" value={filtros.cidade}
                  onChange={(e) => mudar("cidade", e.target.value)}>
            <option value="">todos</option>
            {listaMunicipios.map((m) => (
              <option key={m.nome} value={m.nome}>
                {m.nome} · {mil(m.contatos)}
              </option>
            ))}
          </select>
        </div>

        <div className={estilos.grupo}>
          <label className="rotulo" htmlFor="f-segmento">Ramo</label>
          <select id="f-segmento" className="escolha" value={filtros.segmento}
                  onChange={(e) => mudar("segmento", e.target.value)}>
            <option value="">todos</option>
            {listaSegmentos.map((s) => (
              <option key={s.nome} value={s.nome}>
                {s.nome} · {mil(s.contatos)}
              </option>
            ))}
          </select>
        </div>

        <div className={estilos.grupo}>
          <label className="rotulo" htmlFor="f-porte">Porte</label>
          <select id="f-porte" className="escolha" value={filtros.porte}
                  onChange={(e) => mudar("porte", e.target.value)}>
            <option value="">todos</option>
            {PORTES.map((p) => <option key={p} value={p}>{porteBonito(p)}</option>)}
          </select>
        </div>

        <div className={estilos.grupo}>
          <label className="rotulo" htmlFor="f-score">
            Score mínimo
            <b className={estilos.valorScore}>{filtros.score_minimo}</b>
          </label>
          <input id="f-score" type="range" min={0} max={100} step={5}
                 value={filtros.score_minimo}
                 onChange={(e) => mudar("score_minimo", Number(e.target.value))} />
        </div>

        <div className={estilos.grupo}>
          <span className="rotulo">Canal</span>
          <label className="marcar">
            <input type="checkbox" checked={filtros.somente_celular}
                   onChange={(e) => mudar("somente_celular", e.target.checked)} />
            Só com celular
          </label>
          <label className="marcar">
            <input type="checkbox" checked={filtros.somente_email}
                   onChange={(e) => mudar("somente_email", e.target.checked)} />
            Só com e-mail
          </label>
          <label className="marcar">
            <input type="checkbox" checked={filtros.somente_sem_dominio}
                   onChange={(e) => mudar("somente_sem_dominio", e.target.checked)} />
            Sem domínio próprio
          </label>
          <p className={estilos.dica}>
            Sem domínio próprio quase sempre é sem site — quem precisa do que
            você vende.
          </p>
        </div>

        <div className={estilos.grupo}>
          <label className="rotulo" htmlFor="f-ordem">Ordenar por</label>
          <select id="f-ordem" className="escolha" value={filtros.ordem}
                  onChange={(e) => mudar("ordem", e.target.value)}>
            {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.nome}</option>)}
          </select>
        </div>

        <button className="botao botao--calmo" onClick={limpar} type="button"
                style={{ width: "100%", marginTop: 18 }}>
          Limpar tudo
        </button>
      </aside>

      <section className={estilos.centro}>
        <header className={estilos.cabecalho}>
          <div className={estilos.contagem}>
            <strong className="num">{carregando ? "—" : mil(dados.total)}</strong>
            <span>contatos</span>
          </div>

          {marcados.size > 0 && (
            <button className={estilos.selecionados} onClick={() => setMarcados(new Set())}
                    type="button">
              <Check size={11} />
              {mil(marcados.size)} selecionados
              <X size={11} className={estilos.limparSel} />
            </button>
          )}

          <div className={estilos.chips}>
            {filtrosAtivos.map((f) => (
              <button key={f.rotulo} className={estilos.chip} onClick={f.limpar} type="button">
                {f.rotulo}
                <X size={11} />
              </button>
            ))}
          </div>

          <button className="botao botao--principal" onClick={exportarAgora}
                  disabled={exportando || (!dados.total && !marcados.size)} type="button">
            <Download size={13} />
            {exportando
              ? "Exportando…"
              : marcados.size ? "Exportar " + mil(marcados.size) : "Exportar filtro"}
          </button>
        </header>

        <div className={estilos.areaTabela} ref={areaTabela}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th className={estilos.colMarca}>
                  <label className="marcar">
                    <input type="checkbox" checked={paginaToda} onChange={alternarPagina}
                           aria-label="Selecionar a página" />
                  </label>
                </th>
                <th>Empresa</th>
                <th>Canal</th>
                <th>Município</th>
                <th>Ramo</th>
                <th className={estilos.colScore}>Score</th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((c) => {
                const faixa = faixaScore(c.score);
                const semSite = c.email && !c.dominio_proprio;
                return (
                  <tr key={c.id} data-aberto={aberto?.id === c.id}
                      data-marcado={marcados.has(c.id)} onClick={() => setAberto(c)}>
                    <td className={estilos.colMarca} onClick={(e) => e.stopPropagation()}>
                      <label className="marcar">
                        <input type="checkbox" checked={marcados.has(c.id)}
                               onChange={() => alternarMarca(c.id)}
                               aria-label={"Selecionar " + c.nome} />
                      </label>
                    </td>
                    <td>
                      <span className={estilos.empresaTexto}>
                        <span className={estilos.nome}>{c.nome}</span>
                        <span className={estilos.subnome}>
                          {c.empresa && c.empresa !== c.nome ? c.empresa : c.bairro}
                        </span>
                      </span>
                    </td>
                    <td className={estilos.canal}>
                      {telefonePrincipal(c.telefone) && (
                        <span className={estilos.linhaCanal} data-zap={!!c.whatsapp}>
                          <Phone size={11} />
                          <span className="mono">{telefonePrincipal(c.telefone)}</span>
                        </span>
                      )}
                      {c.email && (
                        <span className={estilos.linhaCanal}>
                          {c.dominio_proprio ? <Globe size={11} /> : <Mail size={11} />}
                          <span className="mono">{c.email}</span>
                        </span>
                      )}
                    </td>
                    <td className={estilos.cidade}>
                      <MapPin size={11} />
                      {c.cidade}
                    </td>
                    <td className={estilos.segmento}>
                      <span className={estilos.segmentoNome}>{c.segmento}</span>
                      {(c.porte === "Medio/grande" || semSite) && (
                        <span className={estilos.selos}>
                          {c.porte === "Medio/grande" && (
                            <b className={estilos.seloPorte}>médio/grande</b>
                          )}
                          {semSite && <b className={estilos.seloSemSite}>sem site</b>}
                        </span>
                      )}
                    </td>
                    <td className={estilos.colScore}>
                      <span className={estilos.score}>
                        <b className="mono" style={{ color: faixa.cor }}>{c.score}</b>
                        <i><u style={{ width: c.score + "%", background: faixa.cor }} /></i>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!carregando && dados.itens.length === 0 && (
            <div className="vazio">
              <Search size={22} />
              <strong>Nada com esses filtros.</strong>
              <span>Tire alguma restrição e tente de novo.</span>
            </div>
          )}
        </div>

        <footer className={estilos.rodape}>
          <button className="botao botao--nu" onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina <= 1} type="button">
            Anterior
          </button>
          <span className={estilos.paginaTexto + " mono"}>
            {dados.total ? mil(de) + "–" + mil(ate) + " de " + mil(dados.total) : "—"}
          </span>
          <button className="botao botao--nu" onClick={() => setPagina((p) => p + 1)}
                  disabled={ate >= dados.total} type="button">
            Próxima
          </button>
        </footer>
      </section>

      {aberto && (
        <aside className={estilos.detalhe}>
          <header className={estilos.detalheTopo}>
            <div className={estilos.detalheTitulo}>
              <h2>{aberto.nome}</h2>
              {aberto.empresa && aberto.empresa !== aberto.nome && <p>{aberto.empresa}</p>}
            </div>
            <button className={estilos.fechar} onClick={() => setAberto(null)}
                    aria-label="Fechar" type="button">
              <X size={14} />
            </button>
          </header>

          <div className={estilos.pontuacao}>
            <span className="rotulo">Score</span>
            <div className={estilos.pontuacaoLinha}>
              <b className="mono" style={{ color: faixaScore(aberto.score).cor }}>
                {aberto.score}
              </b>
              <i>
                <u style={{
                  width: aberto.score + "%",
                  background: faixaScore(aberto.score).cor,
                }} />
              </i>
              <span>{faixaScore(aberto.score).rotulo}</span>
            </div>
          </div>

          <div className={estilos.oportunidade}>
            <span className="rotulo">O que vender</span>
            <p>{aberto.oportunidade}</p>
          </div>

          <div className={estilos.acoes}>
            {aberto.whatsapp && (
              <button className="botao botao--principal"
                      onClick={() => openUrl(aberto.whatsapp)} type="button">
                <Phone size={13} />
                WhatsApp
              </button>
            )}
            {aberto.email && (
              <button className="botao botao--calmo"
                      onClick={() => openUrl("mailto:" + aberto.email)} type="button">
                <Mail size={13} />
                E-mail
              </button>
            )}
            <button
              className="botao botao--calmo"
              onClick={() => {
                navigator.clipboard.writeText(
                  [aberto.nome, aberto.telefone, aberto.email, aberto.cidade, aberto.cnpj]
                    .filter(Boolean).join(" · "),
                );
                avisar("Contato copiado.", "bom");
              }}
              type="button"
            >
              <Copy size={13} />
              Copiar
            </button>
          </div>

          <dl className={estilos.fichas}>
            {aberto.telefone && <Ficha t="Telefone" v={aberto.telefone} mono />}
            {aberto.email && <Ficha t="E-mail" v={aberto.email} mono />}
            <Ficha
              t="Domínio próprio"
              v={aberto.email ? (aberto.dominio_proprio ? "Sim" : "Não — provável sem site") : "—"}
            />
            <Ficha t="Ramo" v={aberto.segmento} />
            <Ficha t="Porte" v={porteBonito(aberto.porte)} />
            <Ficha t="Município" v={aberto.cidade} />
            {aberto.bairro && <Ficha t="Bairro" v={aberto.bairro} />}
            {aberto.endereco && <Ficha t="Endereço" v={aberto.endereco} />}
            {aberto.abertura && <Ficha t="Abertura" v={aberto.abertura} mono />}
            <Ficha t="CNPJ" v={aberto.cnpj} mono />
          </dl>
        </aside>
      )}
    </div>
  );
}

function Ficha({ t, v, mono }: { t: string; v: string; mono?: boolean }) {
  return (
    <div className={estilos.ficha}>
      <dt>{t}</dt>
      <dd className={mono ? "mono" : undefined}>{v}</dd>
    </div>
  );
}
