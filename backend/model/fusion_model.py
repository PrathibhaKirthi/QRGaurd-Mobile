def fuse_two_scores_to_label(p_a: float, p_b: float, w_a: float, w_b: float, mode_name: str = ""):
   
    p_final = (w_a * p_a) + (w_b * p_b)

    if p_final >= 0.7:
        return "Phishing", p_final, p_final
    elif p_final >= 0.4:
        return "Suspicious", p_final, p_final
    else:
        return "Safe", 1 - p_final, p_final