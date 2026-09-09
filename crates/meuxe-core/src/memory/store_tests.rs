use super::super::dedup::FACT_CAP;
use super::*;
use crate::memory::types::MoodNote;
use chrono::{Duration, TimeZone};

fn mem() -> (tempfile::TempDir, CompanionMemory) {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().to_path_buf();
    (tmp, CompanionMemory::new(&path))
}

fn notes_with_remember(text: &str) -> TurnNotes {
    TurnNotes {
        remember: vec![text.into()],
        ..Default::default()
    }
}

#[test]
fn rejects_invalid_ids() {
    let (_tmp, store) = mem();
    assert!(store.snapshot("../x", "user1").is_err());
    assert!(store.add_fact("rika", "", "fact").is_err());
}

#[test]
fn store_round_trip() {
    let (_tmp, store) = mem();
    store
        .add_fact("rika", "user1", "Their dog is named Rex")
        .unwrap();
    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.facts.len(), 1);
    assert_eq!(snap.facts[0].text, "Their dog is named Rex");
    assert!(snap.memory_dir.contains("companions/rika"));
}

#[test]
fn apply_turn_creates_facts_moment_mood_threads_and_bumps_bond() {
    let (_tmp, store) = mem();
    let notes = TurnNotes {
        remember: vec!["They work on backend systems".into()],
        moment: Some("They vented about a tough deploy.".into()),
        mood: Some(MoodNote {
            name: "worried".into(),
            intensity: Some(0.6),
            cause: Some("they sounded stressed".into()),
            wants: Some("to hear how it went".into()),
        }),
        closeness: Some(1),
        open_threads: vec!["Ask how the deploy went".into()],
        closed_threads: vec![],
    };
    let snap = store
        .apply_turn("rika", "user1", "bad day at work", Some(notes))
        .unwrap();
    assert_eq!(snap.facts.len(), 1);
    assert_eq!(snap.moments.len(), 1);
    assert_eq!(snap.bond.bond.mood.name, "worried");
    assert_eq!(snap.bond.bond.threads.len(), 1);
    assert_eq!(snap.bond.bond.turns, 1);
    assert!(snap.bond.bond.closeness > 0.0);
}

#[test]
fn near_duplicate_facts_merge_real_chat_rows() {
    let (_tmp, store) = mem();
    let rows = [
        "has a dog named Rex",
        "Rex is a corgi",
        "Meet has a dog named Rex who is a corgi",
        "has a job interview tomorrow with Dr. Chen",
        "Meet has a job interview with Dr. Chen at 10am",
    ];
    for row in rows {
        store
            .apply_turn("rika", "user1", "", Some(notes_with_remember(row)))
            .unwrap();
    }
    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.facts.len(), 2);
    let combined = snap
        .facts
        .iter()
        .map(|f| f.text.to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(combined.contains("rex") && combined.contains("corgi"));
    assert!(combined.contains("chen") || combined.contains("interview"));
}

#[test]
fn near_duplicate_open_threads_merge() {
    let (_tmp, store) = mem();
    let notes1 = TurnNotes {
        open_threads: vec!["what kind of job it is".into()],
        ..Default::default()
    };
    let notes2 = TurnNotes {
        open_threads: vec!["what kind of job is the interview for".into()],
        ..Default::default()
    };
    store.apply_turn("rika", "user1", "", Some(notes1)).unwrap();
    store.apply_turn("rika", "user1", "", Some(notes2)).unwrap();
    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.bond.bond.threads.len(), 1);
}

#[test]
fn near_duplicate_facts_merge() {
    let (_tmp, store) = mem();
    store
        .apply_turn(
            "rika",
            "user1",
            "",
            Some(notes_with_remember("Their dog is named Rex")),
        )
        .unwrap();
    store
        .apply_turn(
            "rika",
            "user1",
            "",
            Some(notes_with_remember("their dog is named REX!!!")),
        )
        .unwrap();
    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.facts.len(), 1);
    assert_eq!(snap.facts[0].mentions, 2);
    assert_eq!(snap.facts[0].text, "their dog is named REX!!!");
}

#[test]
fn fact_cap_eviction() {
    let (_tmp, store) = mem();
    for i in 0..305 {
        store
            .add_fact("rika", "user1", &format!("Fact {i} topic {i} only"))
            .unwrap();
    }
    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.facts.len(), FACT_CAP);
}

