"use client";

import { useEffect, useMemo, useState } from "react";
import { segmentos, type ContagemArea } from "@/lib/api";
import { Layers, Search } from "lucide-react";

import { mil, pct } from "@/lib/formato";
import estilos from "./Segmentos.module.css";

export default function Segmentos({
  uf,
  aoEscolher,
}: {
  uf: string;
  aoEscolher: (segmento: string) => void;
}) {
  const [lista, setLista] = useState<ContagemArea[]>([]);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    let vivo = true;
    segmentos(uf).then((s) => { if (vivo) setLista(s); });
    return () => { vivo = false; };
  }, [uf]);

  const visiveis = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return t ? lista.filter((s) => s.nome.toLowerCase().includes(t)) : lista;
  }, [lista, filtro]);

  const maximo = Math.max(...lista.map((s) => s.contatos), 1);
  const total = lista.reduce((s, x) => s + x.contatos, 0);

  return (
    <div className={estilos.tela}>
      <header className={estilos.cabecalho}>
        <div>
          <h2>Ramos de atividade</h2>
          <p>
            {mil(lista.length)} ramos · {mil(total)} contatos. Clique para abrir os
            contatos.
          </p>
        </div>
        <div className="busca">
          <Search size={13} />
          <input
            className="entrada"
            placeholder="filtrar ramo…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            spellCheck={false}
          />
        </div>
      </header>

      <div className={estilos.area}>
        <table className={estilos.tabela}>
          <thead>
            <tr>
              <th>Segmento</th>
              <th className={estilos.n}>Contatos</th>
              <th className={estilos.n}>Celular</th>
              <th className={estilos.n}>E-mail</th>
              <th className={estilos.n}>Sem domínio</th>
              <th className={estilos.n}>Score</th>
              <th className={estilos.colBarra}></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((s) => (
              <tr key={s.nome} onClick={() => aoEscolher(s.nome)}>
                <td className={estilos.nome}>{s.nome}</td>
                <td className={estilos.n + " " + estilos.forte + " mono"}>{mil(s.contatos)}</td>
                <td className={estilos.n + " mono"}>{pct(s.com_celular, s.contatos)}</td>
                <td className={estilos.n + " mono"}>{pct(s.com_email, s.contatos)}</td>
                <td className={estilos.n + " " + estilos.destaque + " mono"}>
                  {pct(s.sem_dominio, s.contatos)}
                </td>
                <td className={estilos.n + " mono"}>{s.score_medio.toFixed(1)}</td>
                <td className={estilos.colBarra}>
                  <span className={estilos.barra}>
                    <i style={{ width: `${Math.max((s.contatos / maximo) * 100, 1)}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visiveis.length === 0 && (
          <div className="vazio">
            <Layers size={22} />
            <strong>Nenhum ramo com esse nome.</strong>
          </div>
        )}
      </div>
    </div>
  );
}
