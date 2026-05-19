from urllib.parse import urlparse

BRAND_DOMAINS = {
    "google": ("google.com", "google.ie", "google.co.uk", "googleapis.com"),
    "paypal": ("paypal.com", "paypal.me"),
    "apple": ("apple.com",),
    "microsoft": ("microsoft.com", "live.com", "office.com", "microsoftonline.com"),
}
BRAND_KEYWORDS = tuple(BRAND_DOMAINS.keys())
CREDENTIAL_KEYWORDS = ("login", "verify", "account", "password", "secure", "signin", "wallet")
PAYMENT_KEYWORDS = ("payment", "pay", "invoice", "refund", "billing", "checkout")


def _extract_hostname(url):
    parsed = urlparse(url if "://" in url else f"http://{url}")
    return (parsed.hostname or "").lower().strip(".")


def _is_allowed_brand_domain(hostname, brand):
    return any(hostname == domain or hostname.endswith(f".{domain}") for domain in BRAND_DOMAINS[brand])


def _brand_impersonation_signals(url):
    
    normalized_url = (url or "").lower()
    hostname = _extract_hostname(normalized_url)
    compact_host = hostname.replace("-", "").replace(".", "")

    matched_brands = [
        brand
        for brand in BRAND_KEYWORDS
        if brand in normalized_url or brand in compact_host
    ]
    impersonated_brands = [
        brand
        for brand in matched_brands
        if not _is_allowed_brand_domain(hostname, brand)
    ]

    has_credentials = any(keyword in normalized_url for keyword in CREDENTIAL_KEYWORDS)
    has_payment = any(keyword in normalized_url for keyword in PAYMENT_KEYWORDS)
    has_subdomain_abuse = any(f"{brand}." in hostname and not _is_allowed_brand_domain(hostname, brand) for brand in BRAND_KEYWORDS)

    return {
        "matched_brands": matched_brands,
        "impersonated_brands": impersonated_brands,
        "has_credentials": has_credentials,
        "has_payment": has_payment,
        "has_subdomain_abuse": has_subdomain_abuse,
    }


def rules_predict_safe_unsafe(features, url):
    # RULES MODEL ENTRY POINT
    f = features.flatten()

    score = 0
    url_length = f[0]
    num_dots = f[1]
    has_https = f[2]
    has_http = f[3]
    has_ip = f[4]
    special_chars = f[5]
    has_at = f[6]
    hyphen = f[7]
    slashes = f[8]
    digits = f[9]
    domain_length = f[10]

    # URL STRUCTURE RULES
    if has_ip:
        score += 3
    if has_at:
        score += 3
    if has_https == 0:
        score += 2
    if url_length > 75:
        score += 2
    if special_chars > 3:
        score += 2
    if num_dots > 4:
        score += 1
    if digits > 6:
        score += 1 

    # BRAND IMPERSONATION RULES
    brand_signals = _brand_impersonation_signals(url)
    if brand_signals["impersonated_brands"]:
        score += 5
    if brand_signals["impersonated_brands"] and brand_signals["has_credentials"]:
        score += 3
    if brand_signals["impersonated_brands"] and brand_signals["has_payment"]:
        score += 2
    if brand_signals["has_subdomain_abuse"]:
        score += 3

    # SAFE/SUSPICIOUS/UNSAFE THRESHOLDS
    risk_score = min(score / 10, 1)
    if score >= 6:
        return "Unsafe", 0.9, risk_score
    elif score >= 3:
        return "Suspicious", 0.7, risk_score
    else:
        return "Safe", 0.85, risk_score
