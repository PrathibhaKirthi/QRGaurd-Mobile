from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from config import ADVANCED_SCAN_EXPIRY_HOURS
from extensions import db


class SuspiciousQRReport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    scanned_content = db.Column(db.Text, nullable=False)
    destination_url = db.Column(db.Text, nullable=True)
    reason = db.Column(db.String(50), nullable=False)
    note = db.Column(db.Text, nullable=True)
    location_label = db.Column(db.String(255), nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    verdict = db.Column(db.String(50), nullable=True)
    risk_score = db.Column(db.Float, nullable=True)
    confidence = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "scanned_content": self.scanned_content,
            "destination_url": self.destination_url,
            "reason": self.reason,
            "note": self.note or "",
            "location_label": self.location_label or "",
            "latitude": self.latitude,
            "longitude": self.longitude,
            "verdict": self.verdict,
            "risk_score": self.risk_score,
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat(),
        }


class AdvancedScan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    scan_id = db.Column(db.String(36), unique=True, nullable=False, index=True)
    qr_text = db.Column(db.Text, nullable=False)
    target_url = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    static_result_json = db.Column(db.JSON, nullable=True)
    evidence_json = db.Column(db.JSON, nullable=True)
    llm_result_json = db.Column(db.JSON, nullable=True)
    error = db.Column(db.Text, nullable=True)
    screenshot_blob = db.Column(db.LargeBinary, nullable=True)
    screenshot_mime = db.Column(db.String(80), nullable=True)
    expo_push_token = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    viewed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    expires_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc) + timedelta(hours=ADVANCED_SCAN_EXPIRY_HOURS),
        nullable=False,
        index=True,
    )

    def to_dict(self, include_screenshot=True):
        screenshot_url = None
        if include_screenshot and self.screenshot_blob:
            screenshot_url = f"{get_public_base_url()}/advanced-scan/{self.scan_id}/screenshot"

        return {
            "scan_id": self.scan_id,
            "status": self.status,
            "qr_text": self.qr_text,
            "target_url": self.target_url,
            "static_result": self.static_result_json,
            "evidence": self.evidence_json,
            "llm_result": self.llm_result_json,
            "error": self.error,
            "screenshot_url": screenshot_url,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "viewed_at": self.viewed_at.isoformat() if self.viewed_at else None,
            "expires_at": self.expires_at.isoformat(),
        }
