//! Acesso ao banco de contatos e aos arquivos de dados do projeto.
//!
//! Cada UF tem seu proprio SQLite em data/uf/<UF>/contatos.db. A raiz do
//! projeto e descoberta subindo a partir do executavel: em desenvolvimento o
//! binario fica em app/src-tauri/target/debug, e empacotado fica ao lado dos
//! dados.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct EstadoDisponivel {
    pub uf: String,
    pub contatos: i64,
    pub municipios: i64,
    pub versao_receita: String,
    pub gerado_em: String,
    pub recorte: String,
    pub tamanho_mb: f64,
}

#[derive(Debug, Serialize)]
pub struct Contato {
    pub id: i64,
    pub cnpj: String,
    pub nome: String,
    pub empresa: String,
    pub email: String,
    pub telefone: String,
    pub whatsapp: String,
    pub cidade: String,
    pub bairro: String,
    pub endereco: String,
    pub segmento: String,
    pub oportunidade: String,
    pub porte: String,
    pub abertura: String,
    pub dominio_proprio: bool,
    pub score: i64,
}

#[derive(Debug, Serialize)]
pub struct PaginaContatos {
    pub total: i64,
    pub itens: Vec<Contato>,
}

#[derive(Debug, Serialize)]
pub struct ContagemArea {
    pub codigo: String,
    pub nome: String,
    pub contatos: i64,
    pub com_email: i64,
    pub com_celular: i64,
    pub sem_dominio: i64,
    pub score_medio: f64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Filtros {
    pub termo: String,
    pub cidade: String,
    pub segmento: String,
    pub porte: String,
    pub score_minimo: i64,
    pub somente_celular: bool,
    pub somente_email: bool,
    pub somente_sem_dominio: bool,
    pub ordem: String,
}

/// Onde ficam os scripts e onde ficam os dados.
///
/// Sao coisas diferentes de proposito. O programa e os scripts vivem na pasta
/// de instalacao e sao substituidos a cada atualizacao; os dados ficam fora
/// dela e sobrevivem. Misturar os dois foi o que fez a versao anterior pedir a
/// pasta do projeto ao abrir.
#[derive(Debug, Clone, Serialize)]
pub struct Locais {
    pub dados: PathBuf,
    pub scripts: PathBuf,
    /// Verdadeiro quando rodando de dentro do repositorio, em desenvolvimento.
    pub repo: bool,
}

pub fn normalizar_uf(uf: &str) -> Result<String, String> {
    let normalizada = uf.trim().to_uppercase();
    const UFS: [&str; 27] = [
        "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
        "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
    ];
    if UFS.contains(&normalizada.as_str()) {
        Ok(normalizada)
    } else {
        Err("UF inválida".into())
    }
}

fn arquivo_config() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(base.join("Garimpo").join("config.json"))
}

fn pasta_dados_salva() -> Option<PathBuf> {
    let texto = std::fs::read_to_string(arquivo_config()?).ok()?;
    let json: serde_json::Value = serde_json::from_str(&texto).ok()?;
    let caminho = json.get("dados")?.as_str()?;
    if caminho.is_empty() { None } else { Some(PathBuf::from(caminho)) }
}

pub fn salvar_pasta_dados(caminho: &Path) -> Result<(), String> {
    std::fs::create_dir_all(caminho).map_err(|e| format!("criando a pasta: {e}"))?;
    let arquivo = arquivo_config().ok_or("não achei onde guardar a configuração")?;
    if let Some(pasta) = arquivo.parent() {
        std::fs::create_dir_all(pasta).map_err(|e| e.to_string())?;
    }
    let json = serde_json::json!({ "dados": caminho.to_string_lossy() });
    std::fs::write(&arquivo, serde_json::to_vec_pretty(&json).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

/// Pasta do repositorio, quando o executavel esta rodando de dentro dele.
fn repositorio() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut atual: &Path = exe.parent()?;
    loop {
        if atual.join("src").join("gerar_leads.py").is_file() {
            return Some(atual.to_path_buf());
        }
        atual = atual.parent()?;
    }
}

/// Padrao quando nada foi configurado: a pasta de dados do usuario.
fn dados_padrao() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Garimpo")
}

