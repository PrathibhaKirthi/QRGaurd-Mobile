from flask import Blueprint, jsonify, request

from extensions import db
from models import SuspiciousQRReport
from validation import normalize_report_payload


reports_bp = Blueprint("reports", __name__)


@reports_bp.post("/reports")
def create_suspicious_qr_report():
    # USER REPORT ENTRY POINT
    payload, validation_error = normalize_report_payload(request.get_json(silent=True) or {})
    if validation_error:
        return jsonify({"error": validation_error}), 400

    report = SuspiciousQRReport(**payload)
    db.session.add(report)
    db.session.commit()

    return jsonify({"report": report.to_dict()}), 201


@reports_bp.get("/reports/recent")
def recent_suspicious_qr_reports():
    # REVIEW ENDPOINT
    limit = request.args.get("limit", 25)
    try:
        limit = min(max(int(limit), 1), 100)
    except (TypeError, ValueError):
        limit = 25

    reports = SuspiciousQRReport.query.order_by(SuspiciousQRReport.created_at.desc()).limit(limit).all()
    return jsonify({"reports": [report.to_dict() for report in reports]})
