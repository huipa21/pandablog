DEFINE TABLE IF NOT EXISTS post SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS title ON post TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON post TYPE string;
DEFINE FIELD IF NOT EXISTS summary ON post TYPE option<string>;
DEFINE FIELD OVERWRITE content_json ON post TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS content_text ON post TYPE string DEFAULT '';
DEFINE FIELD IF NOT EXISTS status ON post TYPE string DEFAULT 'draft' ASSERT $value IN ['draft', 'published', 'archived'];
DEFINE FIELD IF NOT EXISTS cover_image ON post TYPE option<string>;
DEFINE FIELD IF NOT EXISTS author_username ON post TYPE string DEFAULT 'admin';
DEFINE FIELD IF NOT EXISTS published_at ON post TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS created_at ON post TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON post TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS view_count ON post TYPE int DEFAULT 0;
DEFINE INDEX IF NOT EXISTS post_slug_unique ON TABLE post COLUMNS slug UNIQUE;
DEFINE INDEX IF NOT EXISTS post_status ON TABLE post COLUMNS status;
DEFINE INDEX IF NOT EXISTS post_published_at ON TABLE post COLUMNS published_at;

DEFINE TABLE IF NOT EXISTS tag SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON tag TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON tag TYPE string;
DEFINE INDEX IF NOT EXISTS tag_slug_unique ON TABLE tag COLUMNS slug UNIQUE;

DEFINE TABLE IF NOT EXISTS category SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON category TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON category TYPE string;
DEFINE FIELD IF NOT EXISTS description ON category TYPE option<string>;
DEFINE INDEX IF NOT EXISTS category_slug_unique ON TABLE category COLUMNS slug UNIQUE;

DEFINE TABLE IF NOT EXISTS concept SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON concept TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON concept TYPE string;
DEFINE FIELD IF NOT EXISTS description ON concept TYPE option<string>;
DEFINE INDEX IF NOT EXISTS concept_slug_unique ON TABLE concept COLUMNS slug UNIQUE;

DEFINE TABLE IF NOT EXISTS asset SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS filename ON asset TYPE string;
DEFINE FIELD IF NOT EXISTS path ON asset TYPE string;
DEFINE FIELD IF NOT EXISTS url ON asset TYPE string;
DEFINE FIELD IF NOT EXISTS mime ON asset TYPE string;
DEFINE FIELD IF NOT EXISTS size_bytes ON asset TYPE int;
DEFINE FIELD IF NOT EXISTS width ON asset TYPE option<int>;
DEFINE FIELD IF NOT EXISTS height ON asset TYPE option<int>;
DEFINE FIELD IF NOT EXISTS hash ON asset TYPE string;
DEFINE FIELD IF NOT EXISTS uploaded_by ON asset TYPE string;
DEFINE FIELD IF NOT EXISTS uploaded_at ON asset TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS asset_hash_unique ON TABLE asset COLUMNS hash UNIQUE;

DEFINE TABLE IF NOT EXISTS tagged TYPE RELATION FROM post TO tag;
DEFINE TABLE IF NOT EXISTS categorized_as TYPE RELATION FROM post TO category;
DEFINE TABLE IF NOT EXISTS mentions TYPE RELATION FROM post TO concept SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS context ON mentions TYPE option<string>;
DEFINE TABLE IF NOT EXISTS post_reference TYPE RELATION FROM post TO post SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS context ON post_reference TYPE option<string>;

DEFINE ANALYZER IF NOT EXISTS blog_analyzer TOKENIZERS blank, class FILTERS lowercase, ascii;
DEFINE INDEX IF NOT EXISTS post_title_fts ON TABLE post COLUMNS title FULLTEXT ANALYZER blog_analyzer BM25 HIGHLIGHTS;
DEFINE INDEX IF NOT EXISTS post_summary_fts ON TABLE post COLUMNS summary FULLTEXT ANALYZER blog_analyzer BM25 HIGHLIGHTS;
DEFINE INDEX IF NOT EXISTS post_content_fts ON TABLE post COLUMNS content_text FULLTEXT ANALYZER blog_analyzer BM25 HIGHLIGHTS;

-- ============ POST VISIBILITY (additions to existing post table) ============
DEFINE FIELD IF NOT EXISTS visibility ON post TYPE string DEFAULT 'public' ASSERT $value IN ['public', 'private', 'password'];
DEFINE FIELD IF NOT EXISTS password_hash ON post TYPE option<string> DEFAULT NONE;
DEFINE FIELD IF NOT EXISTS password_hint ON post TYPE option<string> DEFAULT NONE;
DEFINE INDEX IF NOT EXISTS post_visibility ON TABLE post FIELDS visibility;

-- ============ APP SETTING for site-wide mode ============
-- Active key: 'site_visibility' with value 'public' | 'private'. Default: 'public'.

-- ============ APP SETTINGS (key-value store) ============
DEFINE TABLE IF NOT EXISTS app_setting SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS key ON app_setting TYPE string;
DEFINE FIELD IF NOT EXISTS value ON app_setting TYPE any;
DEFINE FIELD IF NOT EXISTS updated_at ON app_setting TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS app_setting_key ON app_setting FIELDS key UNIQUE;

