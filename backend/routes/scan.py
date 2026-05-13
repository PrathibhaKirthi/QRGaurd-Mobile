from flask import Blueprint, jsonify, request

from scan_service import (
    apply_report_intelligence,
    build_scan_result,
    get_report_intelligence,
    record_bad_qr_match,
)


scan_bp = Blueprint("scan", __name__)


@scan_bp.post("/scan")
def scan():
    data = request.get_json(silent=True) or {}
    qr_text = (data.get("url") or data.get("content") or "").strip()

    if not qr_text:
        return jsonify({"error": "No QR content provided"}), 400

    scan_result = build_scan_result(qr_text)
    initial_status = scan_result.get("final", {}).get("status")
    apply_report_intelligence(scan_result, get_report_intelligence(qr_text))
    if initial_status == "Unsafe":
        record_bad_qr_match(qr_text, scan_result, destination_url=qr_text)
        apply_report_intelligence(scan_result, get_report_intelligence(qr_text))

    return jsonify(scan_result)
