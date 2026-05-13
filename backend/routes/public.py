from flask import Blueprint


public_bp = Blueprint("public", __name__)


@public_bp.get("/ping")
def ping():
    return "OK", 200

