from flask import Flask
from flask_cors import CORS

import config
from advanced_scan_service import (
    call_gemini_analysis,
    call_playwright_scanner,
    cleanup_expired_advanced_scans,
    run_advanced_scan_job,
)
from auth import create_token, get_bearer_token, get_user_from_token, require_auth
from extensions import db
from models import AdvancedScan, ScanHistory, SuspiciousQRReport, User
from routes import register_routes
from scan_service import (
    apply_report_intelligence,
    build_scan_result,
    check_google_web_risk,
    classify_score,
    get_report_intelligence,
)
from schema import ensure_dev_schema
from validation import (
    is_private_or_reserved_host,
    is_valid_url,
    normalize_report_payload,
    validate_advanced_scan_target,
    validate_auth_payload,
)
from web_utils import get_public_base_url


def create_app():
    flask_app = Flask(__name__)
    flask_app.config.from_object(config)

    CORS(flask_app)
    db.init_app(flask_app)
    register_routes(flask_app)

    with flask_app.app_context():
        ensure_dev_schema()

    return flask_app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
