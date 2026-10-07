"""Shared enumerations. The frontend mirrors these in src/utils/constants.ts."""

from enum import Enum


class ProjectEnvironment(str, Enum):
    PRODUCTION = "Production"
    STAGING = "Staging"
    UAT = "UAT"
    DEVELOPMENT = "Development"
    OTHER = "Other"


class ProjectStatus(str, Enum):
    ACTIVE = "Active"
    ON_HOLD = "On Hold"
    ARCHIVED = "Archived"


class Severity(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    INFORMATIONAL = "Informational"


class FindingStatus(str, Enum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    REOPENED = "Reopened"
    ACCEPTED_RISK = "Accepted Risk"
    FALSE_POSITIVE = "False Positive"
    CLOSED = "Closed"


class ScanStatus(str, Enum):
    COMPLETED = "Completed"
    FAILED = "Failed"


class Scanner(str, Enum):
    ZAP = "OWASP ZAP"
    NUCLEI = "Nuclei"


class ReportType(str, Enum):
    HTML = "HTML"
    JSON = "JSON"
    JSONL = "JSONL"
    XML = "XML"
    TXT = "TXT"


class DuplicateConfidence(str, Enum):
    MEDIUM = "Medium"
    LOW = "Low"


class DuplicateDecision(str, Enum):
    PENDING = "Pending"
    MERGED = "Merged"
    KEPT_SEPARATE = "Kept Separate"


class UserRole(str, Enum):
    ADMIN = "Admin"
    SECURITY_ANALYST = "Security Analyst"
    VIEWER = "Viewer"
