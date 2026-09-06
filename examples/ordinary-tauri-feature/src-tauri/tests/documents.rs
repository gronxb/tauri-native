// Exercise private command functions without adding a public application API.
include!("../src/lib.rs");
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_STORE: AtomicUsize = AtomicUsize::new(0);

struct Store(PathBuf);
impl Store {
    fn new() -> Self {
        Self(
            std::env::temp_dir().join(format!(
                "fieldnotes-{}-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT_STORE.fetch_add(1, Ordering::Relaxed)
            )),
        )
    }
    fn directory(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
}
impl Drop for Store {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn saved_documents_survive_a_new_process() {
    if let Ok(directory) = std::env::var("FIELDNOTES_TEST_DIRECTORY") {
        let found = search_documents(directory, "  서울 🦀  ".into()).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Travel");
        assert_eq!(found[0].body, "Visit 서울 🦀 in autumn.");
        return;
    }
    let store = Store::new();
    assert!(search_documents(store.directory(), "".into())
        .unwrap()
        .is_empty());
    save_document(
        store.directory(),
        "  Travel  ".into(),
        "Visit 서울 🦀 in autumn.".into(),
    )
    .unwrap();
    assert!(Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "saved_documents_survive_a_new_process"])
        .env("FIELDNOTES_TEST_DIRECTORY", store.directory())
        .status()
        .unwrap()
        .success());
    save_document(
        store.directory(),
        "Travel".into(),
        "Updated: bring a BLUE notebook.".into(),
    )
    .unwrap();
    assert!(search_documents(store.directory(), "서울".into())
        .unwrap()
        .is_empty());
    assert_eq!(
        search_documents(store.directory(), "blue".into()).unwrap()[0].title,
        "Travel"
    );
    assert_eq!(
        search_documents(store.directory(), "".into())
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn concurrent_saves_do_not_lose_documents() {
    let store = Store::new();
    let jobs: Vec<_> = (0..16)
        .map(|id| {
            let directory = store.directory();
            std::thread::spawn(move || {
                save_document(directory, format!("Note {id:02}"), "Shared text".into()).unwrap()
            })
        })
        .collect();
    for job in jobs {
        job.join().unwrap();
    }
    let documents = search_documents(store.directory(), "shared".into()).unwrap();
    assert_eq!(documents.len(), 16);
    assert_eq!(documents[0].title, "Note 00");
    assert_eq!(documents[15].title, "Note 15");
}

#[test]
fn invalid_input_and_corrupt_storage_do_not_overwrite_saved_bytes() {
    let store = Store::new();
    save_document(store.directory(), "Keep".into(), "Original".into()).unwrap();
    let file = store.0.join("fieldnotes/documents.json");
    let before = fs::read(&file).unwrap();
    for title in [" ".to_string(), "x".repeat(121)] {
        assert!(save_document(store.directory(), title, "Ignored".into()).is_err());
    }
    assert!(save_document(store.directory(), "Keep".into(), "x".repeat(65537)).is_err());
    assert_eq!(fs::read(&file).unwrap(), before);
    assert!(search_documents("relative".into(), "".into()).is_err());
    fs::write(&file, "broken JSON").unwrap();
    assert!(search_documents(store.directory(), "".into())
        .unwrap_err()
        .contains("Could not read"));
    assert!(save_document(store.directory(), "New".into(), "Ignored".into()).is_err());
    assert_eq!(fs::read_to_string(file).unwrap(), "broken JSON");
}