/// Resolve os dois caminhos. Nunca falha: sem configuracao, usa o padrao e o
/// cria -- o app abre e funciona sem perguntar nada.
pub fn locais() -> Locais {
    let repo = repositorio();
    let scripts = match &repo {
        Some(r) => r.join("src"),
        None => std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(|p| p.join("scripts")))
            .unwrap_or_else(|| PathBuf::from("scripts")),
    };
    let dados = pasta_dados_salva()
        .or_else(|| repo.as_ref().map(|r| r.join("data")))
        .unwrap_or_else(dados_padrao);
    let _ = std::fs::create_dir_all(&dados);
    Locais { dados, scripts, repo: repo.is_some() }
}

/// Apaga o banco e o relatorio de um estado, liberando o espaco que ocupam.
///
/// Nao encosta em receita/: os arquivos baixados ficam, entao regerar o estado
/// nao precisa de rede.
pub fn apagar_estado(dados: &Path, uf: &str) -> Result<u64, String> {
    let pasta = dados.join("uf").join(uf.to_uppercase());
    if !pasta.is_dir() {
        return Err(format!("{uf} não está na base"));
    }
    let liberado = tamanho_pasta(&pasta);
    std::fs::remove_dir_all(&pasta).map_err(|e| e.to_string())?;
    Ok(liberado)
}

/// Apaga tambem os arquivos baixados daquele estado. Libera mais espaco, mas
/// refazer o estado passa a exigir baixar tudo de novo.
pub fn apagar_downloads(dados: &Path, uf: &str) -> Result<u64, String> {
    let receita = dados.join("receita");
    let mut liberado = 0;
    for nome in [
        format!("estabelecimentos_{}.csv.gz", uf.to_lowercase()),
        format!("empresas_{}.csv.gz", uf.to_lowercase()),
        format!("_versao_{}.json", uf.to_lowercase()),
    ] {
        let arquivo = receita.join(nome);
        if let Ok(meta) = std::fs::metadata(&arquivo) {
            liberado += meta.len();
            let _ = std::fs::remove_file(&arquivo);
        }
    }
    Ok(liberado)
}

pub fn tamanho_pasta(caminho: &Path) -> u64 {
    let mut total = 0;
    if let Ok(itens) = std::fs::read_dir(caminho) {
        for item in itens.flatten() {
            let p = item.path();
            total += if p.is_dir() { tamanho_pasta(&p) } else {
                std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0)
            };
        }
    }
    total
}

/// Espaco livre no disco onde os dados estao, para a tela avisar antes de uma
/// geracao que nao caberia.
pub fn espaco_livre(caminho: &Path) -> Option<u64> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let mut wide: Vec<u16> = caminho.as_os_str().encode_wide().collect();
        wide.push(0);
        let mut livre: u64 = 0;
        // GetDiskFreeSpaceExW: primeiro parametro e o caminho, segundo o
        // espaco disponivel para o usuario atual.
        extern "system" {
            fn GetDiskFreeSpaceExW(
                lpDirectoryName: *const u16,
                lpFreeBytesAvailableToCaller: *mut u64,
                lpTotalNumberOfBytes: *mut u64,
                lpTotalNumberOfFreeBytes: *mut u64,
            ) -> i32;
        }
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut livre,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if ok != 0 { Some(livre) } else { None }
    }
    #[cfg(not(windows))]
    {
        let _ = caminho;
        None
    }
}

pub fn caminho_banco(dados: &Path, uf: &str) -> PathBuf {
    dados.join("uf").join(uf.to_uppercase()).join("contatos.db")
}

fn abrir(caminho: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(caminho, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("abrindo {}: {e}", caminho.display()))
}

fn meta(conn: &Connection) -> HashMap<String, String> {
    let mut mapa = HashMap::new();
    if let Ok(mut st) = conn.prepare("SELECT chave, valor FROM meta") {
        if let Ok(linhas) = st.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        }) {
            for item in linhas.flatten() {
                mapa.insert(item.0, item.1);
            }
        }
    }
    mapa
}

