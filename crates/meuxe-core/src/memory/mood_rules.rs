//! Deterministic bond, mood, absence, and open-thread rules.
use super::dedup::{content_tokens, near_duplicate_tokens};
use super::types::{is_negative_mood, is_neutral_mood, Bond, Mood, MoodNote, Thread, TurnNotes};
use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

const THREAD_CAP: usize = 8;
const CLOSENESS_DRIFT_PER_DAY: f64 = 0.005;
const CLOSENESS_DRIFT_MIN: f64 = 0.1;
const MOOD_FADE_THRESHOLD: f64 = 0.15;
const NO_FORGIVENESS_THRESHOLD: f64 = 0.45;
const NO_FORGIVENESS_DROP: f64 = 0.35;

pub(super) fn apply_time_rules(bond: &mut Bond, now: DateTime<Utc>) -> bool {
    let mut changed = false;

    if apply_mood_decay(bond, now) {
        changed = true;
    }

    if apply_missed_you(bond, now) {
        changed = true;
    }

    if apply_closeness_drift(bond, now) {
        changed = true;
    }

    if changed {
        bond.updated_at = now;
    }

    changed
}

fn apply_mood_decay(bond: &mut Bond, now: DateTime<Utc>) -> bool {
    if is_neutral_mood(&bond.mood.name) || bond.mood.intensity <= 0.0 {
        return false;
    }

    let elapsed = now.signed_duration_since(bond.mood.since);
    if elapsed <= Duration::zero() {
        return false;
    }

    let hours = elapsed.num_seconds() as f64 / 3600.0;
    let half_life_hours = if is_negative_mood(&bond.mood.name) {
        48.0
    } else {
        12.0
    };
    let decay_factor = 0.5_f64.powf(hours / half_life_hours);
    let new_intensity = bond.mood.intensity * decay_factor;

    if new_intensity < MOOD_FADE_THRESHOLD {
        if is_negative_mood(&bond.mood.name) {
            if let Some(cause) = bond.mood.cause.clone() {
                let text = format!("Never got closure on: {cause}");
                if !bond.threads.iter().any(|t| t.text == text) {
                    bond.threads.push(Thread {
                        id: Uuid::new_v4().to_string(),
                        text,
                        opened_at: now,
                    });
                    trim_threads(bond);
                }
            }
        }
        bond.mood = neutral_mood(now);
        return true;
    }

    if (new_intensity - bond.mood.intensity).abs() > f64::EPSILON {
        bond.mood.intensity = new_intensity;
        bond.mood.since = now;
        return true;
    }

    false
}

fn neutral_mood(now: DateTime<Utc>) -> Mood {
    Mood {
        name: "neutral".to_string(),
        intensity: 0.0,
        cause: None,
        wants: None,
        since: now,
    }
}

fn apply_missed_you(bond: &mut Bond, now: DateTime<Utc>) -> bool {
    let Some(last) = bond.last_talked_at else {
        return false;
    };
    if !is_neutral_mood(&bond.mood.name) {
        return false;
    }
    if bond.closeness < 0.35 {
        return false;
    }

    let days = (now - last).num_days();
    if days < 5 {
        return false;
    }

    let extra_weeks = ((days - 5) / 7).max(0);
    let intensity = (0.3 + 0.1 * extra_weeks as f64).min(0.6);
    bond.mood = Mood {
        name: "missed you".to_string(),
        intensity,
        cause: Some(format!("you were gone for {days} days")),
        wants: None,
        since: now,
    };
    true
}

fn apply_closeness_drift(bond: &mut Bond, now: DateTime<Utc>) -> bool {
    let Some(last) = bond.last_talked_at else {
        return false;
    };
    let days = (now - last).num_days();
    if days <= 14 {
        return false;
    }
    let drift_days = (days - 14) as f64;
    let new_closeness =
        (bond.closeness - drift_days * CLOSENESS_DRIFT_PER_DAY).max(CLOSENESS_DRIFT_MIN);
    if (new_closeness - bond.closeness).abs() > f64::EPSILON {
        bond.closeness = new_closeness;
        return true;
    }
    false
}

pub(super) fn apply_mood_note(mood: &mut Mood, note: &MoodNote, now: DateTime<Utc>) -> bool {
    let proposed_negative = is_negative_mood(&note.name);
    let current_negative =
        is_negative_mood(&mood.name) && mood.intensity > NO_FORGIVENESS_THRESHOLD;

    if current_negative && !proposed_negative {
        mood.intensity = (mood.intensity - NO_FORGIVENESS_DROP).max(0.0);
        mood.since = now;
        if mood.intensity < MOOD_FADE_THRESHOLD {
            // Thawed all the way: this was addressed, so no "never got closure" thread.
            *mood = neutral_mood(now);
        }
        return true;
    }

    if is_neutral_mood(&note.name) {
        *mood = neutral_mood(now);
        return true;
    }

    let intensity = note.intensity.unwrap_or(0.5).clamp(0.0, 1.0);
    let name_changed = !mood.name.eq_ignore_ascii_case(&note.name);
    mood.name = note.name.clone();
    mood.intensity = intensity;
    mood.cause = note.cause.clone();
    mood.wants = note.wants.clone();
    if name_changed {
        mood.since = now;
    }
    true
}

pub(super) fn apply_thread_notes(bond: &mut Bond, notes: &TurnNotes, now: DateTime<Utc>) {
    for text in &notes.closed_threads {
        let needle = text.to_ascii_lowercase();
        bond.threads
            .retain(|t| !t.text.to_ascii_lowercase().contains(&needle));
    }

    for text in &notes.open_threads {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }
        let needle = trimmed.to_ascii_lowercase();
        if bond.threads.iter().any(|t| {
            let existing = t.text.to_ascii_lowercase();
            existing.contains(&needle)
                || needle.contains(&existing)
                || near_duplicate_tokens(&content_tokens(trimmed), &content_tokens(&t.text))
        }) {
            continue;
        }
        bond.threads.push(Thread {
            id: Uuid::new_v4().to_string(),
            text: trimmed.to_string(),
            opened_at: now,
        });
    }

    trim_threads(bond);
}

fn trim_threads(bond: &mut Bond) {
    if bond.threads.len() <= THREAD_CAP {
        return;
    }
    bond.threads.sort_by(|a, b| a.opened_at.cmp(&b.opened_at));
    let drop = bond.threads.len() - THREAD_CAP;
    bond.threads.drain(0..drop);
}
