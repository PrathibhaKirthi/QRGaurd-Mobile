from __future__ import annotations

import re
from typing import Dict
from urllib.parse import urlparse

BRAND_KEYWORDS = ("google", "paypal", "apple", "microsoft")
BRAND_DOMAINS = {
    "google": ("google.com", "google.ie", "google.co.uk", "googleapis.com"),
    "paypal": ("paypal.com", "paypal.me"),
    "apple": ("apple.com",),
    "microsoft": ("microsoft.com", "live.com", "office.com", "microsoftonline.com"),
}
CREDENTIAL_KEYWORDS = ("login", "verify", "account", "password")
REDIRECT_KEYWORDS = ("redirect", "return", "target", "next", "continue", "url")


def _safe_int(features: dict, key: str) -> int:
    """Return an integer feature value without raising on missing or invalid input."""
    try:
        return int(features.get(key, 0))
    except (TypeError, ValueError):
        return 0


def _extract_domain(url: str) -> str:
    """Extract the hostname portion from a URL-like string."""
    parsed = urlparse(url if "://" in url else f"http://{url}")
    return (parsed.netloc or parsed.path.split("/", 1)[0]).lower()


def _is_typosquatting_domain(domain: str) -> bool:
    """Detect simple brand-lookalike patterns in the domain."""
    if not domain:
        return False
    if any(_is_allowed_brand_domain(domain, brand) for brand in BRAND_DOMAINS):
        return False

    normalized = domain.replace(".", "").replace("-", "")

    explicit_variants = (
        "g00gle",
        "goog1e",
        "go0gle",
        "paypa1",
        "paypa-l",
        "app1e",
        "micr0soft",
        "rnicrosoft",
    )
    if any(variant in domain for variant in explicit_variants):
        return True

    common_digit_swaps = (
        re.search(r"g[0o]{2}gle", normalized),
        re.search(r"paypa[1i]", normalized),
        re.search(r"app[l1i]e", normalized),
        re.search(r"micr[o0]soft", normalized),
    )
    return any(common_digit_swaps)


def _is_allowed_brand_domain(domain: str, brand: str) -> bool:
    return any(domain == allowed or domain.endswith(f".{allowed}") for allowed in BRAND_DOMAINS[brand])


def classify_attack_type(features: dict, url: str) -> Dict[str, str]:
    """
    Classify the likely phishing or malicious behaviour from URL patterns.

    Returns:
    {
        "type": string,
        "severity": "low" | "medium" | "high"
    }
    """
    normalized_url = (url or "").strip().lower()
    domain = _extract_domain(normalized_url)

    has_ip = _safe_int(features, "has_ip") == 1
    has_https = _safe_int(features, "has_https") == 1
    has_hyphen_in_domain = _safe_int(features, "has_hyphen_in_domain") == 1
    num_special_chars = _safe_int(features, "num_special_chars")
    num_dots = _safe_int(features, "num_dots")
    num_digits = _safe_int(features, "num_digits")
    url_length = _safe_int(features, "url_length")

    query_markers = normalized_url.count("?") + normalized_url.count("=") + normalized_url.count("&")
    has_credential_keywords = any(keyword in normalized_url for keyword in CREDENTIAL_KEYWORDS)
    matched_brands = [brand for brand in BRAND_KEYWORDS if brand in normalized_url]
    impersonated_brands = [
        brand for brand in matched_brands if not _is_allowed_brand_domain(domain, brand)
    ]
    has_brand_keyword = bool(matched_brands)
    suspicious_brand_domain = has_ip or has_hyphen_in_domain or num_dots >= 3
    has_redirect_signal = "redirect" in normalized_url or query_markers >= 4
    has_exfiltration_signal = num_special_chars >= 6 or query_markers >= 7 or url_length >= 120

    if impersonated_brands and has_credential_keywords:
        return {"type": "Credential Harvesting", "severity": "high"}

    if impersonated_brands and suspicious_brand_domain:
        return {"type": "Brand Impersonation", "severity": "high"}

    if _is_typosquatting_domain(domain) or (num_digits >= 2 and bool(impersonated_brands)):
        return {"type": "Typosquatting", "severity": "high"}

    if has_exfiltration_signal:
        return {"type": "Data Exfiltration", "severity": "high"}

    if has_redirect_signal or any(keyword in normalized_url for keyword in REDIRECT_KEYWORDS):
        return {"type": "Malicious Redirect", "severity": "medium"}

    if (not has_https) or has_ip:
        return {"type": "Suspicious Link", "severity": "medium"}

    return {"type": "Legitimate", "severity": "low"}
