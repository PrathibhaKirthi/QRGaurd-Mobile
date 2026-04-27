import os
import re
import secrets
from json import JSONDecodeError, loads
from datetime import datetime, timedelta, timezone
from functools import wraps
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import urlopen

import jwt
from flask import Flask, g, has_request_context, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, inspect, text
from werkzeug.security import check_password_hash, generate_password_hash

from model.attack_classifier import classify_attack_type
from model.feature_extractor import extract_features, features_to_vector
from model.url_rules_model import rules_predict_safe_unsafe
from model.xai_explainer import explain

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get(
    "JWT_SECRET",
    "change-this-dev-secret-before-deploying-qrguard",
)
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{os.path.join(os.path.dirname(__file__), 'qrguard.db')}",
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

CORS(app)
db = SQLAlchemy(app)

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
JWT_ALGORITHM = "HS256"
JWT_EXP_HOURS = 24
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://172.20.10.3:5000")
VALID_QR_TYPES = {"static"}
GOOGLE_WEB_RISK_API_KEY = os.environ.get("GOOGLE_WEB_RISK_API_KEY", "").strip()
GOOGLE_WEB_RISK_TIMEOUT_SECONDS = float(os.environ.get("GOOGLE_WEB_RISK_TIMEOUT_SECONDS", "3"))
GOOGLE_WEB_RISK_THREAT_TYPES = (
    "MALWARE",
    "SOCIAL_ENGINEERING",
    "UNWANTED_SOFTWARE",
)
REPORT_REASONS = {
    "fake_sticker",
    "payment_scam",
    "wrong_business",
    "phishing",
    "other",
}


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    qr_codes = db.relationship("GeneratedQRCode", backref="owner", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {"id": self.id, "email": self.email}


class GeneratedQRCode(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    code_id = db.Column(db.String(32), unique=True, nullable=False, index=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    title = db.Column(db.String(160), nullable=False)
    business_name = db.Column(db.String(160), nullable=False)
    destination_url = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text, nullable=True)
    qr_type = db.Column(db.String(20), nullable=False, default="static")
    active = db.Column(db.Boolean, nullable=False, default=True)
    scan_count = db.Column(db.Integer, nullable=False, default=0)
    risk_score = db.Column(db.Float, nullable=False, default=0)
    confidence = db.Column(db.Float, nullable=False, default=0)
    verdict = db.Column(db.String(50), nullable=False, default="Unknown")
    explanation_summary = db.Column(db.Text, nullable=True)
    scan_result_json = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    @property
    def verification_url(self):
        return f"{get_public_base_url()}/q/{self.code_id}"

    @property
    def qr_value(self):
        return self.destination_url

    def to_dict(self):
        return {
            "id": self.id,
            "code_id": self.code_id,
            "title": self.title,
            "business_name": self.business_name,
            "destination_url": self.destination_url,
            "description": self.description or "",
            "qr_type": self.qr_type,
            "active": self.active,
            "scan_count": self.scan_count,
            "risk_score": self.risk_score,
            "confidence": self.confidence,
            "verdict": self.verdict,
            "explanation_summary": self.explanation_summary,
            "verification_url": self.verification_url,
            "qr_value": self.qr_value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


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


def ensure_dev_schema():
    db.create_all()

    inspector = inspect(db.engine)
    if "generated_qr_code" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("generated_qr_code")}
    if "scan_count" not in existing_columns:
        db.session.execute(text("ALTER TABLE generated_qr_code ADD COLUMN scan_count INTEGER NOT NULL DEFAULT 0"))
        db.session.commit()
    if "qr_type" not in existing_columns:
        db.session.execute(text("ALTER TABLE generated_qr_code ADD COLUMN qr_type VARCHAR(20) NOT NULL DEFAULT 'static'"))
        db.session.commit()


with app.app_context():
    ensure_dev_schema()


def get_public_base_url():
    if has_request_context():
        request_base_url = request.host_url.rstrip("/")
        request_host = urlparse(request_base_url).hostname
        if request_host not in {"127.0.0.1", "localhost"}:
            return request_base_url

    return PUBLIC_BASE_URL.rstrip("/")


def classify_score(score: float) -> str:
    if score < 0.4:
        return "Safe"
    elif score < 0.7:
        return "Suspicious"
    else:
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


def validate_auth_payload(data):
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not EMAIL_PATTERN.match(email):
        return None, None, "Enter a valid email address."
    if len(password) < 8:
        return None, None, "Password must be at least 8 characters."

    return email, password, None


def is_valid_url(value):
    parsed = urlparse((value or "").strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def normalize_qr_payload(data):
    title = (data.get("title") or "").strip()
    business_name = (data.get("business_name") or "").strip()
    destination_url = (data.get("destination_url") or "").strip()
    description = (data.get("description") or "").strip()
    qr_type = (data.get("qr_type") or "static").strip().lower()
    active = bool(data.get("active", True))

    if not title:
        return None, "QR title is required."
    if not business_name:
        return None, "Business name is required."
    if not is_valid_url(destination_url):
        return None, "Enter a valid HTTP or HTTPS destination URL."
    if qr_type not in VALID_QR_TYPES:
        return None, "Only static QR codes are supported."

    return {
        "title": title,
        "business_name": business_name,
        "destination_url": destination_url,
        "description": description,
        "qr_type": qr_type,
        "active": active,
    }, None


def normalize_report_payload(data):
    scanned_content = (data.get("scanned_content") or data.get("qr_text") or "").strip()
    destination_url = (data.get("destination_url") or "").strip() or None
    reason = (data.get("reason") or "").strip().lower()
    note = (data.get("note") or "").strip()
    location_label = (data.get("location_label") or "").strip()
    verdict = (data.get("verdict") or "").strip() or None

    if not scanned_content:
        return None, "Scanned QR content is required."
    if len(scanned_content) > 4000:
        return None, "Scanned QR content is too long."
    if reason not in REPORT_REASONS:
        return None, "Choose a valid report reason."
    if destination_url and not is_valid_url(destination_url):
        return None, "Destination URL must be HTTP or HTTPS."
    if len(note) > 500:
        return None, "Report note must be 500 characters or fewer."
    if len(location_label) > 255:
        return None, "Location must be 255 characters or fewer."

    latitude = data.get("latitude")
    longitude = data.get("longitude")
    try:
        latitude = float(latitude) if latitude not in (None, "") else None
        longitude = float(longitude) if longitude not in (None, "") else None
    except (TypeError, ValueError):
        return None, "Latitude and longitude must be valid numbers."

    if latitude is not None and not -90 <= latitude <= 90:
        return None, "Latitude must be between -90 and 90."
    if longitude is not None and not -180 <= longitude <= 180:
        return None, "Longitude must be between -180 and 180."

    def optional_float(field_name):
        value = data.get(field_name)
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    return {
        "scanned_content": scanned_content,
        "destination_url": destination_url,
        "reason": reason,
        "note": note,
        "location_label": location_label,
        "latitude": latitude,
        "longitude": longitude,
        "verdict": verdict,
        "risk_score": optional_float("risk_score"),
        "confidence": optional_float("confidence"),
    }, None


def create_token(user):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXP_HOURS),
    }
    return jwt.encode(payload, app.config["SECRET_KEY"], algorithm=JWT_ALGORITHM)


def get_bearer_token():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ", 1)[1].strip()


def get_user_from_token(token):
    if not token:
        return None
    try:
        payload = jwt.decode(token, app.config["SECRET_KEY"], algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, TypeError, ValueError):
        return None
    return db.session.get(User, user_id)


def require_auth(route):
    @wraps(route)
    def wrapper(*args, **kwargs):
        user = get_user_from_token(get_bearer_token())
        if not user:
            return jsonify({"error": "Authentication required."}), 401
        g.current_user = user
        return route(*args, **kwargs)

    return wrapper


def build_scan_result(qr_text):
    features = extract_features(qr_text)
    vec = features_to_vector(features)

    rules_status, rules_conf, rules_risk = rules_predict_safe_unsafe(vec, qr_text)

    final_score = rules_risk / 100 if rules_risk > 1 else rules_risk
    final_conf = rules_conf
    google_web_risk = check_google_web_risk(qr_text)
    if google_web_risk["matched"]:
        final_score = max(final_score, 0.95)
        final_conf = max(final_conf, 0.95)

    final_status = classify_score(final_score)
    attack = classify_attack_type(features, qr_text)
    xai = explain(features, final_score, final_status, top_n=4)
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
            "method": "rules_with_web_risk",
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


def get_verified_qr_from_scanned_url(qr_text):
    parsed_scan_url = urlparse(qr_text)

    match = re.fullmatch(r"/q/([A-Za-z0-9_-]+)", parsed_scan_url.path.rstrip("/"))
    if match:
        return GeneratedQRCode.query.filter_by(code_id=match.group(1), qr_type="dynamic").first()

    return (
        GeneratedQRCode.query.filter_by(destination_url=qr_text, qr_type="static")
        .order_by(GeneratedQRCode.updated_at.desc())
        .first()
    )


def apply_scan_result_to_generated_qr(qr_code, scan_result):
    final = scan_result.get("final") or {}
    explanation = scan_result.get("explanation") or {}

    qr_code.risk_score = float(final.get("risk_score") or 0)
    qr_code.confidence = float(final.get("confidence") or 0)
    qr_code.verdict = final.get("status") or "Unknown"
    qr_code.explanation_summary = explanation.get("summary")
    qr_code.scan_result_json = scan_result
    if qr_code.verdict == "Unsafe":
        qr_code.active = False


@app.get("/ping")
def ping():
    return "OK", 200


@app.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    email, password, validation_error = validate_auth_payload(data)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists."}), 409

    user = User(email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()

    return jsonify({"token": create_token(user), "user": user.to_dict()}), 201


@app.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password."}), 401

    return jsonify({"token": create_token(user), "user": user.to_dict()})


@app.post("/scan")
def scan():
    data = request.get_json(silent=True) or {}
    qr_text = (data.get("url") or data.get("content") or "").strip()

    if not qr_text:
        return jsonify({"error": "No QR content provided"}), 400

    verified_qr = get_verified_qr_from_scanned_url(qr_text)
    if verified_qr:
        verified_qr.scan_count += 1
        db.session.commit()
        scan_result = build_scan_result(verified_qr.destination_url)
        scan_result["qr_text"] = qr_text
        scan_result["verified_qr"] = {
            "is_qrguard_code": True,
            "is_active": verified_qr.active,
            "qr_type": verified_qr.qr_type,
            "business_name": verified_qr.business_name,
            "title": verified_qr.title,
            "description": verified_qr.description or "",
            "destination_url": verified_qr.destination_url,
            "verification_url": verified_qr.verification_url,
            "qr_value": verified_qr.qr_value,
            "scan_count": verified_qr.scan_count,
            "warning": None if verified_qr.active else "This QR code has been disabled by its owner.",
            "last_verified_at": verified_qr.updated_at.isoformat(),
        }
        return jsonify(scan_result)

    scan_result = build_scan_result(qr_text)

    return jsonify(scan_result)


@app.post("/reports")
def create_suspicious_qr_report():
    payload, validation_error = normalize_report_payload(request.get_json(silent=True) or {})
    if validation_error:
        return jsonify({"error": validation_error}), 400

    report = SuspiciousQRReport(**payload)
    db.session.add(report)
    db.session.commit()

    return jsonify({"report": report.to_dict()}), 201


@app.get("/reports/recent")
def recent_suspicious_qr_reports():
    limit = request.args.get("limit", 25)
    try:
        limit = min(max(int(limit), 1), 100)
    except (TypeError, ValueError):
        limit = 25

    reports = SuspiciousQRReport.query.order_by(SuspiciousQRReport.created_at.desc()).limit(limit).all()
    return jsonify({"reports": [report.to_dict() for report in reports]})


@app.post("/business/qrcodes")
@require_auth
def create_qr_code():
    payload, validation_error = normalize_qr_payload(request.get_json(silent=True) or {})
    if validation_error:
        return jsonify({"error": validation_error}), 400

    scan_result = build_scan_result(payload["destination_url"])
    qr_code = GeneratedQRCode(
        code_id=secrets.token_urlsafe(8),
        owner_id=g.current_user.id,
        **payload,
    )
    apply_scan_result_to_generated_qr(qr_code, scan_result)
    db.session.add(qr_code)
    db.session.commit()

    return jsonify({"qr_code": qr_code.to_dict()}), 201


@app.get("/business/qrcodes")
@require_auth
def list_qr_codes():
    qr_codes = (
        GeneratedQRCode.query.filter_by(owner_id=g.current_user.id)
        .order_by(GeneratedQRCode.updated_at.desc())
        .all()
    )
    return jsonify({"qr_codes": [qr_code.to_dict() for qr_code in qr_codes]})


@app.put("/business/qrcodes/<int:qr_id>")
@require_auth
def update_qr_code(qr_id):
    qr_code = GeneratedQRCode.query.filter_by(id=qr_id, owner_id=g.current_user.id).first()
    if not qr_code:
        return jsonify({"error": "QR code not found."}), 404

    payload, validation_error = normalize_qr_payload(request.get_json(silent=True) or {})
    if validation_error:
        return jsonify({"error": validation_error}), 400

    destination_changed = qr_code.destination_url != payload["destination_url"]
    qr_code.title = payload["title"]
    qr_code.business_name = payload["business_name"]
    qr_code.destination_url = payload["destination_url"]
    qr_code.description = payload["description"]
    qr_code.qr_type = payload["qr_type"]
    qr_code.active = payload["active"]

    if destination_changed or qr_code.verdict == "Unknown":
        scan_result = build_scan_result(qr_code.destination_url)
        apply_scan_result_to_generated_qr(qr_code, scan_result)

    db.session.commit()
    return jsonify({"qr_code": qr_code.to_dict()})



@app.delete("/business/qrcodes/<int:qr_id>")
@require_auth
def delete_qr_code(qr_id):
    qr_code = GeneratedQRCode.query.filter_by(id=qr_id, owner_id=g.current_user.id).first()
    if not qr_code:
        return jsonify({"error": "QR code not found."}), 404

    db.session.delete(qr_code)
    db.session.commit()
    return jsonify({"message": "QR code deleted."})


@app.get("/q/<code_id>")
def public_qr_info(code_id):
    qr_code = GeneratedQRCode.query.filter_by(code_id=code_id).first()
    if not qr_code:
        return jsonify({"error": "QR code not found."}), 404

    wants_json = "application/json" in request.headers.get("Accept", "")
    if wants_json:
        return jsonify({"qr_code": qr_code.to_dict()})

    status = "Active" if qr_code.active else "Disabled"
    return f"""
    <!doctype html>
    <html>
      <head><title>QRGuard Verification</title></head>
      <body style="font-family: Arial, sans-serif; max-width: 680px; margin: 48px auto; line-height: 1.5;">
        <h1>QRGuard Verified QR</h1>
        <p><strong>{qr_code.title}</strong> by {qr_code.business_name}</p>
        <p>Status: {status}</p>
        <p>Safety verdict: {qr_code.verdict} ({qr_code.risk_score}% risk)</p>
        <p>{qr_code.explanation_summary or ""}</p>
        <p>Destination: <a href="{qr_code.destination_url}">{qr_code.destination_url}</a></p>
      </body>
    </html>
    """


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
