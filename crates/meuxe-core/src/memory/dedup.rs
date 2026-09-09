//! Fact normalization, similarity, classification, and bounded upserts.
use super::types::{Fact, FactKind, FactSource};
use chrono::{DateTime, Utc};
use regex::Regex;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

pub(super) const FACT_CAP: usize = 300;

pub(super) fn upsert_fact(
    facts: &mut Vec<Fact>,
    text: &str,
    source: FactSource,
    now: DateTime<Utc>,
) -> Fact {
    let norm = normalize_fact_text(text);
    let tokens = content_tokens(text);

    let matching: Vec<usize> = facts
        .iter()
        .enumerate()
        .filter(|(_, f)| {
            normalize_fact_text(&f.text) == norm
                || near_duplicate_tokens(&tokens, &content_tokens(&f.text))
        })
        .map(|(i, _)| i)
        .collect();

    if let Some(&primary_idx) = matching.first() {
        let mut best_text = facts[primary_idx].text.clone();
        let mut best_token_count = token_count(&content_tokens(&best_text));
        let mut total_mentions = 0_u32;

        for &idx in &matching {
            total_mentions = total_mentions.saturating_add(facts[idx].mentions);
            let candidate = &facts[idx].text;
            let candidate_tokens = token_count(&content_tokens(candidate));
            if candidate_tokens > best_token_count
                || (candidate_tokens == best_token_count && candidate.len() > best_text.len())
            {
                best_text = candidate.clone();
                best_token_count = candidate_tokens;
            }
        }

        let new_tokens = token_count(&content_tokens(text));
        if new_tokens > best_token_count
            || (new_tokens == best_token_count && text.len() > best_text.len())
        {
            best_text = text.to_string();
        }

        let primary_id = facts[primary_idx].id.clone();
        facts[primary_idx].text = best_text.clone();
        facts[primary_idx].kind = infer_fact_kind(&best_text);
        facts[primary_idx].confirmed_at = now;
        facts[primary_idx].mentions = total_mentions.saturating_add(1);

        let merged_tokens = content_tokens(&best_text);
        facts.retain(|f| {
            f.id == primary_id || !near_duplicate_tokens(&merged_tokens, &content_tokens(&f.text))
        });

        return facts
            .iter()
            .find(|f| f.id == primary_id)
            .cloned()
            .expect("merged fact must exist");
    }

    let fact = Fact {
        id: Uuid::new_v4().to_string(),
        text: text.to_string(),
        kind: infer_fact_kind(text),
        created_at: now,
        confirmed_at: now,
        mentions: 1,
        source,
    };
    facts.push(fact.clone());
    enforce_fact_cap(facts);
    fact
}

pub(super) fn enforce_fact_cap(facts: &mut Vec<Fact>) {
    while facts.len() > FACT_CAP {
        let idx = facts
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| {
                a.mentions
                    .cmp(&b.mentions)
                    .then_with(|| a.confirmed_at.cmp(&b.confirmed_at))
            })
            .map(|(i, _)| i)
            .unwrap_or(0);
        facts.remove(idx);
    }
}

fn normalize_fact_text(text: &str) -> String {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"[^a-z0-9 ]+").expect("invalid regex"));
    let lower = text.to_ascii_lowercase();
    let stripped = re.replace_all(&lower, " ");
    collapse_whitespace(&stripped)
}

fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

const FACT_STOPWORDS: &[&str] = &[
    "a", "an", "the", "is", "are", "was", "be", "of", "and", "who", "that", "their", "they",
    "them", "has", "have", "had", "named", "called", "name", "user", "meet",
];

fn strip_leading_filler(text: &str) -> &str {
    let mut rest = text.trim_start();
    for prefix in ["the user ", "their "] {
        if rest.starts_with(prefix) {
            rest = &rest[prefix.len()..];
        }
    }
    rest
}

pub(super) fn content_tokens(text: &str) -> HashMap<String, u32> {
    let normalized = normalize_fact_text(strip_leading_filler(text));
    let mut counts = HashMap::new();
    for token in normalized.split_whitespace() {
        if FACT_STOPWORDS.contains(&token) {
            continue;
        }
        *counts.entry(token.to_string()).or_insert(0) += 1;
    }
    counts
}

fn token_count(tokens: &HashMap<String, u32>) -> u32 {
    tokens.values().sum()
}

pub(super) fn near_duplicate_tokens(a: &HashMap<String, u32>, b: &HashMap<String, u32>) -> bool {
    if a.is_empty() && b.is_empty() {
        return true;
    }
    let intersection = bag_intersection(a, b);
    if intersection >= 2 {
        let min_len = token_count(a).min(token_count(b));
        if min_len > 0 && intersection as f64 / min_len as f64 >= 0.75 {
            return true;
        }
    }
    bag_jaccard(a, b) >= 0.55
}

fn bag_intersection(a: &HashMap<String, u32>, b: &HashMap<String, u32>) -> u32 {
    a.iter()
        .filter_map(|(token, count_a)| b.get(token).map(|count_b| (*count_a).min(*count_b)))
        .sum()
}

fn bag_jaccard(a: &HashMap<String, u32>, b: &HashMap<String, u32>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let intersection = bag_intersection(a, b);
    let union = bag_union(a, b);
    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

fn bag_union(a: &HashMap<String, u32>, b: &HashMap<String, u32>) -> u32 {
    let keys: HashSet<&String> = a.keys().chain(b.keys()).collect();
    keys.into_iter()
        .map(|key| {
            a.get(key)
                .copied()
                .unwrap_or(0)
                .max(b.get(key).copied().unwrap_or(0))
        })
        .sum()
}

pub(super) fn infer_fact_kind(text: &str) -> FactKind {
    let lower = text.to_ascii_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| lower.contains(w));

    if has(&["name", "called", "years old", "birthday", "live in", "from"]) {
        FactKind::Identity
    } else if has(&[
        "partner",
        "wife",
        "husband",
        "girlfriend",
        "boyfriend",
        "mom",
        "dad",
        "mother",
        "father",
        "sister",
        "brother",
        "friend",
        "son",
        "daughter",
        "dog",
        "cat",
        "pet",
    ]) {
        FactKind::People
    } else if has(&[
        "likes",
        "loves",
        "hates",
        "prefers",
        "favorite",
        "favourite",
        "enjoys",
        "dislikes",
    ]) {
        FactKind::Preference
    } else if has(&[
        "works", "job", "studies", "student", "company", "project", "building", "career", "boss",
        "school",
    ]) {
        FactKind::Work
    } else if has(&["moved", "health", "sleep", "gym", "routine", "lives"]) {
        FactKind::Life
    } else if has(&[
        "don't",
        "doesn't want",
        "never",
        "uncomfortable",
        "boundary",
    ]) {
        FactKind::Boundary
    } else {
        FactKind::Other
    }
}