#[test]
fn no_instant_forgiveness_then_second_turn_resolves() {
    let (_tmp, store) = mem();
    let t0 = Utc.with_ymd_and_hms(2026, 9, 1, 12, 0, 0).unwrap();
    store
        .apply_turn_at(
            "rika",
            "user1",
            "",
            Some(TurnNotes {
                mood: Some(MoodNote {
                    name: "hurt".into(),
                    intensity: Some(0.7),
                    cause: Some("they were dismissive".into()),
                    wants: None,
                }),
                ..Default::default()
            }),
            t0,
        )
        .unwrap();

    let t1 = t0 + Duration::minutes(1);
    let snap = store
        .apply_turn_at(
            "rika",
            "user1",
            "",
            Some(TurnNotes {
                mood: Some(MoodNote {
                    name: "happy".into(),
                    intensity: Some(0.8),
                    cause: None,
                    wants: None,
                }),
                ..Default::default()
            }),
            t1,
        )
        .unwrap();
    assert_eq!(snap.bond.bond.mood.name, "hurt");
    assert!((snap.bond.bond.mood.intensity - 0.35).abs() < 0.001);

    let t2 = t1 + Duration::minutes(1);
    let snap2 = store
        .apply_turn_at(
            "rika",
            "user1",
            "",
            Some(TurnNotes {
                mood: Some(MoodNote {
                    name: "warm".into(),
                    intensity: Some(0.6),
                    cause: None,
                    wants: None,
                }),
                ..Default::default()
            }),
            t2,
        )
        .unwrap();
    assert_eq!(snap2.bond.bond.mood.name, "warm");
}

#[test]
fn mood_decay_to_neutral_adds_closure_thread() {
    let (_tmp, store) = mem();
    let t0 = Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap();
    store
        .apply_turn_at(
            "rika",
            "user1",
            "",
            Some(TurnNotes {
                mood: Some(MoodNote {
                    name: "hurt".into(),
                    intensity: Some(0.3),
                    cause: Some("they forgot our plans".into()),
                    wants: None,
                }),
                ..Default::default()
            }),
            t0,
        )
        .unwrap();

    let t1 = t0 + Duration::hours(120);
    let snap = store.snapshot_at("rika", "user1", t1).unwrap();
    assert!(is_neutral_mood(&snap.bond.bond.mood.name));
    assert!(snap
        .bond
        .bond
        .threads
        .iter()
        .any(|t| t.text.contains("Never got closure on")));
}

#[test]
fn missed_you_after_six_days() {
    let (_tmp, store) = mem();
    let t0 = Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap();
    for _ in 0..12 {
        store
            .apply_turn_at(
                "rika",
                "user1",
                "",
                Some(TurnNotes {
                    closeness: Some(2),
                    ..Default::default()
                }),
                t0,
            )
            .unwrap();
    }

    let t1 = t0 + Duration::days(6);
    let snap = store.snapshot_at("rika", "user1", t1).unwrap();
    assert!(snap.bond.bond.closeness >= 0.35);
    assert_eq!(snap.bond.bond.mood.name, "missed you");
    assert!((snap.bond.bond.mood.intensity - 0.3).abs() < 0.001);
}

#[test]
fn closeness_drift_after_fourteen_days() {
    let (_tmp, store) = mem();
    let t0 = Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap();
    store
        .apply_turn_at(
            "rika",
            "user1",
            "",
            Some(TurnNotes {
                closeness: Some(2),
                ..Default::default()
            }),
            t0,
        )
        .unwrap();
    let closeness_before = store
        .snapshot_at("rika", "user1", t0)
        .unwrap()
        .bond
        .bond
        .closeness;

    let t1 = t0 + Duration::days(20);
    let snap = store.snapshot_at("rika", "user1", t1).unwrap();
    let expected = (closeness_before - 6.0 * 0.005).max(0.1);
    assert!((snap.bond.bond.closeness - expected).abs() < 0.0001);
}

