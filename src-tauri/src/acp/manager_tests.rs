use super::*;
use agent_client_protocol::schema::v1::{PermissionOption, PermissionOptionKind};
use std::cell::Cell;

#[tokio::test]
async fn dead_channel_retries_the_original_job_once() {
    let (dead, dead_rx) = mpsc::channel(1);
    drop(dead_rx);
    let (live, mut live_rx) = mpsc::channel(1);
    let calls = Cell::new(0);
    let invalidations = Cell::new(0);
    send_with_retry(
        "original prompt",
        || {
            calls.set(calls.get() + 1);
            Ok(if calls.get() == 1 {
                dead.clone()
            } else {
                live.clone()
            })
        },
        || invalidations.set(invalidations.get() + 1),
    )
    .await
    .unwrap();
    assert_eq!(live_rx.recv().await, Some("original prompt"));
    assert!(live_rx.try_recv().is_err());
    assert_eq!(calls.get(), 2);
    assert_eq!(invalidations.get(), 1);
}

#[tokio::test]
async fn repeated_channel_failure_stops_after_two_attempts() {
    let (tx, rx) = mpsc::channel(1);
    drop(rx);
    let calls = Cell::new(0);
    let result = send_with_retry(
        42,
        || {
            calls.set(calls.get() + 1);
            Ok(tx.clone())
        },
        || {},
    )
    .await;
    assert!(result.unwrap_err().contains("before your message was sent"));
    assert_eq!(calls.get(), 2);
}

#[tokio::test]
async fn accepted_job_is_not_replayed_if_worker_drops_the_result() {
    let (tx, mut rx) = mpsc::channel(1);
    let (result_tx, result_rx) = oneshot::channel::<()>();
    let calls = Cell::new(0);
    send_with_retry(
        result_tx,
        || {
            calls.set(calls.get() + 1);
            Ok(tx.clone())
        },
        || panic!("must not retry an accepted turn"),
    )
    .await
    .unwrap();
    drop(rx.recv().await.unwrap());
    assert!(result_rx.await.is_err());
    assert_eq!(calls.get(), 1);
}

#[tokio::test]
async fn connection_setup_failure_is_returned_without_retry() {
    let error = send_with_retry(
        42,
        || Err("CLI missing".into()),
        || panic!("not a dead channel"),
    )
    .await
    .unwrap_err();
    assert_eq!(error, "CLI missing");
}

#[tokio::test]
async fn cancellation_interrupts_a_blocked_session_read() {
    let cancel = CancellationToken::new();
    let child = cancel.clone();
    let read =
        tokio::spawn(
            async move { read_until_cancelled(&child, std::future::pending::<()>()).await },
        );
    tokio::task::yield_now().await;
    cancel.cancel();
    assert_eq!(read.await.unwrap(), None);
}

#[tokio::test]
async fn cancellation_wins_over_a_ready_update() {
    let cancel = CancellationToken::new();
    cancel.cancel();
    assert_eq!(
        read_until_cancelled(&cancel, async { "late update" }).await,
        None
    );
}

#[tokio::test]
async fn live_session_read_preserves_updates_and_errors() {
    let cancel = CancellationToken::new();
    assert_eq!(
        read_until_cancelled(&cancel, async { Ok::<_, &str>("chunk") }).await,
        Some(Ok("chunk"))
    );
    assert_eq!(
        read_until_cancelled(&cancel, async { Err::<(), _>("agent exited") }).await,
        Some(Err("agent exited"))
    );
}

fn options() -> Vec<PermissionOption> {
    vec![
        PermissionOption::new("once", "Allow once", PermissionOptionKind::AllowOnce),
        PermissionOption::new("deny", "Deny", PermissionOptionKind::RejectOnce),
    ]
}

