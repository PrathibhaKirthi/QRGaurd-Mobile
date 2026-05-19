import socket
from ipaddress import ip_address
from urllib.parse import urlparse

from config import REPORT_REASONS


def is_valid_url(value):
    parsed = urlparse((value or "").strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def is_private_or_reserved_host(hostname):
    if not hostname:
        return True

    hostname = hostname.strip().lower().rstrip(".")
    if hostname in {"localhost"}:
        return True

    try:
        addresses = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False

    for address_info in addresses:
        host = address_info[4][0]
        try:
            parsed_ip = ip_address(host)
        except ValueError:
            continue

        if (
            parsed_ip.is_private
            or parsed_ip.is_loopback
            or parsed_ip.is_link_local
            or parsed_ip.is_multicast
            or parsed_ip.is_reserved
            or parsed_ip.is_unspecified
        ):
            return True

    return False


def validate_advanced_scan_target(url):
    if not is_valid_url(url):
        return "Advanced Scan requires a valid HTTP or HTTPS URL."

    parsed = urlparse(url)
    if is_private_or_reserved_host(parsed.hostname):
        return "Advanced Scan cannot inspect private, local, or reserved network targets."

    return None


def normalize_report_payload(data):
    scanned_content = (data.get("scanned_content") or data.get("qr_text") or "").strip()
    destination_url = (data.get("destination_url") or "").strip() or None
    reason = (data.get("reason") or "").strip().lower()
    note = (data.get("note") or "").strip()
    location_label = (data.get("location_label") or "").strip()
    verdict = (data.get("verdict") or "").strip() or None

    if not scanned_content:
        return None, "Scanned QR content is required."
    if len(scanned_content) > 4000:
        return None, "Scanned QR content is too long."
    if reason not in REPORT_REASONS:
        return None, "Choose a valid report reason."
    if destination_url and not is_valid_url(destination_url):
        return None, "Destination URL must be HTTP or HTTPS."
    if len(note) > 500:
        return None, "Report note must be 500 characters or fewer."
    if len(location_label) > 255:
        return None, "Location must be 255 characters or fewer."

    latitude = data.get("latitude")
    longitude = data.get("longitude")
    try:
        latitude = float(latitude) if latitude not in (None, "") else None
        longitude = float(longitude) if longitude not in (None, "") else None
    except (TypeError, ValueError):
        return None, "Latitude and longitude must be valid numbers."

    if latitude is not None and not -90 <= latitude <= 90:
        return None, "Latitude must be between -90 and 90."
    if longitude is not None and not -180 <= longitude <= 180:
        return None, "Longitude must be between -180 and 180."

    def optional_float(field_name):
        value = data.get(field_name)
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    return {
        "scanned_content": scanned_content,
        "destination_url": destination_url,
        "reason": reason,
        "note": note,
        "location_label": location_label,
        "latitude": latitude,
        "longitude": longitude,
        "verdict": verdict,
        "risk_score": optional_float("risk_score"),
        "confidence": optional_float("confidence"),
    }, None