#[test]
fn legacy_import() {
    let tmp = tempfile::tempdir().unwrap();
    let legacy_dir = tmp.path().join("data/rika/user1/memory");
    std::fs::create_dir_all(&legacy_dir).unwrap();
    let semantic = LegacyMemory {
        id: "s1".into(),
        ts: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
        memory_type: "semantic".into(),
        summary: "User likes tea".into(),
        importance: 0.8,
        tags: vec![],
        metadata: serde_json::Value::Null,
    };
    let episodic = LegacyMemory {
        id: "e1".into(),
        ts: Utc.with_ymd_and_hms(2026, 1, 2, 0, 0, 0).unwrap(),
        memory_type: "episodic".into(),
        summary: "Talked about hobbies".into(),
        importance: 0.7,
        tags: vec![],
        metadata: serde_json::Value::Null,
    };
    std::fs::write(
        legacy_dir.join("semantic.jsonl"),
        format!("{}\n", serde_json::to_string(&semantic).unwrap()),
    )
    .unwrap();
    std::fs::write(
        legacy_dir.join("episodic.jsonl"),
        format!("{}\n", serde_json::to_string(&episodic).unwrap()),
    )
    .unwrap();

    let store = CompanionMemory::new(tmp.path());
    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.facts.len(), 1);
    assert_eq!(snap.facts[0].source, FactSource::Legacy);
    assert_eq!(snap.moments.len(), 1);
    assert!(legacy_dir.join("semantic.jsonl").exists());
}

#[test]
fn reset_clears_and_blocks_legacy_reimport() {
    let tmp = tempfile::tempdir().unwrap();
    let legacy_dir = tmp.path().join("data/rika/user1/memory");
    std::fs::create_dir_all(&legacy_dir).unwrap();
    std::fs::write(
        legacy_dir.join("semantic.jsonl"),
        r#"{"id":"s1","ts":"2026-01-01T00:00:00Z","type":"semantic","summary":"Old fact","importance":0.5,"tags":[]}"#,
    )
    .unwrap();

    let store = CompanionMemory::new(tmp.path());
    store.snapshot("rika", "user1").unwrap();
    store.reset("rika", "user1").unwrap();

    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.facts.len(), 0);
    assert_eq!(snap.bond.bond.turns, 0);
    assert_eq!(snap.bond.bond.closeness, 0.0);
}

#[test]
fn legacy_import_enforces_fact_cap() {
    let tmp = tempfile::tempdir().unwrap();
    let legacy_dir = tmp.path().join("data/rika/user1/memory");
    std::fs::create_dir_all(&legacy_dir).unwrap();

    let mut lines = String::new();
    for i in 0..305 {
        let row = LegacyMemory {
            id: format!("s{i}"),
            ts: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            memory_type: "semantic".into(),
            summary: format!("Unique legacy fact number {i}"),
            importance: 0.5,
            tags: vec![],
            metadata: serde_json::Value::Null,
        };
        lines.push_str(&serde_json::to_string(&row).unwrap());
        lines.push('\n');
    }
    std::fs::write(legacy_dir.join("semantic.jsonl"), lines).unwrap();

    let store = CompanionMemory::new(tmp.path());
    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.facts.len(), FACT_CAP);
}

#[test]
fn moment_cap_persisted_on_disk() {
    let (_tmp, store) = mem();
    let t0 = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap();
    for i in 0..(MOMENT_DISK_CAP + 5) {
        store
            .apply_turn_at(
                "rika",
                "user1",
                "",
                Some(TurnNotes {
                    moment: Some(format!("Moment number {i}")),
                    ..Default::default()
                }),
                t0 + chrono::Duration::minutes(i as i64),
            )
            .unwrap();
    }
    let dir = store.snapshot("rika", "user1").unwrap().memory_dir;
    let on_disk = std::fs::read_to_string(Path::new(&dir).join("moments.jsonl"))
        .unwrap()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .count();
    assert_eq!(on_disk, MOMENT_DISK_CAP);
}

