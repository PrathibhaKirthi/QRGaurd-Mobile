import sys
from json import JSONDecodeError, loads
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from sqlalchemy import or_

from config import (
    COMMUNITY_REPORTS_UNSAFE_THRESHOLD,
    GOOGLE_WEB_RISK_API_KEY,
    GOOGLE_WEB_RISK_THREAT_TYPES,
    GOOGLE_WEB_RISK_TIMEOUT_SECONDS,
)
from extensions import db
from model.attack_classifier import classify_attack_type
from model.feature_extractor import extract_features, features_to_vector
from model.fusion_model import fuse_two_scores_to_label
from model.url_rules_model import rules_predict_safe_unsafe
from model.xai_explainer import explain
from models import SuspiciousQRReport


AUTO_UNSAFE_REASON = "auto_unsafe"


def classify_score(score: float) -> str:
    if score < 0.4:
        return "Safe"
    if score < 0.7:
        return "Suspicious"
    return "Unsafe"


def check_google_web_risk(url):
    if not GOOGLE_WEB_RISK_API_KEY:
        return {
            "provider": "Google Web Risk",
            "configured": False,
            "checked": False,
            "matched": False,
            "threat_types": [],
            "error": None,
        }

    query = urlencode(
        {
            "uri": url,
            "key": GOOGLE_WEB_RISK_API_KEY,
            "threatTypes": GOOGLE_WEB_RISK_THREAT_TYPES,
        },
        doseq=True,
    )
    lookup_url = f"https://webrisk.googleapis.com/v1/uris:search?{query}"

    try:
        with urlopen(lookup_url, timeout=GOOGLE_WEB_RISK_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
            data = loads(body) if body else {}
    except HTTPError as error:
        return {
            "provider": "Google Web Risk",
            "configured": True,
            "checked": False,
            "matched": False,
            "threat_types": [],
            "error": f"HTTP {error.code}",
        }
    except (URLError, TimeoutError, JSONDecodeError, ValueError):
        return {
            "provider": "Google Web Risk",
            "configured": True,
            "checked": False,
            "matched": False,
            "threat_types": [],
            "error": "Lookup unavailable",
        }

    threat = data.get("threat") or {}
    threat_types = threat.get("threatTypes") or []

    return {
        "provider": "Google Web Risk",
        "configured": True,
        "checked": True,
        "matched": bool(threat_types),
        "threat_types": threat_types,
        "error": None,
    }


def _google_web_risk_checker():
    app_module = sys.modules.get("app")
    return getattr(app_module, "check_google_web_risk", check_google_web_risk)


def build_scan_result(qr_text):
    features = extract_features(qr_text)
    vec = features_to_vector(features)

    rules_status, rules_conf, rules_risk = rules_predict_safe_unsafe(vec, qr_text)

    final_score = rules_risk / 100 if rules_risk > 1 else rules_risk
    final_conf = rules_conf
    google_web_risk = _google_web_risk_checker()(qr_text)

    attack = classify_attack_type(features, qr_text)
    attack_risk = 0
    if attack["type"] != "Legitimate":
        if attack["severity"] == "high":
            attack_risk = 0.9
        elif attack["severity"] == "medium":
            attack_risk = 0.55
        else:
            attack_risk = 0.25

    final_status, final_conf, final_score = fuse_two_scores_to_label(
        final_score,
        attack_risk,
        0.65,
        0.35,
        "rules_attack_fusion",
    )

    if google_web_risk["matched"]:
        final_score = max(final_score, 0.95)
        final_conf = max(final_conf, 0.95)
        final_status = classify_score(final_score)

    xai = explain(features, final_score, final_status, top_n=4)
    if attack["severity"] in {"high", "medium"} and attack["type"] != "Legitimate":
        xai["reasons"].insert(0, f"Detected {attack['type'].lower()} pattern.")
        if attack["severity"] == "high":
            xai["summary"] = f"{attack['type']} indicators were found. {xai['summary']}"
    if google_web_risk["matched"]:
        threat_list = ", ".join(google_web_risk["threat_types"])
        xai["summary"] = (
            f"Google Web Risk matched this URL against known threat intelligence ({threat_list}). "
            f"{xai['summary']}"
        )
        xai["reasons"].insert(0, f"Matched Google Web Risk threat list: {threat_list}.")

    return {
        "qr_text": qr_text,
        "final": {
            "method": "rules_attack_fusion_with_web_risk",
            "status": final_status,
            "confidence": round(final_conf * 100, 2),
            "risk_score": round(final_score * 100, 2),
        },
        "external_threat_intelligence": {
            "google_web_risk": google_web_risk,
        },
        "attack": {
            "type": attack["type"],
            "severity": attack["severity"],
            "risk_score": round(attack_risk * 100, 2),
        },
        "rules_based": {
            "status": rules_status,
            "confidence": round(rules_conf * 100, 2),
            "risk_score": round(rules_risk * 100, 2),
            "features": features,
        },
        "explanation": {
            "summary": xai["summary"],
            "reasons": xai["reasons"],
            "feature_contributions": xai["feature_contributions"],
        },
    }


def get_report_intelligence(*qr_values):
    values = [value.strip() for value in qr_values if value and value.strip()]
    unique_values = list(dict.fromkeys(values))
    if not unique_values:
        return {
            "matched": False,
            "report_count": 0,
            "reasons": [],
            "auto_marked_bad": False,
            "latest_reported_at": None,
            "warning": None,
        }

    reports = (
        SuspiciousQRReport.query.filter(
            or_(
                SuspiciousQRReport.scanned_content.in_(unique_values),
                SuspiciousQRReport.destination_url.in_(unique_values),
            )
        )
        .order_by(SuspiciousQRReport.created_at.desc())
        .all()
    )

    if not reports:
        return {
            "matched": False,
            "report_count": 0,
            "reasons": [],
            "auto_marked_bad": False,
            "latest_reported_at": None,
            "warning": None,
        }

    reasons = sorted({report.reason for report in reports})
    auto_marked_bad = AUTO_UNSAFE_REASON in reasons
    return {
        "matched": True,
        "report_count": len(reports),
        "reasons": reasons,
        "auto_marked_bad": auto_marked_bad,
        "latest_reported_at": reports[0].created_at.isoformat(),
        "warning": (
            "This QR is stored in the shared suspicious QR database and has been marked bad."
            if auto_marked_bad
            else "This QR has been reported by users as suspicious."
        ),
    }


def apply_report_intelligence(scan_result, report_intelligence):
    scan_result["community_reports"] = report_intelligence
    if not report_intelligence["matched"]:
        return scan_result

    final = scan_result.setdefault("final", {})
    auto_marked_bad = bool(report_intelligence.get("auto_marked_bad"))
    if auto_marked_bad or report_intelligence["report_count"] >= COMMUNITY_REPORTS_UNSAFE_THRESHOLD:
        final["status"] = "Unsafe"
        final["confidence"] = max(float(final.get("confidence") or 0), 95)
        final["risk_score"] = max(float(final.get("risk_score") or 0), 95)
    else:
        final["status"] = "Suspicious" if final.get("status") == "Safe" else final.get("status", "Suspicious")
        final["confidence"] = max(float(final.get("confidence") or 0), 75)
        final["risk_score"] = max(float(final.get("risk_score") or 0), 55)

    explanation = scan_result.setdefault("explanation", {})
    reasons = explanation.setdefault("reasons", [])
    reason_list = ", ".join(report_intelligence["reasons"])
    if auto_marked_bad:
        report_reason = f"{report_intelligence['report_count']} stored bad QR record(s) exist for this QR ({reason_list})."
    else:
        report_reason = f"{report_intelligence['report_count']} user report(s) exist for this QR ({reason_list})."
    if report_reason not in reasons:
        reasons.insert(0, report_reason)

    existing_summary = explanation.get("summary") or ""
    if auto_marked_bad:
        report_summary = "This QR is stored in the shared suspicious QR database and has been marked bad."
    elif report_intelligence["report_count"] >= COMMUNITY_REPORTS_UNSAFE_THRESHOLD:
        report_summary = "This QR has multiple reports in the shared suspicious QR database."
    else:
        report_summary = "This QR has one community report, so it has been marked suspicious for review."
    explanation["summary"] = f"{report_summary} {existing_summary}".strip()
    return scan_result


def record_bad_qr_match(qr_text, scan_result=None, destination_url=None):
    content = (qr_text or "").strip()
    if not content:
        return None

    existing_report = SuspiciousQRReport.query.filter_by(
        scanned_content=content,
        reason=AUTO_UNSAFE_REASON,
    ).first()
    if existing_report:
        return existing_report

    final = (scan_result or {}).get("final") if isinstance(scan_result, dict) else {}
    report = SuspiciousQRReport(
        scanned_content=content,
        destination_url=(destination_url or content).strip() or None,
        reason=AUTO_UNSAFE_REASON,
        note="Automatically stored after QRGuard classified this QR code as unsafe.",
        verdict=str(final.get("status") or "Unsafe")[:50],
        risk_score=final.get("risk_score"),
        confidence=final.get("confidence"),
    )
    db.session.add(report)
    db.session.commit()
    return report
