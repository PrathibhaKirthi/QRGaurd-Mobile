def _clamp_probability(value: float) -> float:
    return min(max(float(value), 0.0), 1.0)


def fuse_two_scores_to_label(p_a: float, p_b: float, w_a: float, w_b: float, mode_name: str = ""):
    total_weight = float(w_a) + float(w_b)
    if total_weight <= 0:
        raise ValueError("Fusion weights must add up to a positive value.")

    normalized_a = float(w_a) / total_weight
    normalized_b = float(w_b) / total_weight
    p_final = (normalized_a * _clamp_probability(p_a)) + (normalized_b * _clamp_probability(p_b))

    if p_final >= 0.7:
        status = "Unsafe"
    elif p_final >= 0.4:
        status = "Suspicious"
    else:
        status = "Safe"

    # Confidence increases as the score moves away from the decision boundaries.
    confidence = max(p_final, 1 - p_final)
    if 0.35 <= p_final <= 0.45 or 0.65 <= p_final <= 0.75:
        confidence = max(0.65, confidence - 0.1)

    return status, confidence, p_final