/// Estados que ja tem banco em data/uf/. E o que a tela lista como "pastas".
pub fn estados_disponiveis(dados: &Path) -> Result<Vec<EstadoDisponivel>, String> {
    let base = dados.join("uf");
    let mut saida = Vec::new();
    if !base.is_dir() {
        return Ok(saida);
    }
    let entradas = std::fs::read_dir(&base).map_err(|e| e.to_string())?;
    for entrada in entradas.flatten() {
        let uf = entrada.file_name().to_string_lossy().to_uppercase();
        let db = entrada.path().join("contatos.db");
        if !db.is_file() {
            continue;
        }
        let tamanho_mb = std::fs::metadata(&db)
            .map(|m| m.len() as f64 / 1e6)
            .unwrap_or(0.0);
        // Um banco que nao abre precisa aparecer: engolir o erro aqui foi o
        // que fez a lista sair vazia sem dizer por que.
        let conn = match abrir(&db) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[garimpo] {} ignorado: {e}", db.display());
                continue;
            }
        };
        let m = meta(&conn);
        let contatos: i64 = conn
            .query_row("SELECT COUNT(*) FROM contatos", [], |r| r.get(0))
            .unwrap_or(0);
        let municipios: i64 = conn
            .query_row("SELECT COUNT(*) FROM municipios", [], |r| r.get(0))
            .unwrap_or(0);
        saida.push(EstadoDisponivel {
            uf,
            contatos,
            municipios,
            versao_receita: m.get("versao_receita").cloned().unwrap_or_default(),
            gerado_em: m.get("gerado_em").cloned().unwrap_or_default(),
            recorte: m.get("recorte").cloned().unwrap_or_default(),
            tamanho_mb,
        });
    }
    saida.sort_by(|a, b| a.uf.cmp(&b.uf));
    Ok(saida)
}

/// Termo digitado -> expressao FTS5 com prefixo em cada palavra.
///
/// Sem o `*` a busca so acha a palavra inteira, e quem digita "metalur" espera
/// ver "Metalurgica". As aspas protegem o token de ser lido como operador.
fn expressao_fts(termo: &str) -> String {
    termo
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .map(|p| format!("\"{p}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn sem_acento_minusculo(texto: &str) -> String {
    texto
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' => 'a',
            'é' | 'ê' | 'è' | 'ë' | 'É' | 'Ê' => 'e',
            'í' | 'î' | 'ì' | 'ï' | 'Í' | 'Î' => 'i',
            'ó' | 'ô' | 'õ' | 'ò' | 'ö' | 'Ó' | 'Ô' | 'Õ' => 'o',
            'ú' | 'û' | 'ù' | 'ü' | 'Ú' | 'Û' | 'Ü' => 'u',
            'ç' | 'Ç' => 'c',
            outro => outro.to_ascii_lowercase(),
        })
        .collect()
}

struct Consulta {
    de: String,
    onde: String,
    params: Vec<Box<dyn rusqlite::ToSql>>,
}

fn montar(filtros: &Filtros) -> Consulta {
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut onde = vec!["1=1".to_string()];

    let termo = filtros.termo.trim();
    let de = if termo.is_empty() {
        "contatos c".to_string()
    } else {
        params.push(Box::new(expressao_fts(&sem_acento_minusculo(termo))));
        "contatos_fts f JOIN contatos c ON c.id = f.rowid".to_string()
    };
    if !termo.is_empty() {
        onde.push("contatos_fts MATCH ?".to_string());
    }
    if !filtros.cidade.is_empty() {
        onde.push("c.cidade = ?".to_string());
        params.push(Box::new(filtros.cidade.clone()));
    }
    if !filtros.segmento.is_empty() {
        onde.push("c.segmento = ?".to_string());
        params.push(Box::new(filtros.segmento.clone()));
    }
    if !filtros.porte.is_empty() {
        onde.push("c.porte = ?".to_string());
        params.push(Box::new(filtros.porte.clone()));
    }
    if filtros.score_minimo > 0 {
        onde.push("c.score >= ?".to_string());
        params.push(Box::new(filtros.score_minimo));
    }
    if filtros.somente_celular {
        onde.push("c.tem_celular = 1".to_string());
    }
    if filtros.somente_email {
        onde.push("c.email <> ''".to_string());
    }
    if filtros.somente_sem_dominio {
        onde.push("c.email <> '' AND c.dominio_proprio = 0".to_string());
    }

    Consulta { de, onde: onde.join(" AND "), params }
}