#[tokio::test]
async fn permission_reply_maps_approval_and_denial() {
    let cancel = CancellationToken::new();
    for (approved, expected) in [(true, "once"), (false, "deny")] {
        let (tx, rx) = oneshot::channel();
        tx.send(approved).unwrap();
        let outcome = wait_for_permission(&options(), Some(&cancel), rx).await;
        let RequestPermissionOutcome::Selected(selected) = outcome else {
            panic!("expected explicit choice")
        };
        assert_eq!(selected.option_id.to_string(), expected);
    }
}

#[tokio::test]
async fn permission_is_cancelled_without_an_active_turn_or_responder() {
    let cancel = CancellationToken::new();
    let (tx, rx) = oneshot::channel();
    tx.send(true).unwrap();
    assert!(matches!(
        wait_for_permission(&options(), None, rx).await,
        RequestPermissionOutcome::Cancelled
    ));
    let (tx, rx) = oneshot::channel();
    drop(tx);
    assert!(matches!(
        wait_for_permission(&options(), Some(&cancel), rx).await,
        RequestPermissionOutcome::Cancelled
    ));
}

#[tokio::test]
async fn cancelled_turn_cannot_accept_a_queued_permission() {
    let cancel = CancellationToken::new();
    let (tx, rx) = oneshot::channel();
    tx.send(true).unwrap();
    cancel.cancel();
    assert!(matches!(
        wait_for_permission(&options(), Some(&cancel), rx).await,
        RequestPermissionOutcome::Cancelled
    ));
}

#[tokio::test]
async fn session_reuse_requires_live_channel_matching_agent_and_character() {
    let mut manager = AcpConnectionManager::new();
    let config = AgentConfig::default();
    let (tx, rx) = mpsc::channel(1);
    manager.turn_tx = Some(tx);
    manager.agent_key = Some(agent_config_key(&config));
    manager
        .session_characters
        .lock()
        .unwrap()
        .insert("rika".into());
    assert!(manager.has_live_session("rika", &config));
    assert!(!manager.has_live_session("other", &config));
    let changed = AgentConfig {
        auto_approve_tools: true,
        ..config.clone()
    };
    assert!(!manager.has_live_session("rika", &changed));
    drop(rx);
    assert!(!manager.has_live_session("rika", &config));
}

#[tokio::test]
async fn invalidation_cancels_inflight_turn_and_clears_reusable_sessions() {
    let mut manager = AcpConnectionManager::new();
    let cancel = CancellationToken::new();
    *manager.active_cancel.lock().unwrap() = Some(cancel.clone());
    manager
        .session_characters
        .lock()
        .unwrap()
        .insert("rika".into());
    manager.agent_key = Some("old agent".into());
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    manager.shutdown_tx = Some(shutdown_tx);
    manager.invalidate();
    assert!(cancel.is_cancelled());
    assert!(shutdown_rx.await.is_ok());
    assert!(manager.session_characters.lock().unwrap().is_empty());
    assert!(manager.agent_key.is_none());
    assert!(manager.turn_tx.is_none());
    manager.invalidate(); // Safe to invalidate twice during teardown.
}

#[test]
fn only_successful_turns_keep_their_session_context() {
    for outcome in [
        Ok(TurnOutcome {
            poison_session: false,
        }),
        Ok(TurnOutcome {
            poison_session: true,
        }),
        Err("read failed".into()),
    ] {
        let healthy = outcome.as_ref().is_ok_and(|turn| !turn.poison_session);
        let mut sessions = Some(HashMap::from([
            ("rika".into(), "session-1"),
            ("luna".into(), "session-2"),
        ]));
        let live = Mutex::new(HashSet::from(["rika".into(), "luna".into()]));
        retain_healthy_session(&mut sessions, &live, "rika", &outcome);
        assert_eq!(sessions.as_ref().unwrap().contains_key("rika"), healthy);
        assert_eq!(live.lock().unwrap().contains("rika"), healthy);
        assert_eq!(sessions.as_ref().unwrap().get("luna"), Some(&"session-2"));
        assert!(live.lock().unwrap().contains("luna"));
    }
}
