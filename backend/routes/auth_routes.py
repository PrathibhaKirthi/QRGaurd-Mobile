from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from auth import create_token
from extensions import db
from models import User
from validation import validate_auth_payload


auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    email, password, validation_error = validate_auth_payload(data)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists."}), 409

    user = User(email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()

    return jsonify({"token": create_token(user), "user": user.to_dict()}), 201


@auth_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password."}), 401

    return jsonify({"token": create_token(user), "user": user.to_dict()})
