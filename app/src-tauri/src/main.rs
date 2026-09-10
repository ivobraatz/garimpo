#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Interface da base de prospeccao.
//!
//! O Rust so le o banco e dispara o pipeline; toda a coleta e o tratamento
//! continuam em Python, que ja resolve isso e nao precisa ser reescrito.
//!
//! Instalacao e dados sao separados de proposito: o programa e as ferramentas
//! Python ja empacotadas vivem na pasta de instalacao e sao trocados a cada
//! atualizacao; os dados ficam fora dela e sobrevivem.

mod dados;

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use tauri::{Emitter, Manager, State};

use dados::{ContagemArea, EstadoDisponivel, Filtros, Locais, PaginaContatos};

/// No Windows, todo processo filho abre um console proprio se nada disser o
/// contrario. Sem esta flag, cada chamada ao Python pisca uma janela preta --
/// inclusive no app instalado, onde nao ha terminal nenhum por perto.
#[cfg(windows)]
const SEM_JANELA: u32 = 0x0800_0000;

struct Contexto {
    locais: Mutex<Locais>,
    rodando: Mutex<bool>,
    malhas: Mutex<HashMap<String, serde_json::Value>>,
}

impl Contexto {
    fn locais(&self) -> Result<Locais, String> {
        Ok(self.locais.lock().map_err(|e| e.to_string())?.clone())
    }

    fn dados(&self) -> Result<PathBuf, String> {
        Ok(self.locais()?.dados)
    }
}

#[derive(Clone, Serialize)]
struct LinhaProgresso {
    texto: String,
    fim: bool,
    erro: bool,
}

#[derive(Serialize)]
struct Ajustes {
    dados: String,
    scripts: String,
    repo: bool,
    livre_gb: f64,
    ocupado_gb: f64,
}

#[tauri::command]
fn estados(ctx: State<Contexto>) -> Result<Vec<EstadoDisponivel>, String> {
    dados::estados_disponiveis(&ctx.dados()?)
}

/// Onde estao os dados, onde estao os scripts e quanto espaco sobra.
#[tauri::command]
fn ajustes(ctx: State<Contexto>) -> Result<Ajustes, String> {
    let l = ctx.locais()?;
    Ok(Ajustes {
        livre_gb: dados::espaco_livre(&l.dados).unwrap_or(0) as f64 / 1e9,
        ocupado_gb: dados::tamanho_pasta(&l.dados) as f64 / 1e9,
        dados: l.dados.to_string_lossy().into_owned(),
        scripts: l.scripts.to_string_lossy().into_owned(),
        repo: l.repo,
    })
}

fn copiar_recursivo(de: &Path, para: &Path) -> Result<(), String> {
    if de.is_dir() {
        std::fs::create_dir_all(para).map_err(|e| e.to_string())?;
        for item in std::fs::read_dir(de).map_err(|e| e.to_string())?.flatten() {
            copiar_recursivo(&item.path(), &para.join(item.file_name()))?;
        }
    } else {
        std::fs::copy(de, para).map_err(|e| format!("{}: {e}", de.display()))?;
    }
    Ok(())
}

/// Passa a usar outra pasta de dados, levando junto o que ja existe.
#[tauri::command]
fn definir_pasta_dados(
    ctx: State<Contexto>,
    caminho: String,
    mover: bool,
) -> Result<(), String> {
    let destino = PathBuf::from(&caminho);
    let atual = ctx.dados()?;
    if destino == atual {
        return Ok(());
    }
    if mover && atual.is_dir() {
        std::fs::create_dir_all(&destino).map_err(|e| e.to_string())?;
        for item in std::fs::read_dir(&atual).map_err(|e| e.to_string())?.flatten() {
            let de = item.path();
            let para = destino.join(item.file_name());
            // rename falha entre discos diferentes; nesse caso copia e apaga.
            if std::fs::rename(&de, &para).is_err() {
                copiar_recursivo(&de, &para)?;
                let _ = if de.is_dir() {
                    std::fs::remove_dir_all(&de)
                } else {
                    std::fs::remove_file(&de)
                };
            }
        }
    }
    dados::salvar_pasta_dados(&destino)?;
    let mut l = ctx.locais.lock().map_err(|e| e.to_string())?;
    l.dados = destino;
    drop(l);
    ctx.malhas.lock().map_err(|e| e.to_string())?.clear();
    Ok(())
}

/// Apaga um estado. `downloads` tambem remove os arquivos baixados dele.
#[tauri::command]
fn apagar_estado(ctx: State<Contexto>, uf: String, downloads: bool) -> Result<f64, String> {
    let d = ctx.dados()?;
    let uf = dados::normalizar_uf(&uf)?;
    let mut liberado = dados::apagar_estado(&d, &uf)?;
    if downloads {
        liberado += dados::apagar_downloads(&d, &uf)?;
    }
    Ok(liberado as f64 / 1e9)
}

