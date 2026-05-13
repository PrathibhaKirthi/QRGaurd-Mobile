def test_ping_returns_success(client):
    response = client.get("/ping")

    assert response.status_code == 200
    assert response.get_data(as_text=True) == "OK"


def test_scan_accepts_valid_url_and_returns_json(client):
    response = client.post("/scan", json={"url": "https://www.google.com"})

    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    assert data["qr_text"] == "https://www.google.com"
    assert "final" in data
    assert "rules_based" in data
    assert "explanation" in data
    assert data["final"]["status"] in {"Safe", "Suspicious", "Unsafe"}


def test_scan_rejects_missing_url_input(client):
    response = client.post("/scan", json={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "No QR content provided"


def test_scan_rejects_empty_url_input(client):
    response = client.post("/scan", json={"url": "   "})

    assert response.status_code == 400
    assert response.get_json()["error"] == "No QR content provided"


def test_scan_handles_malformed_url_as_json(client):
    response = client.post("/scan", json={"url": "not a url"})

    assert response.status_code == 200
    assert response.is_json
    assert response.get_json()["qr_text"] == "not a url"


def test_scan_flags_paypal_phishing_lookalike(client):
    response = client.post(
        "/scan",
        json={"url": "https://paypal-security-check.com/login/verify"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["final"]["status"] == "Unsafe"
    assert data["final"]["risk_score"] >= 85
    assert data["attack"]["type"] in {"Brand Impersonation", "Credential Harvesting"}


def test_unsafe_scan_is_stored_as_bad_qr_and_matched_again(client):
    import app as flask_app

    url = "https://paypal-security-check.com/login/verify"

    first_response = client.post("/scan", json={"url": url})
    first_data = first_response.get_json()

    assert first_response.status_code == 200
    assert first_data["final"]["status"] == "Unsafe"
    assert first_data["community_reports"]["matched"] is True
    assert first_data["community_reports"]["auto_marked_bad"] is True

    second_response = client.post("/scan", json={"url": url})
    second_data = second_response.get_json()

    assert second_response.status_code == 200
    assert second_data["final"]["status"] == "Unsafe"
    assert second_data["community_reports"]["matched"] is True
    assert second_data["community_reports"]["report_count"] == 1
    assert "stored in the shared suspicious QR database" in second_data["explanation"]["summary"]

    with flask_app.app.app_context():
        reports = flask_app.SuspiciousQRReport.query.filter_by(
            scanned_content=url,
            reason="auto_unsafe",
        ).all()

    assert len(reports) == 1


def test_scan_does_not_flag_real_paypal_domain_as_impersonation(client):
    response = client.post("/scan", json={"url": "https://www.paypal.com/signin"})

    assert response.status_code == 200
    data = response.get_json()
    assert data["final"]["status"] == "Safe"
    assert data["attack"]["type"] == "Legitimate"


def test_scan_does_not_flag_real_google_domain_as_impersonation(client):
    response = client.post("/scan", json={"url": "https://www.google.com/search?q=test"})

    assert response.status_code == 200
    data = response.get_json()
    assert data["final"]["status"] == "Safe"
    assert data["attack"]["type"] == "Legitimate"


def test_single_community_report_marks_scan_suspicious_not_unsafe(client):
    url = "https://www.paypal/safe-looking-page"
    report_response = client.post(
        "/reports",
        json={
            "scanned_content": url,
            "destination_url": url,
            "reason": "fake_sticker",
        },
    )

    assert report_response.status_code == 201

    response = client.post("/scan", json={"url": url})
    data = response.get_json()

    assert response.status_code == 200
    assert data["community_reports"]["matched"] is True
    assert data["community_reports"]["report_count"] == 1
    assert data["final"]["status"] == "Suspicious"


def test_two_community_reports_mark_scan_unsafe(client):
    url = "https://www.pay-pal/reported-bad-qr"
    for reason in ("fake_sticker", "phishing"):
        report_response = client.post(
            "/reports",
            json={
                "scanned_content": url,
                "destination_url": url,
                "reason": reason,
            },
        )
        assert report_response.status_code == 201

    response = client.post("/scan", json={"url": url})
    data = response.get_json()

    assert response.status_code == 200
    assert data["community_reports"]["matched"] is True
    assert data["community_reports"]["report_count"] == 2
    assert data["final"]["status"] == "Unsafe"
    assert "shared suspicious QR database" in data["explanation"]["summary"]


def test_authenticated_user_can_store_cloud_scan_history(client):
    auth_response = client.post(
        "/auth/register",
        json={"email": "prathibhakirthi@gmail.com", "password": "pass6789"},
    )
    token = auth_response.get_json()["token"]

    create_response = client.post(
        "/history",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "url": "https://www.google.com",
            "scan_type": "url",
            "status": "Safe",
            "risk_score": 5,
            "confidence": 95,
            "explanation_summary": "Safe test scan.",
        },
    )

    assert create_response.status_code == 201

    list_response = client.get("/history", headers={"Authorization": f"Bearer {token}"})
    data = list_response.get_json()

    assert list_response.status_code == 200
    assert len(data["history"]) == 1
    assert data["history"][0]["url"] == "https://www.google.com"
    assert data["history"][0]["storage_scope"] == "cloud"


def test_cloud_scan_history_requires_login(client):
    response = client.get("/history")

    assert response.status_code == 401
    assert response.get_json()["error"] == "Authentication required."


def test_advanced_scan_start_creates_pending_job(client, monkeypatch):
    import app as flask_app

    monkeypatch.setattr(flask_app, "validate_advanced_scan_target", lambda url: None)
    monkeypatch.setattr(flask_app, "run_advanced_scan_job", lambda scan_id: None)

    response = client.post(
        "/advanced-scan/start",
        json={
            "url": "https://www.google.com/login",
            "qr_text": "https://www.google.com/login",
            "static_result": {"final": {"status": "Unsafe", "risk_score": 90, "confidence": 90}},
        },
    )

    assert response.status_code == 202
    data = response.get_json()
    assert data["scan"]["status"] == "pending"
    assert data["scan"]["target_url"] == "https://www.google.com/login"
    assert data["scan"]["scan_id"]


def test_advanced_scan_start_accepts_frontend_payload_with_expo_token(client, monkeypatch):
    import app as flask_app

    monkeypatch.setattr(flask_app, "validate_advanced_scan_target", lambda url: None)
    monkeypatch.setattr(flask_app, "run_advanced_scan_job", lambda scan_id: None)

    static_response = client.post(
        "/scan",
        json={"url": "https://paypal-security-check.com/login/verify"},
    )
    assert static_response.status_code == 200
    static_result = static_response.get_json()

    response = client.post(
        "/advanced-scan/start",
        json={
            "url": static_result["qr_text"],
            "qr_text": static_result["qr_text"],
            "static_result": static_result,
            "expo_push_token": "ExponentPushToken[test-token]",
        },
    )

    assert response.status_code == 202
    data = response.get_json()
    assert data["scan"]["status"] == "pending"
    assert data["scan"]["static_result"]["final"]["status"] == "Unsafe"


def test_advanced_scan_start_does_not_crash_on_object_expo_token(client, monkeypatch):
    import app as flask_app

    monkeypatch.setattr(flask_app, "validate_advanced_scan_target", lambda url: None)
    monkeypatch.setattr(flask_app, "run_advanced_scan_job", lambda scan_id: None)

    response = client.post(
        "/advanced-scan/start",
        json={
            "url": "https://www.google.com/login",
            "qr_text": "https://www.google.com/login",
            "static_result": {"final": {"status": "Unsafe", "risk_score": 90, "confidence": 90}},
            "expo_push_token": {"data": "ExponentPushToken[test-token]"},
        },
    )

    assert response.status_code == 202


def test_advanced_scan_result_returns_completed_job(client):
    import app as flask_app

    with flask_app.app.app_context():
        scan = flask_app.AdvancedScan(
            scan_id="completed-scan",
            qr_text="https://www.google.com",
            target_url="https://www.google.com",
            status="complete",
            evidence_json={"final_url": "https://www.google.com"},
            llm_result_json={"status": "Safe", "risk_score": 10, "confidence": 80},
        )
        flask_app.db.session.add(scan)
        flask_app.db.session.commit()

    response = client.get("/advanced-scan/completed-scan")

    assert response.status_code == 200
    data = response.get_json()
    assert data["scan"]["status"] == "complete"
    assert data["scan"]["llm_result"]["status"] == "Safe"


def test_advanced_scan_screenshot_route_serves_db_artifact(client):
    import app as flask_app

    with flask_app.app.app_context():
        scan = flask_app.AdvancedScan(
            scan_id="screenshot-scan",
            qr_text="https://www.google.com",
            target_url="https://www.google.com",
            status="complete",
            screenshot_blob=b"fake-png-bytes",
            screenshot_mime="image/png",
        )
        flask_app.db.session.add(scan)
        flask_app.db.session.commit()

    response = client.get("/advanced-scan/screenshot-scan/screenshot")

    assert response.status_code == 200
    assert response.content_type == "image/png"
    assert response.data == b"fake-png-bytes"
