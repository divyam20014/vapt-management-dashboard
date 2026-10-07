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
