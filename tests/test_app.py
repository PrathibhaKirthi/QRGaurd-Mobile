def test_ping_returns_success(client):
    response = client.get("/ping")

    assert response.status_code == 200
    assert response.get_data(as_text=True) == "OK"


def test_scan_accepts_valid_url_and_returns_json(client):
    response = client.post("/scan", json={"url": "https://example.com"})

    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    assert data["qr_text"] == "https://example.com"
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
        json={"url": "https://paypal-security-check.example.com/login/verify"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["final"]["status"] == "Unsafe"
    assert data["final"]["risk_score"] >= 85
    assert data["attack"]["type"] in {"Brand Impersonation", "Credential Harvesting"}


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
    url = "https://example.com/safe-looking-page"
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
