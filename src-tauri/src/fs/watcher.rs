use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::channel;
use tauri::{AppHandle, Emitter};

/// File system event types
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
pub enum FsEvent {
    Created { path: String },
    Modified { path: String },
    Deleted { path: String },
    Renamed { old_path: String, new_path: String },
}

/// Start watching a directory for changes
/// Emits "fs:change" events to the frontend
pub fn start_watcher(app: AppHandle, watch_path: String) -> Result<(), String> {
    let (tx, rx) = channel();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&watch_path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Spawn a thread to handle events
    std::thread::spawn(move || {
        // Keep watcher alive
        let _watcher = watcher;

        while let Ok(event) = rx.recv() {
            // Process .md and .db.json files
            let paths: Vec<_> = event
                .paths
                .iter()
                .filter(|p| {
                    let path_str = p.to_string_lossy();
                    path_str.ends_with(".md") || path_str.ends_with(".db.json")
                })
                .collect();

            if paths.is_empty() {
                continue;
            }

            let fs_event = match event.kind {
                notify::EventKind::Create(_) => {
                    paths.first().map(|p| FsEvent::Created {
                        path: p.to_string_lossy().to_string(),
                    })
                }
                notify::EventKind::Modify(_) => {
                    paths.first().map(|p| FsEvent::Modified {
                        path: p.to_string_lossy().to_string(),
                    })
                }
                notify::EventKind::Remove(_) => {
                    paths.first().map(|p| FsEvent::Deleted {
                        path: p.to_string_lossy().to_string(),
                    })
                }
                _ => None,
            };

            if let Some(evt) = fs_event {
                let _ = app.emit("fs:change", evt);
            }
        }
    });

    Ok(())
}
