from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from auth import require_auth
from extensions import db
from models import ScanHistory


history_bp = Blueprint("history", __name__)


def _number(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_timestamp(value):
    if not value:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


@history_bp.get("/history")
@require_auth
def list_history():
    limit = request.args.get("limit", 100)
    try:
        limit = min(max(int(limit), 1), 200)
    except (TypeError, ValueError):
        limit = 100

    items = (
        ScanHistory.query.filter_by(owner_id=g.current_user.id)
        .order_by(ScanHistory.scanned_at.desc(), ScanHistory.id.desc())
        .limit(limit)
        .all()
    )
    return jsonify({"history": [item.to_dict() for item in items]})


@history_bp.post("/history")
@require_auth
def create_history_item():
    data = request.get_json(silent=True) or {}
    content = (data.get("url") or data.get("content") or data.get("qr_text") or "").strip()
    if not content:
        return jsonify({"error": "Scan content is required."}), 400

    result = data.get("result") if isinstance(data.get("result"), dict) else None
    final = (result or {}).get("final") if isinstance((result or {}).get("final"), dict) else {}
    advanced_scan = data.get("advanced_scan") if isinstance(data.get("advanced_scan"), dict) else None

    verdict = data.get("verdict") or data.get("status") or final.get("status") or "Unknown"
    history_item = ScanHistory(
        owner_id=g.current_user.id,
        content=content,
        scan_type=(data.get("scan_type") or "url").strip()[:40],
        verdict=str(verdict)[:50],
        risk_score=_number(data.get("risk_score", final.get("risk_score"))),
        confidence=_number(data.get("confidence", final.get("confidence"))),
        explanation_summary=(data.get("explanation_summary") or ((result or {}).get("explanation") or {}).get("summary") or ""),
        result_json=result,
        advanced_scan_json=advanced_scan,
        scanned_at=_parse_timestamp(data.get("timestamp") or data.get("scanned_at")),
    )
    db.session.add(history_item)
    db.session.commit()

    return jsonify({"history_item": history_item.to_dict()}), 201


@history_bp.delete("/history")
@require_auth
def clear_history():
    ScanHistory.query.filter_by(owner_id=g.current_user.id).delete()
    db.session.commit()
    return jsonify({"ok": True})
