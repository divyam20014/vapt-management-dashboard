"""Request-scoped dependencies.

Until authentication exists (Phase 6) the UI sends the user it is acting as in the
`X-Acting-User` header. This identifies who made a change for history and audit purposes;
it is self-declared and is NOT authentication.
"""

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.database import get_db
from app.models import User

ACTING_USER_HEADER = "X-Acting-User"


class ActingUserError(AppError):
    status_code = 400
    code = "acting_user_required"


def get_acting_user(
    db: Session = Depends(get_db),
    acting_user: str | None = Header(None, alias=ACTING_USER_HEADER),
) -> User | None:
    if acting_user is None or not acting_user.strip():
        return None
    if not acting_user.strip().isdigit():
        raise ActingUserError("The acting user header must be a user id.")
    user = db.get(User, int(acting_user))
    if user is None or not user.active:
        raise ActingUserError("The selected acting user does not exist or is inactive. Choose another user.")
    return user


def require_acting_user(user: User | None = Depends(get_acting_user)) -> User:
    if user is None:
        raise ActingUserError("Choose who you are acting as (top bar) before changing findings.")
    return user
