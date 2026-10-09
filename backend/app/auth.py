"""Dependency-free password hashing (PBKDF2) and HS256 JWTs."""
import base64, hashlib, hmac, json, os, secrets, time

SECRET = os.environ.get("QUANTUMUC_SECRET", "dev-secret-change-me").encode()


def hash_password(pw: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    return f"{salt}${hashlib.pbkdf2_hmac('sha256', pw.encode(), bytes.fromhex(salt), 200_000).hex()}"


def verify_password(pw: str, stored: str) -> bool:
    salt, _ = stored.split("$")
    return hmac.compare_digest(hash_password(pw, salt), stored)


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(user_id: int, ttl: int = 7 * 86400) -> str:
    head = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64(json.dumps({"sub": user_id, "exp": int(time.time()) + ttl}).encode())
    sig = _b64(hmac.new(SECRET, f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"


def read_token(tok: str) -> int | None:
    try:
        head, body, sig = tok.split(".")
        good = _b64(hmac.new(SECRET, f"{head}.{body}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        data = json.loads(_unb64(body))
        return int(data["sub"]) if data["exp"] > time.time() else None
    except Exception:  # noqa: BLE001
        return None
