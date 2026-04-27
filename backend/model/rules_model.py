def rules_phishing_score(classical_vector) -> float:
    url_length = classical_vector[0][0]
    num_dots = classical_vector[0][1]
    has_https = classical_vector[0][2]
    has_ip = classical_vector[0][3]
    num_special = classical_vector[0][4]
    has_at = classical_vector[0][5]
    has_hyphen = classical_vector[0][6]
    num_slashes = classical_vector[0][7]

    score = 0
    if has_ip: score += 4
    if has_at: score += 4
    if has_https == 0: score += 2
    if url_length > 80: score += 1
    if num_special > 3: score += 1
    if num_dots > 4: score += 1
    if has_hyphen: score += 1
    if num_slashes > 6: score += 1

    return min(score / 15, 1.0)