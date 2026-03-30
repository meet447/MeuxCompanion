use async_trait::async_trait;
use serde_json::json;

use crate::error::{MeuxError, Result};

use super::types::*;
use super::Tool;

pub struct WebSearchTool;

#[async_trait]
impl Tool for WebSearchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_search".to_string(),
            description:
                "Search the internet using DuckDuckGo and return a summary of the top results."
                    .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let query = arguments["query"]
            .as_str()
            .ok_or_else(|| MeuxError::Tool("Missing 'query' argument".to_string()))?;

        // Use DuckDuckGo HTML lite endpoint
        let client = reqwest::Client::new();
        let response = client
            .get("https://html.duckduckgo.com/html/")
            .query(&[("q", query)])
            .header("User-Agent", "MeuxCompanion/1.0")
            .send()
            .await
            .map_err(|e| MeuxError::Tool(format!("Search request failed: {}", e)))?;

        let html = response
            .text()
            .await
            .map_err(|e| MeuxError::Tool(format!("Failed to read response: {}", e)))?;

        let results = parse_ddg_results(&html);

        if results.is_empty() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("No results found for: {}", query),
                success: true,
            });
        }

        let mut output = format!("Search results for: {}\n\n", query);
        for (i, result) in results.iter().enumerate().take(8) {
            output.push_str(&format!(
                "{}. {}\n   {}\n   {}\n\n",
                i + 1,
                result.title,
                result.url,
                result.snippet
            ));
        }

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: output,
            success: true,
        })
    }
}

struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

fn parse_ddg_results(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();

    // Simple extraction from DDG HTML lite results
    // Results are in <a class="result__a" href="...">title</a>
    // Snippets in <a class="result__snippet" ...>text</a>
    for block in html.split("class=\"result__body\"") {
        if results.len() >= 8 {
            break;
        }

        let title = extract_between(block, "class=\"result__a\"", "</a>")
            .map(|s| strip_html_tags(&s))
            .unwrap_or_default();

        let url = extract_between(block, "class=\"result__url\"", "</a>")
            .map(|s| strip_html_tags(&s).trim().to_string())
            .unwrap_or_default();

        let snippet = extract_between(block, "class=\"result__snippet\"", "</a>")
            .map(|s| strip_html_tags(&s))
            .unwrap_or_default();

        if !title.is_empty() {
            results.push(SearchResult {
                title,
                url,
                snippet,
            });
        }
    }

    results
}

fn extract_between(html: &str, start_marker: &str, end_marker: &str) -> Option<String> {
    let start = html.find(start_marker)?;
    let after_marker = &html[start + start_marker.len()..];
    // Skip to after the first '>' following the marker
    let content_start = after_marker.find('>')? + 1;
    let content = &after_marker[content_start..];
    let end = content.find(end_marker)?;
    Some(content[..end].to_string())
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    // Decode common HTML entities
    result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
}
