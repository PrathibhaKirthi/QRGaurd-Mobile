from base64 import b64decode
from contextlib import nullcontext
from datetime import datetime, timezone
from json import JSONDecodeError, loads
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from config import (
    ADVANCED_SCAN_TIMEOUT_SECONDS,
    ADVANCED_SCANNER_URL,
    EXPO_PUSH_URL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_TIMEOUT_SECONDS,
)
from extensions import db
from models import AdvancedScan
from scan_service import record_bad_qr_match


def cleanup_expired_advanced_scans():
    now = datetime.now(timezone.utc)
    expired_scans = AdvancedScan.query.filter(AdvancedScan.expires_at <= now).all()
    for scan_record in expired_scans:
        db.session.delete(scan_record)
    if expired_scans:
        db.session.commit()


def jsonify_safe(payload):
    import json

    return json.dumps(payload, ensure_ascii=True)


def post_json(url, payload, timeout_seconds, headers=None):
    body = jsonify_safe(payload).encode("utf-8")
    request_obj = Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            **(headers or {}),
        },
        method="POST",
    )
    with urlopen(request_obj, timeout=timeout_seconds) as response:
        response_body = response.read().decode("utf-8")
        return loads(response_body) if response_body else {}


def call_playwright_scanner(target_url):
    # DYNAMIC EVIDENCE
    return post_json(
        ADVANCED_SCANNER_URL,
        {"url": target_url, "interaction_mode": "safe_common"},
        timeout_seconds=ADVANCED_SCAN_TIMEOUT_SECONDS,
    )


def build_gemini_prompt(evidence):
    evidence_json = jsonify_safe(evidence)
    return (
        "You are QRGuard's advanced QR safety analyst. Classify the URL from structured "
        "browser sandbox evidence only. Return strict JSON with keys: status, risk_score, "
        "confidence, summary, reasons, recommended_action. status must be Safe, Suspicious, "
        "or Unsafe. risk_score and confidence are numbers from 0 to 100. Keep reasons concise.\n\n"
        f"Evidence JSON:\n{evidence_json[:20000]}"
    )


def fallback_dynamic_analysis(evidence, reason):
    # FALLBACK VERDICT
    signals = evidence.get("risk_signals") or []
    form_fields = evidence.get("form_fields") or []
    downloads = evidence.get("downloads") or []
    has_password = any(field.get("type") == "password" for field in form_fields if isinstance(field, dict))
    risk_score = 45
    status = "Suspicious"
    reasons = list(signals[:4])

    if has_password:
        risk_score = max(risk_score, 70)
        reasons.insert(0, "The sandbox detected a password field on the final page.")
    if downloads:
        risk_score = max(risk_score, 75)
        reasons.insert(0, "The page attempted to start a download.")
    if evidence.get("final_url") and evidence.get("original_url") != evidence.get("final_url"):
        risk_score = max(risk_score, 55)
        reasons.append("The page redirected to a different final destination.")

    if risk_score >= 70:
        status = "Unsafe"
    elif risk_score < 40:
        status = "Safe"

    return {
        "provider": "local_fallback",
        "configured": False,
        "status": status,
        "risk_score": risk_score,
        "confidence": 60,
        "summary": f"Gemini analysis was unavailable, so QRGuard used local dynamic evidence. {reason}",
        "reasons": reasons[:5] or ["The page was loaded in the sandbox and no strong dynamic signal was available."],
        "recommended_action": "Avoid entering sensitive information unless you fully trust this destination.",
    }


def call_gemini_analysis(evidence):
    # GEMINI ANALYSIS
    if not GEMINI_API_KEY:
        return fallback_dynamic_analysis(evidence, "No Gemini API key is configured.")

    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": build_gemini_prompt(evidence),
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }

    try:
        data = post_json(
            gemini_url,
            payload,
            timeout_seconds=GEMINI_TIMEOUT_SECONDS,
            headers={"x-goog-api-key": GEMINI_API_KEY},
        )
        text = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        parsed = loads(text) if text else {}
        return {
            "provider": "gemini",
            "model": GEMINI_MODEL,
            "configured": True,
            "status": parsed.get("status", "Suspicious"),
            "risk_score": float(parsed.get("risk_score", 60)),
            "confidence": float(parsed.get("confidence", 70)),
            "summary": parsed.get("summary", "Gemini reviewed the browser sandbox evidence."),
            "reasons": parsed.get("reasons", []),
            "recommended_action": parsed.get(
                "recommended_action",
                "Avoid entering sensitive information unless you fully trust this destination.",
            ),
        }
    except (HTTPError, URLError, TimeoutError, JSONDecodeError, ValueError, KeyError, IndexError) as error:
        return fallback_dynamic_analysis(evidence, f"Gemini request failed: {type(error).__name__}.")


def send_expo_push_notification(expo_push_token, scan_id, llm_result):
    # MOBILE NOTIFICATION
    if not expo_push_token:
        return

    status = (llm_result or {}).get("status", "Ready")
    payload = {
        "to": expo_push_token,
        "title": "Advanced Scan complete",
        "body": f"Dynamic analysis finished with verdict: {status}.",
        "data": {
            "type": "advanced_scan_complete",
            "scan_id": scan_id,
        },
    }

    try:
        post_json(EXPO_PUSH_URL, payload, timeout_seconds=5)
    except (HTTPError, URLError, TimeoutError, JSONDecodeError, ValueError):
        pass


def run_advanced_scan_job(scan_id, flask_app=None):
    # ADVANCED SCAN WORKER
    if flask_app is None:
        app_module = sys.modules.get("app")
        flask_app = getattr(app_module, "app", None)

    context = flask_app.app_context() if flask_app else nullcontext()
    with context:
        scan_record = AdvancedScan.query.filter_by(scan_id=scan_id).first()
        if not scan_record:
            return

        try:
            scanner_result = call_playwright_scanner(scan_record.target_url)
            evidence = scanner_result.get("evidence") or scanner_result
            screenshot_base64 = scanner_result.get("screenshot_base64")
            screenshot_mime = scanner_result.get("screenshot_mime") or "image/png"
            llm_result = call_gemini_analysis(evidence)

            scan_record.status = "complete"
            scan_record.evidence_json = evidence
            scan_record.llm_result_json = llm_result
            scan_record.completed_at = datetime.now(timezone.utc)
            if screenshot_base64:
                scan_record.screenshot_blob = b64decode(screenshot_base64)
                scan_record.screenshot_mime = screenshot_mime
            db.session.commit()
            if llm_result.get("status") == "Unsafe":
                record_bad_qr_match(
                    scan_record.qr_text,
                    {"final": llm_result},
                    destination_url=evidence.get("final_url") or scan_record.target_url,
                )
            send_expo_push_notification(scan_record.expo_push_token, scan_record.scan_id, llm_result)
        except Exception as error:
            scan_record.status = "failed"
            scan_record.error = f"{type(error).__name__}: {error}"
            scan_record.completed_at = datetime.now(timezone.utc)
            db.session.commit()
