import os


try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


if load_dotenv:
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)


SECRET_KEY = os.environ.get(
    "JWT_SECRET",
    "change-this-dev-secret-before-deploying-qrguard",
)
SQLALCHEMY_DATABASE_URI = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{os.path.join(os.path.dirname(__file__), 'qrguard.db')}",
)
SQLALCHEMY_TRACK_MODIFICATIONS = False

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

ADVANCED_SCANNER_URL = os.environ.get("ADVANCED_SCANNER_URL", "http://127.0.0.1:8001/scan-url").strip()
ADVANCED_SCAN_TIMEOUT_SECONDS = float(os.environ.get("ADVANCED_SCAN_TIMEOUT_SECONDS", "300"))
ADVANCED_SCAN_EXPIRY_HOURS = int(os.environ.get("ADVANCED_SCAN_EXPIRY_HOURS", "24"))

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()
GEMINI_TIMEOUT_SECONDS = float(os.environ.get("GEMINI_TIMEOUT_SECONDS", "20"))

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

REPORT_REASONS = {
    "fake_sticker",
    "payment_scam",
    "phishing",
    "other",
}
COMMUNITY_REPORTS_UNSAFE_THRESHOLD = int(os.environ.get("COMMUNITY_REPORTS_UNSAFE_THRESHOLD", "2"))
