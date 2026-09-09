//! Discover model choices from the agent itself, supporting config options and
//! the older session model API. No provider-specific model catalog is hardcoded.
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use agent_client_protocol::schema::v1::{
    InitializeRequest, RequestPermissionOutcome, RequestPermissionRequest,
    RequestPermissionResponse,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{
    Agent, Client, ConnectionTo, Dispatch, HandleDispatchFrom, Handled, UntypedMessage,
};
use meuxe_core::config::AgentConfig;
use serde::Serialize;
use serde_json::{json, Value};

use super::run::{companion_home_dir, ensure_companion_home, resolve_acp_agent};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AgentModel {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub group: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct AgentModels {
    pub models: Vec<AgentModel>,
    pub current_model: Option<String>,
    pub supported: bool,
    #[serde(skip)]
    config_id: Option<String>,
}

impl AgentModels {
    pub fn from_session(response: &Value) -> Self {
        // Config options are preferred when both protocol forms are present.
        if let Some(option) = response
            .get("configOptions")
            .and_then(Value::as_array)
            .and_then(|options| {
                options.iter().find(|option| {
                    option["type"] == "select"
                        && (option["category"] == "model" || option["id"] == "model")
                })
            })
        {
            if let Some(config_id) = option["id"].as_str() {
                let mut models = Vec::new();
                if let Some(options) = option["options"].as_array() {
                    for choice in options {
                        if let Some(group) = choice["options"].as_array() {
                            for entry in group {
                                push_model(&mut models, entry, "value", choice["name"].as_str());
                            }
                        } else {
                            push_model(&mut models, choice, "value", None);
                        }
                    }
                }
                dedup_models(&mut models);
                return Self {
                    models,
                    current_model: option["currentValue"].as_str().map(str::to_owned),
                    supported: true,
                    config_id: Some(config_id.into()),
                };
            }
        }
        let state = &response["models"];
        if let Some(available) = state["availableModels"].as_array() {
            let mut models = Vec::new();
            for model in available {
                push_model(&mut models, model, "modelId", None);
            }
            dedup_models(&mut models);
            return Self {
                models,
                current_model: state["currentModelId"].as_str().map(str::to_owned),
                supported: true,
                config_id: None,
            };
        }
        Self::default()
    }

    fn selection_request(
        &self,
        session_id: &str,
        model: &str,
    ) -> Result<Option<UntypedMessage>, String> {
        if model.is_empty() {
            return Ok(None);
        }
        if !self.models.iter().any(|available| available.id == model) {
            return Err(format!("The selected model '{model}' is not available from this agent. Choose a model in Settings → Agent."));
        }
        let (method, params) = match &self.config_id {
            Some(id) => (
                "session/set_config_option",
                json!({ "sessionId": session_id, "configId": id, "value": model }),
            ),
            None => (
                "session/set_model",
                json!({ "sessionId": session_id, "modelId": model }),
            ),
        };
        UntypedMessage::new(method, params)
            .map(Some)
            .map_err(|err| err.to_string())
    }
}

fn push_model(models: &mut Vec<AgentModel>, value: &Value, id_field: &str, group: Option<&str>) {
    if let Some(id) = value[id_field].as_str().filter(|id| !id.is_empty()) {
        models.push(AgentModel {
            id: id.into(),
            name: value["name"].as_str().unwrap_or(id).into(),
            description: value["description"].as_str().map(str::to_owned),
            group: group.map(str::to_owned),
        });
    }
}

fn dedup_models(models: &mut Vec<AgentModel>) {
    let mut seen = HashSet::new();
    models.retain(|model| seen.insert(model.id.clone()));
}

/// ACP 2.0's ActiveSession drops configOptions and legacy models. Capture the
/// original session/new response before its typed helper discards those fields.
#[derive(Clone, Default)]
pub(super) struct SessionModelCapture(Arc<Mutex<HashMap<String, AgentModels>>>);

impl SessionModelCapture {
    pub fn take(&self, session_id: &str) -> AgentModels {
        self.0
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(session_id)
            .unwrap_or_default()
    }
}

impl HandleDispatchFrom<Agent> for SessionModelCapture {
    async fn handle_dispatch_from(
        &mut self,
        message: Dispatch,
        _connection: ConnectionTo<Agent>,
    ) -> Result<Handled<Dispatch>, agent_client_protocol::Error> {
        if let Dispatch::Response(Ok(value), router) = &message {
            if router.method() == "session/new" {
                if let Some(id) = value["sessionId"].as_str() {
                    self.0
                        .lock()
                        .unwrap_or_else(|p| p.into_inner())
                        .insert(id.into(), AgentModels::from_session(value));
                }
            }
        }
        Ok(Handled::No {
            message,
            retry: false,
        })
    }

    fn describe_chain(&self) -> impl std::fmt::Debug {
        "session model metadata"
    }
}

pub(super) async fn apply_selected_model(
    connection: &ConnectionTo<Agent>,
    session_id: &str,
    catalog: &AgentModels,
    model: &str,
) -> Result<(), String> {
    if let Some(request) = catalog.selection_request(session_id, model)? {
        tokio::time::timeout(
            Duration::from_secs(30),
            connection.send_request(request).block_task(),
        )
        .await
        .map_err(|_| "The agent timed out while selecting the model.".to_string())?
        .map_err(|err| format!("Could not select model '{model}': {err}"))?;
    }
    Ok(())
}

async fn discover_on_connection(
    connection: ConnectionTo<Agent>,
    cwd: &Path,
    startup_timeout: Duration,
    model_timeout: Duration,
) -> Result<AgentModels, String> {
    tokio::time::timeout(
        startup_timeout,
        connection.send_request(InitializeRequest::new(ProtocolVersion::V1)).block_task(),
    ).await
        .map_err(|_| "The ACP adapter did not start in time. Its first download may be slow. Check your connection, or install the connection adapter in Settings → Agent and retry.".to_string())?
        .map_err(|err| format!("Could not initialize the ACP adapter: {err}"))?;
    let request = UntypedMessage::new("session/new", json!({ "cwd": cwd, "mcpServers": [] }))
        .map_err(|err| err.to_string())?;
    let response = tokio::time::timeout(model_timeout, connection.send_request(request).block_task())
        .await
        .map_err(|_| "The adapter started, but the agent did not return its models in time. Check that the agent is signed in, then refresh.".to_string())?
        .map_err(|err| format!("Could not load the agent's models: {err}"))?;
    Ok(AgentModels::from_session(&response))
}

pub async fn discover_models(config: &AgentConfig, data_dir: &Path) -> Result<AgentModels, String> {
    let agent = tokio::time::timeout(Duration::from_secs(15), resolve_acp_agent(config, data_dir))
        .await.map_err(|_| "Checking the agent installation timed out. Check Node.js and the agent command in Settings → Agent.".to_string())??;
    let via_npx = agent
        .config()
        .command()
        .file_stem()
        .and_then(|name| name.to_str())
        == Some("npx");
    let startup_timeout = Duration::from_secs(if via_npx { 180 } else { 30 });
    let model_timeout = Duration::from_secs(30);
    ensure_companion_home(data_dir).map_err(|err| err.to_string())?;
    let cwd = companion_home_dir(data_dir);
    let result = Arc::new(Mutex::new(None));
    let result_out = Arc::clone(&result);
    tokio::time::timeout(
        startup_timeout + model_timeout + Duration::from_secs(10),
        Client
            .builder()
            .name("meuxe-model-picker")
            // Discovery never sends a prompt or authorizes an agent tool.
            .on_receive_request(
                async |_request: RequestPermissionRequest, responder, _connection| {
                    responder.respond(RequestPermissionResponse::new(
                        RequestPermissionOutcome::Cancelled,
                    ))?;
                    Ok(())
                },
                agent_client_protocol::on_receive_request!(),
            )
            .connect_with(agent, move |connection: ConnectionTo<Agent>| async move {
                let catalog =
                    discover_on_connection(connection, &cwd, startup_timeout, model_timeout).await;
                *result_out.lock().unwrap_or_else(|p| p.into_inner()) = Some(catalog);
                Ok(())
            }),
    )
    .await
    .map_err(|_| {
        "The ACP connection did not finish in time. Check the agent setup and retry.".to_string()
    })?
    .map_err(|err| format!("Could not connect to the ACP adapter: {err}"))?;
    let catalog = result.lock().unwrap_or_else(|p| p.into_inner()).take();
    catalog.ok_or_else(|| "The agent did not return its model list.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::Channel;

    #[tokio::test]
    async fn discovery_reports_whether_startup_or_model_loading_stalled() {
        for stall_method in ["initialize", "session/new"] {
            let (client_transport, agent_transport) = Channel::duplex();
            let agent = tokio::spawn(async move {
                Agent
                    .builder()
                    .on_receive_request(
                        async move |request: UntypedMessage, responder, _connection| {
                            if request.method == stall_method {
                                tokio::time::sleep(Duration::from_secs(5)).await;
                            }
                            let response = if request.method == "initialize" {
                                json!({"protocolVersion":1, "agentCapabilities":{}})
                            } else {
                                legacy()
                            };
                            responder.respond(response)?;
                            Ok(())
                        },
                        agent_client_protocol::on_receive_request!(),
                    )
                    .connect_to(agent_transport)
                    .await
            });
            Client
                .connect_with(client_transport, move |connection| async move {
                    let error = discover_on_connection(
                        connection,
                        &std::env::temp_dir(),
                        Duration::from_millis(50),
                        Duration::from_millis(50),
                    )
                    .await
                    .unwrap_err();
                    assert!(
                        error.contains(if stall_method == "initialize" {
                            "adapter did not start"
                        } else {
                            "adapter started"
                        }),
                        "{error}"
                    );
                    Ok(())
                })
                .await
                .unwrap();
            agent.abort();
        }
    }

    fn modern() -> Value {
        json!({"sessionId":"session-1", "configOptions":[
            {"id":"mode", "category":"mode", "type":"select", "options":[{"value":"code", "name":"Code"}]},
            {"id":"model-choice", "category":"model", "type":"select", "currentValue":"fast", "options":[
                {"group":"provider", "name":"Provider", "options":[
                    {"value":"fast", "name":"Fast", "description":"Quick replies"},
                    {"value":"deep", "name":"Deep"}
                ]}
            ]}
        ]})
    }

    fn legacy() -> Value {
        json!({"sessionId":"session-1", "models": {
            "currentModelId":"fast", "availableModels":[
                {"modelId":"fast", "name":"Fast"}, {"modelId":"deep", "name":"Deep"}
            ]
        }})
    }

    #[test]
    fn grouped_config_models_keep_ids_names_descriptions_and_group() {
        let models = AgentModels::from_session(&modern());
        assert_eq!(models.models.len(), 2);
        assert_eq!(
            models.models[0],
            AgentModel {
                id: "fast".into(),
                name: "Fast".into(),
                description: Some("Quick replies".into()),
                group: Some("Provider".into())
            }
        );
        assert_eq!(models.current_model.as_deref(), Some("fast"));
        let request = models
            .selection_request("session-2", "deep")
            .unwrap()
            .unwrap();
        assert_eq!(request.method, "session/set_config_option");
        assert_eq!(
            request.params,
            json!({"sessionId":"session-2", "configId":"model-choice", "value":"deep"})
        );
    }

    #[test]
    fn flat_models_support_agents_without_category_and_remove_duplicate_ids() {
        let models = AgentModels::from_session(
            &json!({"configOptions":[{"id":"model", "type":"select", "currentValue":"a", "options":[{"value":"a", "name":"A"}, {"value":"a"}, {"value":"b"}, {"value":""}, {}]}]}),
        );
        assert_eq!(
            models
                .models
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            vec!["a", "b"]
        );
        assert_eq!(models.models[1].name, "b");
    }

    #[test]
    fn legacy_models_select_using_session_set_model() {
        let models = AgentModels::from_session(&legacy());
        let request = models
            .selection_request("session-2", "deep")
            .unwrap()
            .unwrap();
        assert_eq!(request.method, "session/set_model");
        assert_eq!(
            request.params,
            json!({"sessionId":"session-2", "modelId":"deep"})
        );
    }

    #[test]
    fn prefers_config_options_and_never_silently_falls_back_for_missing_model() {
        let mut response = modern();
        response["models"] = legacy()["models"].clone();
        let models = AgentModels::from_session(&response);
        assert!(models.selection_request("s", "missing").is_err());
        assert!(models.selection_request("s", "").unwrap().is_none());
        assert_eq!(
            models
                .selection_request("s", "fast")
                .unwrap()
                .unwrap()
                .method,
            "session/set_config_option"
        );
        let unsupported = AgentModels::from_session(&json!({"sessionId":"s"}));
        assert!(!unsupported.supported);
        assert!(unsupported.selection_request("s", "fast").is_err());
        assert!(unsupported.selection_request("s", "").unwrap().is_none());
    }

    // Exercise the actual SDK helper, response capture and wire request against
    // an in-memory agent, so an SDK upgrade cannot silently drop model metadata.
    #[tokio::test]
    async fn session_helper_captures_and_applies_both_protocol_forms_before_prompt() {
        for response in [modern(), legacy()] {
            let expected_method = if response.get("configOptions").is_some() {
                "session/set_config_option"
            } else {
                "session/set_model"
            };
            let (client_transport, agent_transport) = Channel::duplex();
            let methods = Arc::new(Mutex::new(Vec::<String>::new()));
            let recorded = Arc::clone(&methods);
            let agent = tokio::spawn(async move {
                Agent
                    .builder()
                    .on_receive_request(
                        async move |request: UntypedMessage, responder, _connection| {
                            recorded.lock().unwrap().push(request.method.clone());
                            let result = match request.method.as_str() {
                                "initialize" => {
                                    json!({"protocolVersion":1, "agentCapabilities":{}})
                                }
                                "session/new" => response.clone(),
                                "session/set_config_option" => {
                                    assert_eq!(request.params["value"], "deep");
                                    assert_eq!(request.params["configId"], "model-choice");
                                    json!({"configOptions":[]})
                                }
                                "session/set_model" => {
                                    assert_eq!(request.params["modelId"], "deep");
                                    json!({})
                                }
                                "session/prompt" => json!({"stopReason":"end_turn"}),
                                other => panic!("Unexpected request: {other}"),
                            };
                            responder.respond(result)?;
                            Ok(())
                        },
                        agent_client_protocol::on_receive_request!(),
                    )
                    .connect_to(agent_transport)
                    .await
            });
            let capture = SessionModelCapture::default();
            tokio::time::timeout(
                Duration::from_secs(5),
                Client.builder().with_handler(capture.clone()).connect_with(
                    client_transport,
                    move |connection: ConnectionTo<Agent>| async move {
                        connection
                            .send_request(InitializeRequest::new(ProtocolVersion::V1))
                            .block_task()
                            .await?;
                        let mut session = connection
                            .build_session(std::env::temp_dir())
                            .block_task()
                            .start_session()
                            .await?;
                        let catalog = capture.take(&session.session_id().to_string());
                        assert_eq!(catalog.models.len(), 2);
                        apply_selected_model(
                            &connection,
                            &session.session_id().to_string(),
                            &catalog,
                            "deep",
                        )
                        .await
                        .unwrap();
                        session.send_prompt("Hello")?;
                        session.read_update().await?;
                        Ok(())
                    },
                ),
            )
            .await
            .unwrap()
            .unwrap();
            agent.abort();
            assert_eq!(
                *methods.lock().unwrap(),
                vec![
                    "initialize",
                    "session/new",
                    expected_method,
                    "session/prompt"
                ]
            );
        }
    }
}

#[cfg(test)]
#[tokio::test]
#[ignore = "requires an installed, signed-in ACP agent"]
async fn live_model_discovery_smoke() {
    let data_dir = std::path::PathBuf::from(
        std::env::var("MEUXE_ACP_SMOKE_DATA_DIR").expect("set MEUXE_ACP_SMOKE_DATA_DIR"),
    );
    let config = meuxe_core::config::ConfigManager::new(&data_dir)
        .load()
        .unwrap();
    let catalog = discover_models(&config.agent, &data_dir).await.unwrap();
    println!(
        "Agent: {}, models: {}, current: {:?}",
        config.agent.preset,
        catalog.models.len(),
        catalog.current_model
    );
    assert!(catalog.supported);
    assert!(!catalog.models.is_empty());
}
