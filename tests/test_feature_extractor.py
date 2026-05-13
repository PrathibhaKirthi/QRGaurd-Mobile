import pytest

from model.feature_extractor import extract_features, features_to_vector


def test_detects_https_url():
    features = extract_features("https://www.google.com")

    assert features["has_https"] == 1
    assert features["has_http"] == 0


def test_detects_http_url_without_https():
    features = extract_features("http://www.google.com")

    assert features["has_http"] == 1
    assert features["has_https"] == 0


def test_detects_ip_address_url():
    features = extract_features("http://192.168.1.10/login")

    assert features["has_ip"] == 1
    assert features["num_digits"] >= 8


def test_detects_at_symbol_in_url():
    features = extract_features("https://www.paypal.com@secure-login.com/login")

    assert features["has_at_symbol"] == 1


def test_detects_long_url():
    url = "https://www.google.com/" + ("a" * 120)
    features = extract_features(url)

    assert features["url_length"] == len(url)
    assert features["url_length"] > 75


def test_counts_dots_digits_slashes_and_special_characters():
    url = "https://mail.accounts.google.com/path/678?q=abc&token=42%86"
    features = extract_features(url)

    assert features["num_dots"] == 3
    assert features["num_digits"] == 7
    assert features["num_slashes"] == 4
    assert features["num_special_chars"] == 5


def test_detects_hyphen_in_domain():
    features = extract_features("https://secure-login.paypal.com")

    assert features["has_hyphen_in_domain"] == 1


@pytest.mark.parametrize(
    "url",
    [
        "",
        "not a url",
        "http://www.google.com",
        "https://192.168.0.1/verify",
        "http://secure-login.paypal.com/verify/account",
        "https://www.google.com/" + ("x" * 200),
    ],
)
def test_extract_features_handles_edge_cases(url):
    features = extract_features(url)

    assert isinstance(features, dict)
    assert features["url_length"] == len(url.strip())
    assert features_to_vector(features).shape == (1, 11)