#[test]
fn long_conversation_holds_anger_until_a_real_apology() {
    let (_tmp, store) = mem();
    let t0 = Utc.with_ymd_and_hms(2026, 9, 5, 10, 0, 0).unwrap();

    let turns: Vec<(&str, TurnNotes)> = vec![
        (
            "Hey, I'm Meet. My dog is named Rex and I just started a new job.",
            TurnNotes {
                remember: vec![
                    "Their name is Meet".into(),
                    "Their dog is named Rex".into(),
                    "They just started a new job".into(),
                ],
                moment: Some("They introduced themselves and Rex.".into()),
                mood: Some(MoodNote {
                    name: "happy".into(),
                    intensity: Some(0.4),
                    cause: Some("they opened up".into()),
                    wants: None,
                }),
                closeness: Some(1),
                ..Default::default()
            },
        ),
        (
            "I promised I'd tell you how the interview went. It was fine. anyway whatever",
            TurnNotes {
                moment: Some("They brushed off a promise about the interview.".into()),
                mood: Some(MoodNote {
                    name: "hurt".into(),
                    intensity: Some(0.7),
                    cause: Some("they brushed off something they promised to share".into()),
                    wants: Some("a real conversation about how it went".into()),
                }),
                closeness: Some(-1),
                open_threads: vec!["Ask how the interview actually went".into()],
                ..Default::default()
            },
        ),
        (
            "lol you're being dramatic. thanks anyway you're great",
            TurnNotes {
                moment: Some("They dismissed the feeling and complimented instead.".into()),
                mood: Some(MoodNote {
                    name: "happy".into(),
                    intensity: Some(0.8),
                    cause: None,
                    wants: None,
                }),
                closeness: Some(1),
                ..Default::default()
            },
        ),
        (
            "ok fine. I froze in the second round and I hate that I snapped at you.",
            TurnNotes {
                remember: vec!["They froze in the second interview round".into()],
                moment: Some("They finally told the truth and owned snapping.".into()),
                mood: Some(MoodNote {
                    name: "warm".into(),
                    intensity: Some(0.45),
                    cause: Some("they were honest".into()),
                    wants: None,
                }),
                closeness: Some(2),
                closed_threads: vec!["interview".into()],
                ..Default::default()
            },
        ),
    ];

    let mut now = t0;
    let mut last = store.snapshot_at("rika", "user1", now).unwrap();
    for (message, notes) in turns {
        last = store
            .apply_turn_at("rika", "user1", message, Some(notes), now)
            .unwrap();
        now += Duration::minutes(3);
    }

    assert!(last
        .facts
        .iter()
        .any(|f| f.text.to_lowercase().contains("rex")));
    assert!(last
        .facts
        .iter()
        .any(|f| f.text.to_lowercase().contains("froze")));
    assert_eq!(last.bond.bond.turns, 4);
    assert_eq!(last.bond.bond.mood.name, "warm");
    assert!(last.bond.bond.threads.is_empty());
    let context = crate::memory::format_memory_context(&last, "Meet", "how is rex");
    assert!(context.contains("Rex") || context.contains("rex"));
    assert!(!context.to_lowercase().contains("<<<meuxe"));
}

#[test]
fn cache_hit_avoids_disk_re_read() {
    let (_tmp, store) = mem();
    store
        .add_fact("rika", "user1", "Their dog is named Rex")
        .unwrap();
    let snap1 = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap1.facts.len(), 1);

    let dir = Path::new(&snap1.memory_dir);
    std::fs::remove_file(dir.join("bond.json")).unwrap();
    std::fs::remove_file(dir.join("profile.json")).unwrap();
    std::fs::remove_file(dir.join("moments.jsonl")).unwrap();

    let snap2 = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap2.facts.len(), 1);
    assert_eq!(snap2.facts[0].text, "Their dog is named Rex");
}

#[test]
fn cache_write_through_updates_snapshot() {
    let (_tmp, store) = mem();
    store.add_fact("rika", "user1", "They like tea").unwrap();
    store.add_fact("rika", "user1", "They have a cat").unwrap();
    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.facts.len(), 2);
}

#[test]
fn cache_invalidate_forces_disk_re_read() {
    let (_tmp, store) = mem();
    store.add_fact("rika", "user1", "Original fact").unwrap();
    let snap = store.snapshot("rika", "user1").unwrap();
    let dir = Path::new(&snap.memory_dir);

    std::fs::write(
        dir.join("profile.json"),
        r#"{"facts":[{"id":"f1","text":"Disk-only fact","kind":"other","created_at":"2026-01-01T00:00:00Z","confirmed_at":"2026-01-01T00:00:00Z","mentions":1,"source":"user"}]}"#,
    )
    .unwrap();

    let cached = store.snapshot("rika", "user1").unwrap();
    assert_eq!(cached.facts[0].text, "Original fact");

    store.invalidate("rika", "user1");
    let fresh = store.snapshot("rika", "user1").unwrap();
    assert_eq!(fresh.facts.len(), 1);
    assert_eq!(fresh.facts[0].text, "Disk-only fact");
}

#[test]
fn cache_invalidate_all_clears_every_entry() {
    let (_tmp, store) = mem();
    store.add_fact("rika", "user1", "Fact A").unwrap();
    store.add_fact("luna", "user2", "Fact B").unwrap();
    store.invalidate_all();

    let snap = store.snapshot("rika", "user1").unwrap();
    assert_eq!(snap.facts.len(), 1);
    assert_eq!(snap.facts[0].text, "Fact A");
}
