export interface AppSettings {
  app_name: string;
  version: string;
  database_engine: string;
  database_location: string;
  upload_location: string;
  export_location: string;
  max_upload_size_mb: number;
  allowed_extensions: string[];
}
