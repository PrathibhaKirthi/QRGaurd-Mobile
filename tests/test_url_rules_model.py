from model.feature_extractor import extract_features, features_to_vector
from model.url_rules_model import rules_predict_safe_unsafe


def test_rule_based_model_returns_status_confidence_and_risk_score():
    features = extract_features("https://example.com")
    vector = features_to_vector(features)

    classification, confidence, risk_score = rules_predict_safe_unsafe(vector, "https://example.com")

    assert classification in {"Safe", "Unsafe"}
    assert 0 <= confidence <= 1
    assert 0 <= risk_score <= 1


def test_rule_based_model_scores_suspicious_url_higher_than_safe_url():
    safe_vector = features_to_vector(extract_features("https://example.com"))
    suspicious_url = "http://192.168.1.10/login/verify?secure=true&token=123456789"
    suspicious_vector = features_to_vector(extract_features(suspicious_url))

    _, _, safe_risk = rules_predict_safe_unsafe(safe_vector, "https://example.com")
    suspicious_classification, _, suspicious_risk = rules_predict_safe_unsafe(
        suspicious_vector,
        suspicious_url,
    )

    assert suspicious_classification == "Unsafe"
    assert suspicious_risk > safe_risk


def test_rule_based_model_flags_paypal_brand_impersonation():
    phishing_url = "https://paypal-security-check.example.com/login/verify"
    vector = features_to_vector(extract_features(phishing_url))

    classification, confidence, risk_score = rules_predict_safe_unsafe(vector, phishing_url)

    assert classification == "Unsafe"
    assert confidence >= 0.9
    assert risk_score >= 0.6


def test_rule_based_model_does_not_penalize_real_paypal_domain_for_brand_name():
    legitimate_url = "https://www.paypal.com/signin"
    vector = features_to_vector(extract_features(legitimate_url))

    classification, _, risk_score = rules_predict_safe_unsafe(vector, legitimate_url)

    assert classification == "Safe"
    assert risk_score < 0.3


def test_rule_based_model_does_not_penalize_real_google_domain_for_brand_name():
    legitimate_url = "https://www.google.com/search?q=test"
    vector = features_to_vector(extract_features(legitimate_url))

    classification, _, risk_score = rules_predict_safe_unsafe(vector, legitimate_url)

    assert classification == "Safe"
    assert risk_score < 0.3


def test_rule_based_model_flags_google_brand_impersonation():
    phishing_url = "https://google-account-verify.example.com/login"
    vector = features_to_vector(extract_features(phishing_url))

    classification, confidence, risk_score = rules_predict_safe_unsafe(vector, phishing_url)

    assert classification == "Unsafe"
    assert confidence >= 0.9
    assert risk_score >= 0.6
