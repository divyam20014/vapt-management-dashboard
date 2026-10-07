"""Local administration commands (run on the server, from the backend directory).

    python -m app.cli reset-password <email>

Sets a new password for an existing user, for example when the only Admin has forgotten theirs.
Shell access to the server is the authorization: anyone who can run this can already read the
database. The password is read without echo and never printed or logged. The user is signed out
everywhere, and the change is written to the audit log (actor: System).
"""

import argparse
import getpass
import sys

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.security import hash_password, password_problem
from app.database import create_session_factory, init_db
from app.database.session import create_db_engine
from app.models import User
from app.services import audit_service, auth_service
from app.services.audit_service import AuditAction


def reset_password(email: str, password: str) -> str:
    settings = get_settings()
    engine = create_db_engine(settings)
    init_db(engine, settings)
    db = create_session_factory(engine)()
    try:
        user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
        if user is None:
            raise SystemExit(f"No user with email {email!r}.")
        problem = password_problem(password)
        if problem:
            raise SystemExit(problem)
        user.password_hash = hash_password(password)
        user.active = True
        auth_service.revoke_sessions(db, user.id)
        audit_service.record(db, None, AuditAction.USER_PASSWORD_SET, "user", user.id, {"name": user.name, "via": "command line"})
        db.commit()
        return f"Password set for {user.name} ({user.role.value}). They can now sign in."
    finally:
        db.close()
        engine.dispose()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    reset = commands.add_parser("reset-password", help="Set a new password for a user (also re-activates the account).")
    reset.add_argument("email")
    args = parser.parse_args(argv)

    if args.command == "reset-password":
        first = getpass.getpass("New password: ")
        if getpass.getpass("Repeat new password: ") != first:
            raise SystemExit("The passwords do not match.")
        print(reset_password(args.email, first))


if __name__ == "__main__":
    main(sys.argv[1:])
