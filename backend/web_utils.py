from urllib.parse import urlparse

from flask import has_request_context, request

from config import PUBLIC_BASE_URL


def get_public_base_url():
    if has_request_context():
        request_base_url = request.host_url.rstrip("/")
        request_host = urlparse(request_base_url).hostname
        if request_host not in {"127.0.0.1", "localhost"}:
            return request_base_url

    return PUBLIC_BASE_URL.rstrip("/")
