use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError, RwLock};
use uuid::Uuid;

use crate::fs_util::write_atomic;
use crate::ids::validate_id;
use crate::{MeuxeError, Result};

use super::dedup::{enforce_fact_cap, infer_fact_kind, upsert_fact};
use super::mood_rules::{apply_mood_note, apply_thread_notes, apply_time_rules};
use super::types::{
    is_neutral_mood, Bond, BondView, Fact, FactSource, MemorySnapshot, Moment, TurnNotes,
};

const MOMENT_CAP: usize = 50;
/// Moments kept on disk. Larger than the snapshot cap so long-running
/// companions keep their "remember when" history until consolidation exists.
const MOMENT_DISK_CAP: usize = 1000;
const CLOSENESS_BASELINE: f64 = 0.002;
const CLOSENESS_STEP: f64 = 0.015;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Profile {
    facts: Vec<Fact>,
}

/// Legacy JSONL memory row from the old `memory/` store.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyMemory {
    id: String,
    ts: DateTime<Utc>,
    #[serde(rename = "type")]
    memory_type: String,
    summary: String,
    importance: f64,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    metadata: serde_json::Value,
}

#[derive(Debug, Clone)]
struct CachedCompanion {
    bond: Bond,
    facts: Vec<Fact>,
    moments: Vec<Moment>,
}

/// File-backed companion memory store.
pub struct CompanionMemory {
    data_dir: PathBuf,
    _lock: RwLock<()>,
    cache: Mutex<HashMap<(String, String), CachedCompanion>>,
}

