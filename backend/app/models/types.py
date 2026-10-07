from enum import Enum as PyEnum

from sqlalchemy import Enum as SAEnum


def string_enum(enum_cls: type[PyEnum], length: int = 20) -> SAEnum:
    """Store an Enum by its value as a validated VARCHAR (portable, readable in SQLite)."""
    return SAEnum(
        enum_cls,
        values_callable=lambda cls: [member.value for member in cls],
        native_enum=False,
        length=length,
        validate_strings=True,
    )
