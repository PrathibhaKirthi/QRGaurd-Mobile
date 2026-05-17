import sys
import threading
import uuid
from datetime import datetime, timezone
from inspect import signature

from flask import Blueprint, Response, current_app, jsonify, request

from advanced_scan_service import cleanup_expired_advanced_scans
from extensions import db
from models import AdvancedScan
from validation import validate_advanced_scan_target


advanced_scan_bp = Blueprint("advanced_scan", __name__)


def _app_module_attr(name, fallback):
    app_module = sys.modules.get("app")
    return getattr(app_module, name, fallback)


def normalize_expo_push_token(value):
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        token = value.get("data") or value.get("token")
        return token.strip() if isinstance(token, str) and token.strip() else None
    return None


@advanced_scan_bp.post("/advanced-scan/start")
def start_advanced_scan():
    # ADVANCED SCAN ENTRY POINT: Create a pending sandbox-analysis job.
    cleanup_expired_advanced_scans()
    data = request.get_json(silent=True) or {}
    static_result = data.get("static_result") or {}
    qr_text = (data.get("qr_text") or static_result.get("qr_text") or data.get("url") or "").strip()
    target_url = (
        data.get("target_url")
        or data.get("url")
        or static_result.get("qr_text")
        or qr_text
    )
    target_url = (target_url or "").strip()

    # SAFETY CHECK: Do not allow private/local/reserved network targets.
    validator = _app_module_attr("validate_advanced_scan_target", validate_advanced_scan_target)
    validation_error = validator(target_url)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    scan_id = str(uuid.uuid4())
    scan_record = AdvancedScan(
        scan_id=scan_id,
        qr_text=qr_text or target_url,
        target_url=target_url,
        static_result_json=static_result or None,
        expo_push_token=normalize_expo_push_token(data.get("expo_push_token")),
    )
    db.session.add(scan_record)
    db.session.commit()

    flask_app = current_app._get_current_object()
    job = _app_module_attr("run_advanced_scan_job", None)
    if job is None:
        from advanced_scan_service import run_advanced_scan_job as job

    # BACKGROUND WORKER: Return quickly while the sandbox scan runs asynchronously.
    if len(signature(job).parameters) == 1:
        worker = threading.Thread(target=job, args=(scan_id,), daemon=True)
    else:
        worker = threading.Thread(target=job, args=(scan_id, flask_app), daemon=True)
    worker.start()

    return jsonify({"scan": scan_record.to_dict(include_screenshot=False)}), 202


@advanced_scan_bp.get("/advanced-scan/<scan_id>")
def get_advanced_scan(scan_id):
    # POLLING ENDPOINT: Mobile app calls this until the Advanced Scan completes.
    cleanup_expired_advanced_scans()
    scan_record = AdvancedScan.query.filter_by(scan_id=scan_id).first()
    if not scan_record:
        return jsonify({"error": "Advanced scan not found or expired."}), 404

    return jsonify({"scan": scan_record.to_dict()})


@advanced_scan_bp.get("/advanced-scan/<scan_id>/screenshot")
def get_advanced_scan_screenshot(scan_id):
    # SCREENSHOT ENDPOINT: Serve the browser screenshot captured by the sandbox.
    cleanup_expired_advanced_scans()
    scan_record = AdvancedScan.query.filter_by(scan_id=scan_id).first()
    if not scan_record or not scan_record.screenshot_blob:
        return jsonify({"error": "Screenshot not found or expired."}), 404

    return Response(scan_record.screenshot_blob, mimetype=scan_record.screenshot_mime or "image/png")


@advanced_scan_bp.post("/advanced-scan/<scan_id>/viewed")
def mark_advanced_scan_viewed(scan_id):
    cleanup_expired_advanced_scans()
    scan_record = AdvancedScan.query.filter_by(scan_id=scan_id).first()
    if not scan_record:
        return jsonify({"error": "Advanced scan not found or expired."}), 404

    scan_record.viewed_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({"scan": scan_record.to_dict()})