#[tauri::command]
fn buscar(
    ctx: State<Contexto>,
    uf: String,
    filtros: Filtros,
    pagina: i64,
    por_pagina: i64,
) -> Result<PaginaContatos, String> {
    let uf = dados::normalizar_uf(&uf)?;
    dados::buscar(&ctx.dados()?, &uf, &filtros, pagina, por_pagina)
}

#[tauri::command]
fn municipios(ctx: State<Contexto>, uf: String) -> Result<Vec<ContagemArea>, String> {
    let uf = dados::normalizar_uf(&uf)?;
    dados::municipios(&ctx.dados()?, &uf)
}

#[tauri::command]
fn segmentos(ctx: State<Contexto>, uf: String) -> Result<Vec<ContagemArea>, String> {
    let uf = dados::normalizar_uf(&uf)?;
    dados::segmentos(&ctx.dados()?, &uf)
}

#[tauri::command]
fn malha(ctx: State<Contexto>, nome: String) -> Result<serde_json::Value, String> {
    if nome != "malha_br.geojson" {
        return dados::malha(&ctx.dados()?, &nome);
    }

    let mut malhas = ctx.malhas.lock().map_err(|e| e.to_string())?;
    if let Some(malha) = malhas.get(&nome) {
        return Ok(malha.clone());
    }
    let malha = dados::malha(&ctx.dados()?, &nome)?;
    malhas.insert(nome, malha.clone());
    Ok(malha)
}

#[tauri::command]
async fn garantir_malha(app: tauri::AppHandle, uf: String) -> Result<(), String> {
    let uf = dados::normalizar_uf(&uf)?;
    let ctx = app.state::<Contexto>();
    let locais = ctx.locais()?;
    let args = vec![
        caminho_script(&locais, "baixar_malha.py"),
        "--uf".into(),
        uf,
        "--dados".into(),
        locais.dados.to_string_lossy().into_owned(),
    ];
    rodar_script(app.clone(), &locais, args, "progresso-mapa")?;
    ctx.malhas.lock().map_err(|e| e.to_string())?.clear();
    Ok(())
}

fn python() -> String {
    std::env::var("PYTHON").unwrap_or_else(|_| "python".to_string())
}

/// Em desenvolvimento, chama os fontes Python em `src/`. No pacote, chama o
/// executavel PyInstaller correspondente, que ja traz o interpretador e as
/// dependencias: quem instala o Garimpo nao precisa ter Python no PATH.
fn caminho_script(locais: &Locais, nome: &str) -> String {
    if locais.repo {
        locais.scripts.join(nome).to_string_lossy().into_owned()
    } else {
        let nome = if cfg!(windows) {
            nome.strip_suffix(".py").unwrap_or(nome).to_string() + ".exe"
        } else {
            nome.strip_suffix(".py").unwrap_or(nome).to_string()
        };
        locais.scripts.join(nome).to_string_lossy().into_owned()
    }
}

/// Roda um script do projeto e devolve cada linha da saida para a tela.
///
/// A ingestao leva ~25 min e a geracao ~15: sem acompanhar a saida, a janela
/// ficaria parada sem dizer o que esta acontecendo.
fn rodar_script(
    app: tauri::AppHandle,
    locais: &Locais,
    args: Vec<String>,
    evento: &'static str,
) -> Result<(), String> {
    let mut args = args.into_iter();
    let primeiro = args.next().ok_or("nenhum comando para executar")?;
    let mut comando = if locais.repo {
        let mut comando = Command::new(python());
        comando.arg(primeiro);
        comando
    } else {
        Command::new(primeiro)
    };
    comando
        .args(args)
        .current_dir(&locais.dados)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    comando.creation_flags(SEM_JANELA);

    let mut filho = comando
        .spawn()
        .map_err(|e| format!("não consegui executar a ferramenta do Garimpo: {e}"))?;

    let stdout = filho.stdout.take();
    let stderr = filho.stderr.take();

    let leitor_saida = stdout.map(|saida| {
        let app = app.clone();
        std::thread::spawn(move || {
            for linha in BufReader::new(saida).lines().map_while(Result::ok) {
                let _ = app.emit(evento, LinhaProgresso { texto: linha, fim: false, erro: false });
            }
        })
    });
    let leitor_erros = stderr.map(|erros| {
        let app = app.clone();
        std::thread::spawn(move || {
            let mut texto = String::new();
            for linha in BufReader::new(erros).lines().map_while(Result::ok) {
                texto.push_str(&linha);
                texto.push('\n');
                let _ = app.emit(evento, LinhaProgresso { texto: linha, fim: false, erro: true });
            }
            texto
        })
    });

    let status = filho.wait().map_err(|e| e.to_string())?;
    if let Some(leitor) = leitor_saida {
        leitor.join().map_err(|_| "falha ao ler a saída do processo".to_string())?;
    }
    let erros = leitor_erros
        .map(|leitor| leitor.join().map_err(|_| "falha ao ler os erros do processo".to_string()))
        .transpose()?
        .unwrap_or_default();
    let ok = status.success();
    let _ = app.emit(
        evento,
        LinhaProgresso {
            texto: if ok { "concluído".into() } else { "falhou".into() },
            fim: true,
            erro: !ok,
        },
    );
    if ok {
        Ok(())
    } else {
        Err(if erros.is_empty() { "o processo falhou".into() } else { erros })
    }
}

