from model.feature_extractor import extract_features
from model.xai_explainer import explain


def test_xai_explainer_returns_human_readable_explanations():
    features = extract_features("http://192.168.1.10/login/verify?secure=true")

    explanation = explain(features, fused_risk=0.8, status="Unsafe")

    assert isinstance(explanation["summary"], str)
    assert explanation["summary"]
    assert explanation["reasons"]
    assert all(isinstance(reason, str) and reason for reason in explanation["reasons"])


def test_xai_explainer_returns_feature_contributions():
    features = extract_features("https://secure-login.paypal.com/account")

    explanation = explain(features, fused_risk=0.45, status="Suspicious")

    assert isinstance(explanation["feature_contributions"], list)
    assert explanation["feature_contributions"]
    assert all(
        {"feature", "contribution", "tier"} <= contribution.keys()
        for contribution in explanation["feature_contributions"]
    )


def test_xai_explainer_handles_safe_url():
    features = extract_features("https://www.google.com")

    explanation = explain(features, fused_risk=0.1, status="Safe")

    assert "safe" in explanation["summary"].lower()
    assert explanation["reasons"]