-- ============ MEDIA LIBRARY ============
DEFINE TABLE IF NOT EXISTS media SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS original_name ON media TYPE string;
DEFINE FIELD IF NOT EXISTS extension ON media TYPE string;
DEFINE FIELD IF NOT EXISTS mime_type ON media TYPE string;
DEFINE FIELD IF NOT EXISTS size ON media TYPE int;
DEFINE FIELD IF NOT EXISTS hash ON media TYPE string;
DEFINE FIELD IF NOT EXISTS path ON media TYPE string;
DEFINE FIELD IF NOT EXISTS url ON media TYPE string;
DEFINE FIELD IF NOT EXISTS width ON media TYPE option<int>;
DEFINE FIELD IF NOT EXISTS height ON media TYPE option<int>;
DEFINE FIELD IF NOT EXISTS thumbnail_path ON media TYPE option<string>;
DEFINE FIELD IF NOT EXISTS perceptual_hash ON media TYPE option<string>;
DEFINE FIELD IF NOT EXISTS created_at ON media TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS media_hash_idx ON media FIELDS hash UNIQUE;

-- ============ LOGGING SETTINGS ============
DEFINE TABLE IF NOT EXISTS logging_settings SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS enabled ON logging_settings TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS debug_enabled ON logging_settings TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS debug_override_prod ON logging_settings TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS access_log_enabled ON logging_settings TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS activity_log_enabled ON logging_settings TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS error_log_enabled ON logging_settings TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS log_level ON logging_settings TYPE string DEFAULT 'info' ASSERT $value IN ['debug', 'info', 'warn', 'error'];
DEFINE FIELD IF NOT EXISTS excluded_paths ON logging_settings TYPE array<string> DEFAULT ['/_nuxt', '/favicon', '/api/admin/logs'];
DEFINE FIELD IF NOT EXISTS excluded_status_codes ON logging_settings TYPE array<int> DEFAULT [];
DEFINE FIELD IF NOT EXISTS redact_fields ON logging_settings TYPE array<string> DEFAULT ['password', 'token', 'authorization', 'cookie'];
DEFINE FIELD IF NOT EXISTS retention_access_days ON logging_settings TYPE int DEFAULT 30;
DEFINE FIELD IF NOT EXISTS retention_activity_days ON logging_settings TYPE int DEFAULT 365;
DEFINE FIELD IF NOT EXISTS retention_error_days ON logging_settings TYPE int DEFAULT 90;
DEFINE FIELD IF NOT EXISTS max_metadata_size_kb ON logging_settings TYPE int DEFAULT 50;
DEFINE FIELD IF NOT EXISTS sampling_rate ON logging_settings TYPE float DEFAULT 1.0;
DEFINE FIELD IF NOT EXISTS console_output ON logging_settings TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS cleanup_enabled ON logging_settings TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS cleanup_cron ON logging_settings TYPE string DEFAULT '0 3 * * *';
DEFINE FIELD IF NOT EXISTS updated_at ON logging_settings TYPE datetime DEFAULT time::now();

-- ============ ACCESS LOGS ============
DEFINE TABLE IF NOT EXISTS access_logs SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS timestamp ON access_logs TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS method ON access_logs TYPE string;
DEFINE FIELD IF NOT EXISTS path ON access_logs TYPE string;
DEFINE FIELD IF NOT EXISTS status_code ON access_logs TYPE int;
DEFINE FIELD IF NOT EXISTS response_time_ms ON access_logs TYPE int;
DEFINE FIELD IF NOT EXISTS ip ON access_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS user_agent ON access_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS request_id ON access_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS query_params ON access_logs TYPE option<object>;
DEFINE FIELD IF NOT EXISTS referrer ON access_logs TYPE option<string>;
DEFINE INDEX IF NOT EXISTS access_logs_timestamp_desc ON access_logs FIELDS timestamp;
DEFINE INDEX IF NOT EXISTS access_logs_path ON access_logs FIELDS path;
DEFINE INDEX IF NOT EXISTS access_logs_status_code ON access_logs FIELDS status_code;

-- ============ ACTIVITY LOGS ============
DEFINE TABLE IF NOT EXISTS activity_logs SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS timestamp ON activity_logs TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS action ON activity_logs TYPE string;
DEFINE FIELD IF NOT EXISTS resource_type ON activity_logs TYPE string;
DEFINE FIELD IF NOT EXISTS resource_id ON activity_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metadata ON activity_logs TYPE option<object>;
DEFINE FIELD IF NOT EXISTS ip ON activity_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS request_id ON activity_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS description ON activity_logs TYPE option<string>;
DEFINE INDEX IF NOT EXISTS activity_logs_timestamp_desc ON activity_logs FIELDS timestamp;
DEFINE INDEX IF NOT EXISTS activity_logs_action ON activity_logs FIELDS action;

-- ============ ERROR LOGS ============
DEFINE TABLE IF NOT EXISTS error_logs SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS timestamp ON error_logs TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS level ON error_logs TYPE string ASSERT $value IN ['debug', 'info', 'warn', 'error'];
DEFINE FIELD IF NOT EXISTS message ON error_logs TYPE string;
DEFINE FIELD IF NOT EXISTS stack ON error_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS context ON error_logs TYPE option<object>;
DEFINE FIELD IF NOT EXISTS request_id ON error_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS path ON error_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS method ON error_logs TYPE option<string>;
DEFINE INDEX IF NOT EXISTS error_logs_timestamp_desc ON error_logs FIELDS timestamp;
DEFINE INDEX IF NOT EXISTS error_logs_level ON error_logs FIELDS level;