/// Baixa e monta os estados pedidos.
///
/// A ingestao recebe todas as UFs de uma vez: os arquivos da Receita sao
/// nacionais, entao pedir um estado por vez baixaria os mesmos 6,7 GB de novo
/// a cada um. A montagem do banco, essa sim, e por estado.
#[tauri::command]
async fn atualizar(
    app: tauri::AppHandle,
    ufs: Vec<String>,
    baixar_cadastro: bool,
    cidades: Vec<String>,
) -> Result<(), String> {
    let mut ufs_normalizadas = Vec::with_capacity(ufs.len());
    for uf in ufs {
        let uf = dados::normalizar_uf(&uf)?;
        if !ufs_normalizadas.contains(&uf) {
            ufs_normalizadas.push(uf);
        }
    }

    let ctx = app.state::<Contexto>();
    let locais = ctx.locais()?;
    {
        let mut rodando = ctx.rodando.lock().map_err(|e| e.to_string())?;
        if *rodando {
            return Err("já existe uma atualização em andamento".into());
        }
        *rodando = true;
    }

    let pasta_dados = locais.dados.to_string_lossy().into_owned();
    let resultado = (|| {
        if ufs_normalizadas.is_empty() {
            return Err("escolha ao menos um estado".to_string());
        }
        if baixar_cadastro {
            let mut args = vec![
                caminho_script(&locais, "ingestar_receita.py"),
                "--uf".to_string(),
            ];
            args.extend(ufs_normalizadas.iter().cloned());
            args.push("--dados".into());
            args.push(pasta_dados.clone());
            rodar_script(app.clone(), &locais, args, "progresso")?;
        }
        for uf in &ufs_normalizadas {
            let mut args = vec![
                caminho_script(&locais, "gerar_leads.py"),
                "--uf".to_string(),
                uf.clone(),
            ];
            if !cidades.is_empty() {
                args.push("--cidades".into());
                args.extend(cidades.iter().cloned());
            }
            args.push("--dados".into());
            args.push(pasta_dados.clone());
            rodar_script(app.clone(), &locais, args, "progresso")?;
        }
        Ok(())
    })();

    let ctx = app.state::<Contexto>();
    if let Ok(mut rodando) = ctx.rodando.lock() {
        *rodando = false;
    }
    resultado
}

#[tauri::command]
async fn exportar(
    app: tauri::AppHandle,
    uf: String,
    cidade: String,
    segmento: String,
    score_minimo: i64,
    ids: Vec<i64>,
    destino: String,
) -> Result<String, String> {
    let uf = dados::normalizar_uf(&uf)?;
    let ctx = app.state::<Contexto>();
    let locais = ctx.locais()?;
    let mut args = vec![
        caminho_script(&locais, "exportar.py"),
        "--uf".to_string(),
        uf,
        "--saida".into(),
        destino.clone(),
        "--dados".into(),
        locais.dados.to_string_lossy().into_owned(),
    ];

    // Uma selecao de milhares de ids nao cabe na linha de comando do Windows
    // (limite de ~32k caracteres), entao acima de um punhado ela vai por arquivo.
    let mut temporario: Option<PathBuf> = None;
    if !ids.is_empty() {
        if ids.len() > 200 {
            let caminho = std::env::temp_dir()
                .join(format!("garimpo_selecao_{}.txt", std::process::id()));
            let texto: String = ids
                .iter()
                .map(|i| i.to_string())
                .collect::<Vec<_>>()
                .join("\n");
            std::fs::write(&caminho, texto).map_err(|e| e.to_string())?;
            args.push("--ids-arquivo".into());
            args.push(caminho.to_string_lossy().into_owned());
            temporario = Some(caminho);
        } else {
            args.push("--ids".into());
            args.push(ids.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(","));
        }
    } else {
        if !cidade.is_empty() {
            args.push("--cidade".into());
            args.push(cidade);
        }
        if !segmento.is_empty() {
            args.push("--segmento".into());
            args.push(segmento);
        }
        if score_minimo > 0 {
            args.push("--score-minimo".into());
            args.push(score_minimo.to_string());
        }
    }

    let resultado = rodar_script(app.clone(), &locais, args, "progresso");
    if let Some(caminho) = temporario {
        let _ = std::fs::remove_file(caminho);
    }
    resultado?;
    Ok(destino)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Sempre resolve: sem configuração usa a pasta padrão do usuário e
            // a cria. O app abre e funciona sem perguntar nada.
            app.manage(Contexto {
                locais: Mutex::new(dados::locais(app.path().resource_dir().ok())),
                rodando: Mutex::new(false),
                malhas: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            estados,
            ajustes,
            definir_pasta_dados,
            apagar_estado,
            buscar,
            municipios,
            segmentos,
            malha,
            garantir_malha,
            atualizar,
            exportar
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a janela");
}
