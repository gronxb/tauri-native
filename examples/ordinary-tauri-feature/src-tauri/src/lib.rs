use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::Mutex;

// Commands can run concurrently; keep each read/modify/write transaction intact.
static STORE: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Document {
    pub title: String,
    pub body: String,
}

fn store_path(directory: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(directory);
    if !root.is_absolute() {
        return Err("The document directory must be absolute.".into());
    }
    Ok(root.join("fieldnotes").join("documents.json"))
}

fn read_documents(path: &PathBuf) -> Result<Vec<Document>, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| format!("Could not read saved documents: {error}")),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("Could not open saved documents: {error}")),
    }
}

#[tauri::command]
fn save_document(directory: String, title: String, body: String) -> Result<Document, String> {
    let title = title.trim().to_owned();
    if title.is_empty() || title.chars().count() > 120 {
        return Err("Use a title between 1 and 120 characters.".into());
    }
    if body.len() > 64 * 1024 {
        return Err("Keep each document under 64 KB.".into());
    }
    let path = store_path(&directory)?;
    let _guard = STORE
        .lock()
        .map_err(|_| "The document store is unavailable.")?;
    let mut documents = read_documents(&path)?;
    let document = Document { title, body };
    if let Some(existing) = documents
        .iter_mut()
        .find(|item| item.title == document.title)
    {
        *existing = document.clone();
    } else {
        documents.push(document.clone());
    }
    documents.sort_by(|left, right| left.title.cmp(&right.title));
    let bytes = serde_json::to_vec(&documents).map_err(|error| error.to_string())?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, bytes).map_err(|error| format!("Could not save document: {error}"))?;
    fs::rename(temporary, path).map_err(|error| format!("Could not finish saving: {error}"))?;
    Ok(document)
}

#[tauri::command]
fn search_documents(directory: String, query: String) -> Result<Vec<Document>, String> {
    let path = store_path(&directory)?;
    let _guard = STORE
        .lock()
        .map_err(|_| "The document store is unavailable.")?;
    let needle = query.trim().to_lowercase();
    Ok(read_documents(&path)?
        .into_iter()
        .filter(|item| {
            item.title.to_lowercase().contains(&needle)
                || item.body.to_lowercase().contains(&needle)
        })
        .collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_document, search_documents])
        .run(tauri::generate_context!())
        .expect("error while running Fieldnotes");
}
