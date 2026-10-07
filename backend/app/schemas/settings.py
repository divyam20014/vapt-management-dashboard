from pydantic import BaseModel


class AppSettingsRead(BaseModel):
    app_name: str
    version: str
    database_engine: str
    database_location: str
    upload_location: str
    export_location: str
    max_upload_size_mb: int
    allowed_extensions: list[str]
