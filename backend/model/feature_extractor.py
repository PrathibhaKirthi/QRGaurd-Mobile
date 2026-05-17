import re
import numpy as np


def _get_domain(url: str) -> str:
    try:
        return url.split("://", 1)[-1].split("/", 1)[0]
    except Exception:
        return ""


def extract_features(url: str) -> dict:
    # FEATURE EXTRACTION: Turn a raw URL into measurable phishing indicators.
    url = (url or "").strip()
    domain = _get_domain(url).lower()

    return {
        "url_length": len(url),
        "num_dots": url.count("."),
        "has_https": 1 if url.lower().startswith("https://") else 0,
        "has_http": 1 if url.lower().startswith("http://") else 0,
        "has_ip": 1 if re.search(r"\b\d{1,3}(\.\d{1,3}){3}\b", url) else 0,
        "num_special_chars": len(re.findall(r"[?=&%]", url)),
        "has_at_symbol": 1 if "@" in url else 0,
        "has_hyphen_in_domain": 1 if "-" in domain else 0,
        "num_slashes": url.count("/"),
        "num_digits": len(re.findall(r"\d", url)),
        "domain_length": len(domain),
    }


def features_to_vector(features: dict) -> np.ndarray:
    # MODEL INPUT: Keep feature order stable for the rules-based classifier.
    ordered = [
        features["url_length"],
        features["num_dots"],
        features["has_https"],
        features["has_http"],
        features["has_ip"],
        features["num_special_chars"],
        features["has_at_symbol"],
        features["has_hyphen_in_domain"],
        features["num_slashes"],
        features["num_digits"],
        features["domain_length"],
    ]
    return np.array(ordered, dtype=float).reshape(1, -1)
