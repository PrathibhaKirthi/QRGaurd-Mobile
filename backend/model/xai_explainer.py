
FEATURE_WEIGHTS = {
    "has_ip":               1.00,   # IP-based URLs almost always malicious
    "has_at_symbol":        0.90,   # @ used to spoof domain (e.g. google.com@evil.com)
    "has_https":           -0.60,   # HTTPS is a safety signal (negative = reduces risk)
    "num_special_chars":    0.15,   # Each extra special char (?, =, &, %) adds risk
    "url_length":           0.008,  # Each extra character above threshold adds risk
    "num_dots":             0.12,   # Each extra dot (subdomain abuse) adds risk
    "has_hyphen_in_domain": 0.40,   # Hyphens used to mimic brands (paypa-l.com)
    "num_digits":           0.06,   # High digit count suggests obfuscation
    "num_slashes":          0.05,   # Deeply nested paths are a weak signal
    "has_http":             0.30,   # Plain HTTP (non-HTTPS) is a risk signal
    "domain_length":        0.008,  # Very long domains are suspicious
}


EXPLANATION_TEMPLATES = {
    "has_ip": {
        "high":   "URL uses a raw IP address instead of a domain name — a strong phishing indicator",
    },
    "has_at_symbol": {
        "high":   "URL contains '@' symbol, which can be used to disguise the real destination",
    },
    "has_https": {
        "safe":   "URL uses HTTPS — encrypted and more trustworthy",
        "risk":   "URL does not use HTTPS — data sent over this link is unencrypted",
    },
    "has_http": {
        "high":   "URL explicitly uses unencrypted HTTP protocol",
    },
    "num_special_chars": {
        "low":    "URL contains a few special characters — normal for web addresses",
        "medium": "URL contains several special characters, which may indicate parameter manipulation",
        "high":   "URL contains an unusually high number of special characters — common in obfuscated phishing links",
    },
    "url_length": {
        "low":    "URL length is normal",
        "medium": "URL is longer than typical — may be hiding the real destination",
        "high":   "URL is unusually long — a common technique to obscure the true destination",
    },
    "num_dots": {
        "low":    "Normal number of subdomains",
        "medium": "Multiple subdomains detected — verify the root domain carefully",
        "high":   "Excessive subdomains detected — often used to impersonate legitimate sites",
    },
    "has_hyphen_in_domain": {
        "high":   "Domain contains hyphens — frequently used to mimic brand names (e.g. pay-pal.com)",
    },
    "num_digits": {
        "medium": "Domain contains several digits — may indicate a randomly generated phishing domain",
        "high":   "High digit count in URL — suggests an auto-generated or obfuscated address",
    },
    "domain_length": {
        "medium": "Domain name is longer than usual",
        "high":   "Domain name is very long — legitimate sites rarely use such long domain names",
    },
}


