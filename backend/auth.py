from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request

from config import JWT_ALGORITHM, JWT_EXP_HOURS
from extensions import db
from models import User


def create_token(user):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXP_HOURS),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm=JWT_ALGORITHM)


def get_bearer_token():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ", 1)[1].strip()


def get_user_from_token(token):
    if not token:
        return None
    try:
        payload = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, TypeError, ValueError):
        return None
    return db.session.get(User, user_id)


def require_auth(route):
    @wraps(route)
    def wrapper(*args, **kwargs):
        user = get_user_from_token(get_bearer_token())
        if not user:
            return jsonify({"error": "Authentication required."}), 401
        g.current_user = user
        return route(*args, **kwargs)

    return wrapper
