import os
import sys
from pathlib import Path

import pytest


ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("GOOGLE_WEB_RISK_API_KEY", "")


@pytest.fixture()
def app(monkeypatch):
    import app as flask_app

    flask_app.app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI="sqlite:///:memory:")
    monkeypatch.setattr(
        flask_app,
        "check_google_web_risk",
        lambda url: {
            "provider": "Google Web Risk",
            "configured": False,
            "checked": False,
            "matched": False,
            "threat_types": [],
            "error": None,
        },
    )

    with flask_app.app.app_context():
        flask_app.db.drop_all()
        flask_app.db.create_all()

    yield flask_app.app

    with flask_app.app.app_context():
        flask_app.db.session.remove()
        flask_app.db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()
