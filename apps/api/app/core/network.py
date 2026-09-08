import ipaddress

from app.core.config import Settings


def trusted_client_ip(*, peer_ip: str | None, forwarded_for: str | None, settings: Settings) -> str:
    """Use X-Forwarded-For only when the direct peer is a configured proxy."""
    if not peer_ip:
        return "unknown"
    try:
        peer = ipaddress.ip_address(peer_ip)
    except ValueError:
        return "unknown"
    if not any(peer in network for network in settings.trusted_proxy_networks):
        return str(peer)
    if not forwarded_for:
        return str(peer)
    candidate = forwarded_for.split(",", 1)[0].strip()
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return str(peer)
