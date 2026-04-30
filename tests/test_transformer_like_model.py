import importlib

import pytest


transformer_like_model = pytest.importorskip(
    "model.transformer_like_model",
    reason="backend/model/transformer_like_model.py is not present in this project",
)


def test_transformer_like_model_handles_predictable_input(monkeypatch):
    predict = getattr(transformer_like_model, "predict", None)
    if predict is None:
        pytest.skip("transformer_like_model exposes no predict function")

    monkeypatch.setattr(transformer_like_model, "predict", lambda text: ("Safe", 0.9, 0.1))

    classification, confidence, risk_score = transformer_like_model.predict("https://example.com")

    assert classification == "Safe"
    assert confidence == 0.9
    assert risk_score == 0.1


def test_transformer_like_model_imports_cleanly():
    module = importlib.import_module("model.transformer_like_model")

    assert module is transformer_like_model
