"""What each role may do. This map is the single source of truth: the API enforces it, and
`GET /api/auth/me` sends the signed-in user's permissions so the UI can hide what it cannot use.
"""

from enum import Enum

from app.models.enums import UserRole


class Permission(str, Enum):
    # Everyone who can sign in can read projects, scans, findings, dashboards and exports.
    READ = "read"
    EXPORT = "export"
    PROJECTS_WRITE = "projects.write"
    PROJECTS_DELETE = "projects.delete"
    RECORDS_DELETE = "records.delete"  # delete scans and findings
    REPORTS_UPLOAD = "reports.upload"
    FINDINGS_UPDATE = "findings.update"
    DUPLICATES_DECIDE = "duplicates.decide"
    USERS_MANAGE = "users.manage"
    AUDIT_READ = "audit.read"


ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.VIEWER: frozenset({Permission.READ, Permission.EXPORT}),
    UserRole.SECURITY_ANALYST: frozenset(
        {
            Permission.READ,
            Permission.EXPORT,
            Permission.PROJECTS_WRITE,
            Permission.REPORTS_UPLOAD,
            Permission.FINDINGS_UPDATE,
            Permission.DUPLICATES_DECIDE,
        }
    ),
    UserRole.ADMIN: frozenset(Permission),
}


def permissions_for(role: UserRole) -> list[str]:
    return sorted(p.value for p in ROLE_PERMISSIONS.get(role, frozenset()))


def has_permission(role: UserRole, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, frozenset())