fn ordenacao(ordem: &str) -> &'static str {
    match ordem {
        "nome" => "c.nome ASC",
        "cidade" => "c.cidade ASC, c.score DESC",
        "recente" => "c.abertura DESC, c.score DESC",
        "antiga" => "c.abertura ASC, c.score DESC",
        _ => "c.score DESC, c.cidade ASC, c.nome ASC",
    }
}

pub fn buscar(
    raiz: &Path,
    uf: &str,
    filtros: &Filtros,
    pagina: i64,
    por_pagina: i64,
) -> Result<PaginaContatos, String> {
    let conn = abrir(&caminho_banco(raiz, uf))?;
    let c = montar(filtros);
    let refs: Vec<&dyn rusqlite::ToSql> = c.params.iter().map(|p| p.as_ref()).collect();

    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM {} WHERE {}", c.de, c.onde),
            refs.as_slice(),
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let sql = format!(
        "SELECT c.id, c.cnpj, c.nome, c.empresa, c.email, c.telefone, c.whatsapp, \
         c.cidade, c.bairro, c.endereco, c.segmento, c.oportunidade, c.porte, \
         c.abertura, c.dominio_proprio, c.score \
         FROM {} WHERE {} ORDER BY {} LIMIT {} OFFSET {}",
        c.de,
        c.onde,
        ordenacao(&filtros.ordem),
        por_pagina.clamp(1, 500),
        (pagina.max(1) - 1) * por_pagina
    );
    let mut st = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let itens = st
        .query_map(refs.as_slice(), |r| {
            Ok(Contato {
                id: r.get(0)?,
                cnpj: r.get(1)?,
                nome: r.get(2)?,
                empresa: r.get(3)?,
                email: r.get(4)?,
                telefone: r.get(5)?,
                whatsapp: r.get(6)?,
                cidade: r.get(7)?,
                bairro: r.get(8)?,
                endereco: r.get(9)?,
                segmento: r.get(10)?,
                oportunidade: r.get(11)?,
                porte: r.get(12)?,
                abertura: r.get(13)?,
                dominio_proprio: r.get::<_, i64>(14)? == 1,
                score: r.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(PaginaContatos { total, itens })
}

/// Contagem por municipio, com o codigo do IBGE que o mapa usa para colorir.
pub fn municipios(raiz: &Path, uf: &str) -> Result<Vec<ContagemArea>, String> {
    let conn = abrir(&caminho_banco(raiz, uf))?;
    let mut st = conn
        .prepare(
            "SELECT codigo_ibge, nome, contatos, com_email, com_celular, \
             sem_dominio, IFNULL(score_medio, 0) FROM municipios \
             ORDER BY contatos DESC",
        )
        .map_err(|e| e.to_string())?;
    let itens = st
        .query_map([], |r| {
            Ok(ContagemArea {
                codigo: r.get(0)?,
                nome: r.get(1)?,
                contatos: r.get(2)?,
                com_email: r.get(3)?,
                com_celular: r.get(4)?,
                sem_dominio: r.get(5)?,
                score_medio: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(itens)
}

pub fn segmentos(raiz: &Path, uf: &str) -> Result<Vec<ContagemArea>, String> {
    let conn = abrir(&caminho_banco(raiz, uf))?;
    let mut st = conn
        .prepare(
            "SELECT nome, nome, contatos, com_email, com_celular, sem_dominio, \
             IFNULL(score_medio, 0) FROM segmentos ORDER BY contatos DESC",
        )
        .map_err(|e| e.to_string())?;
    let itens = st
        .query_map([], |r| {
            Ok(ContagemArea {
                codigo: r.get(0)?,
                nome: r.get(1)?,
                contatos: r.get(2)?,
                com_email: r.get(3)?,
                com_celular: r.get(4)?,
                sem_dominio: r.get(5)?,
                score_medio: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(itens)
}

/// Malha GeoJSON guardada em data/ibge. `nome` e o arquivo, sem caminho.
pub fn malha(raiz: &Path, nome: &str) -> Result<serde_json::Value, String> {
    if nome.contains('/') || nome.contains('\\') || nome.contains("..") {
        return Err("nome de malha inválido".into());
    }
    let caminho = raiz.join("ibge").join(nome);
    let texto = std::fs::read_to_string(&caminho)
        .map_err(|e| format!("{}: {e}", caminho.display()))?;
    serde_json::from_str(&texto).map_err(|e| e.to_string())
}