def _compute_contributions(features: dict) -> list[dict]:
    """
    Compute a signed contribution score for each feature.
    Returns a list of dicts sorted by absolute contribution (descending).
    """
    # EXPLAINABILITY ENGINE
    contributions = []

    f = features  

    if f.get("has_ip"):
        contributions.append({
            "feature": "has_ip",
            "value": 1,
            "contribution": FEATURE_WEIGHTS["has_ip"],
            "tier": "high",
        })

    if f.get("has_at_symbol"):
        contributions.append({
            "feature": "has_at_symbol",
            "value": 1,
            "contribution": FEATURE_WEIGHTS["has_at_symbol"],
            "tier": "high",
        })

    if not f.get("has_https"):
        contributions.append({
            "feature": "has_https",
            "value": 0,
            "contribution": abs(FEATURE_WEIGHTS["has_https"]),  
            "tier": "risk",
        })
    else:
     
        contributions.append({
            "feature": "has_https",
            "value": 1,
            "contribution": FEATURE_WEIGHTS["has_https"],  # negative
            "tier": "safe",
        })

    if f.get("has_http") and not f.get("has_https"):
        contributions.append({
            "feature": "has_http",
            "value": 1,
            "contribution": FEATURE_WEIGHTS["has_http"],
            "tier": "high",
        })

    if f.get("has_hyphen_in_domain"):
        contributions.append({
            "feature": "has_hyphen_in_domain",
            "value": 1,
            "contribution": FEATURE_WEIGHTS["has_hyphen_in_domain"],
            "tier": "high",
        })

   
    special = f.get("num_special_chars", 0)
    if special > 5:
        contributions.append({"feature": "num_special_chars", "value": special,
                               "contribution": FEATURE_WEIGHTS["num_special_chars"] * special,
                               "tier": "high"})
    elif special > 2:
        contributions.append({"feature": "num_special_chars", "value": special,
                               "contribution": FEATURE_WEIGHTS["num_special_chars"] * special,
                               "tier": "medium"})
    elif special > 0:
        contributions.append({"feature": "num_special_chars", "value": special,
                               "contribution": FEATURE_WEIGHTS["num_special_chars"] * special,
                               "tier": "low"})

    url_len = f.get("url_length", 0)
    if url_len > 100:
        contributions.append({"feature": "url_length", "value": url_len,
                               "contribution": FEATURE_WEIGHTS["url_length"] * (url_len - 50),
                               "tier": "high"})
    elif url_len > 75:
        contributions.append({"feature": "url_length", "value": url_len,
                               "contribution": FEATURE_WEIGHTS["url_length"] * (url_len - 50),
                               "tier": "medium"})
    else:
        contributions.append({"feature": "url_length", "value": url_len,
                               "contribution": 0.0,
                               "tier": "low"})

    dots = f.get("num_dots", 0)
    if dots > 5:
        contributions.append({"feature": "num_dots", "value": dots,
                               "contribution": FEATURE_WEIGHTS["num_dots"] * dots,
                               "tier": "high"})
    elif dots > 3:
        contributions.append({"feature": "num_dots", "value": dots,
                               "contribution": FEATURE_WEIGHTS["num_dots"] * dots,
                               "tier": "medium"})
    else:
        contributions.append({"feature": "num_dots", "value": dots,
                               "contribution": 0.0,
                               "tier": "low"})

    digits = f.get("num_digits", 0)
    if digits > 8:
        contributions.append({"feature": "num_digits", "value": digits,
                               "contribution": FEATURE_WEIGHTS["num_digits"] * digits,
                               "tier": "high"})
    elif digits > 4:
        contributions.append({"feature": "num_digits", "value": digits,
                               "contribution": FEATURE_WEIGHTS["num_digits"] * digits,
                               "tier": "medium"})

    domain_len = f.get("domain_length", 0)
    if domain_len > 30:
        contributions.append({"feature": "domain_length", "value": domain_len,
                               "contribution": FEATURE_WEIGHTS["domain_length"] * domain_len,
                               "tier": "high"})
    elif domain_len > 20:
        contributions.append({"feature": "domain_length", "value": domain_len,
                               "contribution": FEATURE_WEIGHTS["domain_length"] * domain_len,
                               "tier": "medium"})

    contributions.sort(key=lambda x: x["contribution"], reverse=True)
    return contributions


def _render_explanation(feature: str, tier: str, value) -> str | None:
    """Convert a feature + tier into a human-readable sentence."""
    templates = EXPLANATION_TEMPLATES.get(feature)
    if not templates:
        return None
    text = templates.get(tier)
    if not text:
        return None
    return text.replace("{value}", str(value))


def _summary_sentence(risk_score: float, status: str) -> str:
    """Generate a one-line summary aligned with the fused risk score."""
    if status == "Safe":
        return "This URL shows no significant phishing indicators and appears safe to visit."
    elif status == "Suspicious":
        pct = round(risk_score * 100)
        return f"This URL has a {pct}% risk score — proceed with caution and verify the source."
    else:
        pct = round(risk_score * 100)
        return f"This URL has a high risk score of {pct}% — it is likely a phishing or malicious link."


def explain(features: dict, fused_risk: float, status: str, top_n: int = 4) -> dict:
    """
    Main XAI entry point.

    Args:
        features:   dict from feature_extractor.extract_features()
        fused_risk: float 0.0–1.0 from fuse_scores()
        status:     "Safe" | "Suspicious" | "Unsafe"
        top_n:      max number of explanation bullets to return

    Returns:
        {
          "summary": str,                  # one-line verdict
          "reasons": [str, ...],           # ranked human-readable explanations
          "feature_contributions": [       # full ranked data (for frontend charts etc.)
            {"feature": str, "contribution": float, "tier": str}, ...
          ]
        }
    """
    # XAI ENTRY POINT
    contributions = _compute_contributions(features)

    reasons = []
    for c in contributions:
        if c["contribution"] <= 0:
            continue  
        sentence = _render_explanation(c["feature"], c["tier"], c["value"])
        if sentence and sentence not in reasons:
            reasons.append(sentence)
        if len(reasons) >= top_n:
            break

 
    if not reasons and status == "Safe":
        reasons.append("URL uses HTTPS and contains no known phishing patterns.")

    summary = _summary_sentence(fused_risk, status)

    contribution_summary = [
        {
            "feature": c["feature"],
            "contribution": round(c["contribution"], 3),
            "tier": c["tier"],
        }
        for c in contributions
        if abs(c["contribution"]) > 0.001
    ]

    return {
        "summary": summary,
        "reasons": reasons,
        "feature_contributions": contribution_summary,
    }
