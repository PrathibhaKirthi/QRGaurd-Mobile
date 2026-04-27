import numpy as np

def rules_predict_safe_unsafe(features, url):
    f = features.flatten()

    score = 0

    # unpack features
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

    # RULES (stronger logic)
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

    # classification
    if score >= 6:
        return "Unsafe", 0.9, score / 10
    elif score >= 3:
        return "Unsafe", 0.7, score / 10
    else:
        return "Safe", 0.85, score / 10