impl CompanionMemory {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.to_path_buf(),
            _lock: RwLock::new(()),
            cache: Mutex::new(HashMap::new()),
        }
    }

    pub fn invalidate(&self, character_id: &str, user_id: &str) {
        let mut cache = self.cache.lock().unwrap_or_else(PoisonError::into_inner);
        cache.remove(&(character_id.to_string(), user_id.to_string()));
    }

    pub fn invalidate_all(&self) {
        let mut cache = self.cache.lock().unwrap_or_else(PoisonError::into_inner);
        cache.clear();
    }

    pub fn snapshot(&self, character_id: &str, user_id: &str) -> Result<MemorySnapshot> {
        self.snapshot_at(character_id, user_id, Utc::now())
    }

    pub fn snapshot_at(
        &self,
        character_id: &str,
        user_id: &str,
        now: DateTime<Utc>,
    ) -> Result<MemorySnapshot> {
        let _guard = self.lock_read()?;
        let dir = self.companion_dir(user_id, character_id)?;
        let (mut bond, facts, moments) = self.load_or_import(character_id, user_id, &dir)?;
        let changed = apply_time_rules(&mut bond, now);
        if changed {
            self.write_bond(&dir, &bond)?;
            self.put_cache(character_id, user_id, &bond, &facts, &moments);
        }
        let snapshot_moments = cap_moments_newest_first(&moments, MOMENT_CAP);
        Ok(MemorySnapshot {
            bond: BondView::new(bond, now),
            facts,
            moments: snapshot_moments,
            memory_dir: dir.to_string_lossy().into_owned(),
        })
    }

    pub fn apply_turn(
        &self,
        character_id: &str,
        user_id: &str,
        user_message: &str,
        notes: Option<TurnNotes>,
    ) -> Result<MemorySnapshot> {
        self.apply_turn_at(character_id, user_id, user_message, notes, Utc::now())
    }

    pub fn apply_turn_at(
        &self,
        character_id: &str,
        user_id: &str,
        _user_message: &str, // reserved for future relevance / prompt use
        notes: Option<TurnNotes>,
        now: DateTime<Utc>,
    ) -> Result<MemorySnapshot> {
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id)?;
        let (mut bond, mut facts, mut moments) =
            self.load_or_import(character_id, user_id, &dir)?;

        apply_time_rules(&mut bond, now);

        let mut mood_changed = false;
        let mut closeness_delta_magnitude: i32 = 0;

        if let Some(notes) = notes {
            for text in &notes.remember {
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    continue;
                }
                upsert_fact(&mut facts, trimmed, FactSource::Agent, now);
            }

            if let Some(ref note) = notes.mood {
                mood_changed = apply_mood_note(&mut bond.mood, note, now);
            }

            if let Some(delta) = notes.closeness {
                let clamped = delta.clamp(-2, 2);
                closeness_delta_magnitude = clamped.abs();
                bond.closeness =
                    (bond.closeness + f64::from(clamped) * CLOSENESS_STEP + CLOSENESS_BASELINE)
                        .clamp(0.0, 1.0);
            } else {
                bond.closeness = (bond.closeness + CLOSENESS_BASELINE).clamp(0.0, 1.0);
            }

            if let Some(ref summary) = notes.moment {
                let trimmed = summary.trim();
                if !trimmed.is_empty() {
                    let weight = if mood_changed || closeness_delta_magnitude == 2 {
                        0.8
                    } else {
                        0.5
                    };
                    let feeling = bond.mood.name.clone();
                    moments.push(Moment {
                        id: Uuid::new_v4().to_string(),
                        at: now,
                        summary: trimmed.to_string(),
                        feeling: if is_neutral_mood(&feeling) {
                            None
                        } else {
                            Some(feeling)
                        },
                        weight,
                    });
                }
            }

            apply_thread_notes(&mut bond, &notes, now);
        } else {
            bond.closeness = (bond.closeness + CLOSENESS_BASELINE).clamp(0.0, 1.0);
        }

        bond.turns += 1;
        bond.last_talked_at = Some(now);
        bond.updated_at = now;

        self.persist_all(&dir, &bond, &facts, &moments)?;
        self.put_cache(character_id, user_id, &bond, &facts, &moments);

        let snapshot_moments = cap_moments_newest_first(&moments, MOMENT_CAP);
        Ok(MemorySnapshot {
            bond: BondView::new(bond, now),
            facts,
            moments: snapshot_moments,
            memory_dir: dir.to_string_lossy().into_owned(),
        })
    }

    pub fn add_fact(&self, character_id: &str, user_id: &str, text: &str) -> Result<Fact> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err(MeuxeError::Memory("Fact text cannot be empty".into()));
        }
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id)?;
        let (bond, mut facts, moments) = self.load_or_import(character_id, user_id, &dir)?;
        let now = Utc::now();
        let fact = upsert_fact(&mut facts, trimmed, FactSource::User, now);
        self.persist_all(&dir, &bond, &facts, &moments)?;
        self.put_cache(character_id, user_id, &bond, &facts, &moments);
        Ok(fact)
    }

    pub fn update_fact(
        &self,
        character_id: &str,
        user_id: &str,
        fact_id: &str,
        text: &str,
    ) -> Result<Fact> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err(MeuxeError::Memory("Fact text cannot be empty".into()));
        }
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id)?;
        let (bond, mut facts, moments) = self.load_or_import(character_id, user_id, &dir)?;
        let fact = facts
            .iter_mut()
            .find(|f| f.id == fact_id)
            .ok_or_else(|| MeuxeError::Memory(format!("Fact not found: {fact_id}")))?;
        fact.text = trimmed.to_string();
        fact.kind = infer_fact_kind(trimmed);
        fact.confirmed_at = Utc::now();
        let updated = fact.clone();
        self.persist_all(&dir, &bond, &facts, &moments)?;
        self.put_cache(character_id, user_id, &bond, &facts, &moments);
        Ok(updated)
    }

    pub fn forget_fact(&self, character_id: &str, user_id: &str, fact_id: &str) -> Result<()> {
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id)?;
        let (bond, mut facts, moments) = self.load_or_import(character_id, user_id, &dir)?;
        let before = facts.len();
        facts.retain(|f| f.id != fact_id);
        if facts.len() == before {
            return Err(MeuxeError::Memory(format!("Fact not found: {fact_id}")));
        }
        self.persist_all(&dir, &bond, &facts, &moments)?;
        self.put_cache(character_id, user_id, &bond, &facts, &moments);
        Ok(())
    }

    pub fn forget_moment(&self, character_id: &str, user_id: &str, moment_id: &str) -> Result<()> {
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id)?;
        let (bond, facts, mut moments) = self.load_or_import(character_id, user_id, &dir)?;
        let before = moments.len();
        moments.retain(|m| m.id != moment_id);
        if moments.len() == before {
            return Err(MeuxeError::Memory(format!("Moment not found: {moment_id}")));
        }
        self.persist_all(&dir, &bond, &facts, &moments)?;
        self.put_cache(character_id, user_id, &bond, &facts, &moments);
        Ok(())
    }

    pub fn reset(&self, character_id: &str, user_id: &str) -> Result<()> {
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id)?;
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
        std::fs::create_dir_all(&dir)?;
        // Empty profile prevents legacy re-import on next load.
        self.write_profile(&dir, &Profile::default())?;
        let bond = Bond::default();
        self.write_moments(&dir, &[])?;
        self.write_bond(&dir, &bond)?;
        self.put_cache(character_id, user_id, &bond, &[], &[]);
        Ok(())
    }

    fn companion_dir(&self, user_id: &str, character_id: &str) -> Result<PathBuf> {
        validate_id(user_id)?;
        validate_id(character_id)?;
        Ok(self
            .data_dir
            .join("data")
            .join("users")
            .join(user_id)
            .join("companions")
            .join(character_id))
    }

    fn legacy_memory_dir(&self, character_id: &str, user_id: &str) -> Result<PathBuf> {
        validate_id(character_id)?;
        validate_id(user_id)?;
        Ok(self
            .data_dir
            .join("data")
            .join(character_id)
            .join(user_id)
            .join("memory"))
    }

    fn lock_read(&self) -> Result<std::sync::RwLockReadGuard<'_, ()>> {
        self._lock
            .read()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))
    }

    fn lock_write(&self) -> Result<std::sync::RwLockWriteGuard<'_, ()>> {
        self._lock
            .write()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))
    }

    fn put_cache(
        &self,
        character_id: &str,
        user_id: &str,
        bond: &Bond,
        facts: &[Fact],
        moments: &[Moment],
    ) {
        let mut cache = self.cache.lock().unwrap_or_else(PoisonError::into_inner);
        cache.insert(
            (character_id.to_string(), user_id.to_string()),
            CachedCompanion {
                bond: bond.clone(),
                facts: facts.to_vec(),
                moments: moments.to_vec(),
            },
        );
    }

    fn load_or_import(
        &self,
        character_id: &str,
        user_id: &str,
        dir: &Path,
    ) -> Result<(Bond, Vec<Fact>, Vec<Moment>)> {
        {
            let cache = self.cache.lock().unwrap_or_else(PoisonError::into_inner);
            if let Some(cached) = cache.get(&(character_id.to_string(), user_id.to_string())) {
                return Ok((
                    cached.bond.clone(),
                    cached.facts.clone(),
                    cached.moments.clone(),
                ));
            }
        }

        let (bond, facts, moments) = self.load_or_import_from_disk(dir, character_id, user_id)?;
        self.put_cache(character_id, user_id, &bond, &facts, &moments);
        Ok((bond, facts, moments))
    }

    fn load_or_import_from_disk(
        &self,
        dir: &Path,
        character_id: &str,
        user_id: &str,
    ) -> Result<(Bond, Vec<Fact>, Vec<Moment>)> {
        if dir.exists() {
            let bond = self.read_bond(dir)?;
            let profile = self.read_profile(dir)?;
            let moments = self.read_moments(dir)?;
            return Ok((bond, profile.facts, moments));
        }

        let mut facts = Vec::new();
        let mut moments = Vec::new();
        self.import_legacy(character_id, user_id, &mut facts, &mut moments)?;

        std::fs::create_dir_all(dir)?;
        let bond = Bond::default();
        self.write_profile(
            dir,
            &Profile {
                facts: facts.clone(),
            },
        )?;
        self.write_moments(dir, &moments)?;
        self.write_bond(dir, &bond)?;
        Ok((bond, facts, moments))
    }

    fn import_legacy(
        &self,
        character_id: &str,
        user_id: &str,
        facts: &mut Vec<Fact>,
        moments: &mut Vec<Moment>,
    ) -> Result<()> {
        let legacy_dir = self.legacy_memory_dir(character_id, user_id)?;
        if !legacy_dir.exists() {
            return Ok(());
        }

        let semantic = legacy_dir.join("semantic.jsonl");
        if semantic.exists() {
            for line in read_jsonl_lines(&semantic)? {
                if let Ok(row) = serde_json::from_str::<LegacyMemory>(&line) {
                    let kind = infer_fact_kind(&row.summary);
                    facts.push(Fact {
                        id: row.id,
                        text: row.summary,
                        kind,
                        created_at: row.ts,
                        confirmed_at: row.ts,
                        mentions: 1,
                        source: FactSource::Legacy,
                    });
                }
            }
        }

        let episodic = legacy_dir.join("episodic.jsonl");
        if episodic.exists() {
            for line in read_jsonl_lines(&episodic)? {
                if let Ok(row) = serde_json::from_str::<LegacyMemory>(&line) {
                    moments.push(Moment {
                        id: row.id,
                        at: row.ts,
                        summary: row.summary,
                        feeling: None,
                        weight: row.importance,
                    });
                }
            }
        }

        enforce_fact_cap(facts);

        Ok(())
    }

    fn read_profile(&self, dir: &Path) -> Result<Profile> {
        let path = dir.join("profile.json");
        if !path.exists() {
            return Ok(Profile::default());
        }
        let text = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str(&text)?)
    }

    fn read_bond(&self, dir: &Path) -> Result<Bond> {
        let path = dir.join("bond.json");
        if !path.exists() {
            return Ok(Bond::default());
        }
        let text = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str(&text)?)
    }

    fn read_moments(&self, dir: &Path) -> Result<Vec<Moment>> {
        let path = dir.join("moments.jsonl");
        if !path.exists() {
            return Ok(vec![]);
        }
        let mut moments = Vec::new();
        let file = std::fs::File::open(&path)?;
        let reader = std::io::BufReader::new(file);
        let mut line_number = 0u64;
        for line in reader.lines() {
            line_number += 1;
            let line = line?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            match serde_json::from_str::<Moment>(trimmed) {
                Ok(moment) => moments.push(moment),
                Err(e) => {
                    eprintln!(
                        "memory: skipping corrupt moment line {} in {}: {}",
                        line_number,
                        path.display(),
                        e
                    );
                }
            }
        }
        Ok(moments)
    }

    fn persist_all(
        &self,
        dir: &Path,
        bond: &Bond,
        facts: &[Fact],
        moments: &[Moment],
    ) -> Result<()> {
        std::fs::create_dir_all(dir)?;
        self.write_profile(
            dir,
            &Profile {
                facts: facts.to_vec(),
            },
        )?;
        self.write_moments(dir, moments)?;
        self.write_bond(dir, bond)?;
        Ok(())
    }

    fn write_profile(&self, dir: &Path, profile: &Profile) -> Result<()> {
        write_atomic(
            &dir.join("profile.json"),
            &serde_json::to_string_pretty(profile)?,
        )
    }

    fn write_bond(&self, dir: &Path, bond: &Bond) -> Result<()> {
        write_atomic(&dir.join("bond.json"), &serde_json::to_string_pretty(bond)?)
    }

    fn write_moments(&self, dir: &Path, moments: &[Moment]) -> Result<()> {
        let path = dir.join("moments.jsonl");
        let capped = cap_moments_newest_first(moments, MOMENT_DISK_CAP);
        let mut body = String::new();
        for moment in &capped {
            body.push_str(&serde_json::to_string(moment)?);
            body.push('\n');
        }
        write_atomic(&path, &body)
    }
}

fn read_jsonl_lines(path: &Path) -> Result<Vec<String>> {
    let file = std::fs::File::open(path)?;
    let reader = std::io::BufReader::new(file);
    let mut lines = Vec::new();
    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            lines.push(trimmed.to_string());
        }
    }
    Ok(lines)
}

fn cap_moments_newest_first(moments: &[Moment], cap: usize) -> Vec<Moment> {
    let mut sorted: Vec<Moment> = moments.to_vec();
    sorted.sort_by(|a, b| b.at.cmp(&a.at));
    sorted.truncate(cap);
    sorted
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
