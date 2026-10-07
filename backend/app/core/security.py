"""Password hashing and session tokens (Python standard library only).

Passwords are hashed with scrypt and a random salt. The stored value records its own cost
parameters, so they can be raised later without invalidating existing hashes. Session tokens are
random; only their SHA-256 digest is stored, so a copy of the database cannot be used to sign in.
"""

import base64
import hashlib
import hmac
import secrets

# scrypt cost: N=2^15, r=8 uses 32 MiB and takes roughly 50-100 ms per hash.
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
_MAXMEM = 128 * 1024 * 1024
_SALT_BYTES = 16
_KEY_BYTES = 32

PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 256


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=_MAXMEM, dklen=_KEY_BYTES)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    key = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(key)}"


def verify_password(password: str, stored: str | None) -> bool:
    """Constant-time check. A missing or malformed hash never matches."""
    if not stored:
        return False
    try:
        scheme, n, r, p, salt, key = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(key)
        actual = _scrypt(password, base64.b64decode(salt), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Verified against when the account does not exist, so a failed sign-in takes the same time either way.
_DUMMY_HASH: str | None = None


def burn_password_check(password: str) -> None:
    global _DUMMY_HASH
    if _DUMMY_HASH is None or not _DUMMY_HASH.startswith(f"scrypt${SCRYPT_N}$"):
        _DUMMY_HASH = hash_password(secrets.token_urlsafe(16))
    verify_password(password, _DUMMY_HASH)


def password_problem(password: str) -> str | None:
    """Length rule only (NIST SP 800-63B style): no composition rules, but no trivially short passwords."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Use at least {PASSWORD_MIN_LENGTH} characters."
    if len(password) > PASSWORD_MAX_LENGTH:
        return f"Use at most {PASSWORD_MAX_LENGTH} characters."
    if not password.strip():
        return "The password cannot be only spaces."
    return None


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
