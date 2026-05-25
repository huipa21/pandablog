-- ============ CLEANUP LEGACY TABLES & FIELDS ============
REMOVE TABLE IF EXISTS asset;
REMOVE TABLE IF EXISTS media;
REMOVE TABLE IF EXISTS concept;
REMOVE TABLE IF EXISTS mentions;
REMOVE FIELD IF EXISTS content_json ON post;
REMOVE FIELD IF EXISTS content_text ON post;
REMOVE INDEX IF EXISTS post_content_fts ON post;

-- ============ ANALYZER ============
DEFINE ANALYZER IF NOT EXISTS blog_analyzer TOKENIZERS blank, class FILTERS lowercase, ascii;

-- ============ POST (metadata only — block content lives in `block` table) ============
DEFINE TABLE IF NOT EXISTS post SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS title ON post TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON post TYPE string;
DEFINE FIELD IF NOT EXISTS summary ON post TYPE option<string>;
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
DEFINE INDEX IF NOT EXISTS post_title_fts ON TABLE post COLUMNS title FULLTEXT ANALYZER blog_analyzer BM25 HIGHLIGHTS;
DEFINE INDEX IF NOT EXISTS post_summary_fts ON TABLE post COLUMNS summary FULLTEXT ANALYZER blog_analyzer BM25 HIGHLIGHTS;

DEFINE TABLE IF NOT EXISTS tag SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON tag TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON tag TYPE string;
DEFINE INDEX IF NOT EXISTS tag_slug_unique ON TABLE tag COLUMNS slug UNIQUE;

DEFINE TABLE IF NOT EXISTS category SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON category TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON category TYPE string;
DEFINE FIELD IF NOT EXISTS description ON category TYPE option<string>;
DEFINE INDEX IF NOT EXISTS category_slug_unique ON TABLE category COLUMNS slug UNIQUE;

DEFINE TABLE IF NOT EXISTS tagged TYPE RELATION FROM post TO tag;
DEFINE TABLE IF NOT EXISTS categorized_as TYPE RELATION FROM post TO category;

-- ============ BLOCK (top-level Tiptap node, one row per block) ============
DEFINE TABLE OVERWRITE block SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS type ON block TYPE string;
DEFINE FIELD IF NOT EXISTS node ON block TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS text ON block TYPE string DEFAULT '';
DEFINE FIELD IF NOT EXISTS content_hash ON block TYPE string DEFAULT '';
DEFINE FIELD IF NOT EXISTS created_at ON block TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON block TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS block_type ON block FIELDS type;
DEFINE INDEX IF NOT EXISTS block_text_fts ON TABLE block COLUMNS text FULLTEXT ANALYZER blog_analyzer BM25 HIGHLIGHTS;

-- ============ HAS_BLOCKS (post -> block edge with sequence) ============
DEFINE TABLE IF NOT EXISTS has_blocks TYPE RELATION FROM post TO block SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS seq ON has_blocks TYPE int;
DEFINE INDEX IF NOT EXISTS has_blocks_in_seq ON TABLE has_blocks FIELDS in, seq;
DEFINE INDEX IF NOT EXISTS has_blocks_out ON TABLE has_blocks FIELDS out;

-- ============ LINKS (post -> post bidirectional relation) ============
DEFINE TABLE IF NOT EXISTS links TYPE RELATION FROM post TO post SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS created_at ON links TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS links_in ON TABLE links FIELDS in;
DEFINE INDEX IF NOT EXISTS links_out ON TABLE links FIELDS out;

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

-- ============ HASH-BASED FILE LIBRARY ============
DEFINE TABLE IF NOT EXISTS folder SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON folder TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON folder TYPE string;
DEFINE FIELD IF NOT EXISTS parent ON folder TYPE option<record<folder>> DEFAULT NONE;
DEFINE FIELD IF NOT EXISTS created_at ON folder TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON folder TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS folder_slug_unique ON TABLE folder FIELDS slug UNIQUE;
DEFINE INDEX IF NOT EXISTS folder_parent ON TABLE folder FIELDS parent;

DEFINE TABLE OVERWRITE files SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS hash ON files TYPE string;
DEFINE FIELD IF NOT EXISTS original_name ON files TYPE string;
DEFINE FIELD IF NOT EXISTS stored_name ON files TYPE string;
DEFINE FIELD IF NOT EXISTS mime_type ON files TYPE string;
DEFINE FIELD IF NOT EXISTS size ON files TYPE int;
DEFINE FIELD IF NOT EXISTS extension ON files TYPE string;
DEFINE FIELD IF NOT EXISTS uploaded_at ON files TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON files TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS comment ON files TYPE option<string> DEFAULT NONE;
DEFINE FIELD IF NOT EXISTS is_image ON files TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS image_meta ON files TYPE option<object> FLEXIBLE DEFAULT NONE;
DEFINE FIELD IF NOT EXISTS folders ON files TYPE array<record<folder>> DEFAULT [];
DEFINE FIELD IF NOT EXISTS tags ON files TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS reference_count ON files TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS referenced_by ON files TYPE array<record> DEFAULT [];
DEFINE FIELD IF NOT EXISTS original_path ON files TYPE string;
DEFINE FIELD IF NOT EXISTS variants ON files TYPE option<object> FLEXIBLE DEFAULT NONE;
DEFINE FIELD IF NOT EXISTS perceptual_hash ON files TYPE option<string> DEFAULT NONE;
DEFINE FIELD IF NOT EXISTS uploaded_by ON files TYPE option<string> DEFAULT NONE;
DEFINE FIELD OVERWRITE storage_path ON files TYPE option<string> DEFAULT NONE;
DEFINE FIELD OVERWRITE thumbnail_path ON files TYPE option<string> DEFAULT NONE;
DEFINE INDEX IF NOT EXISTS files_hash_unique ON TABLE files FIELDS hash UNIQUE;
DEFINE INDEX IF NOT EXISTS files_original_name_fts ON TABLE files COLUMNS original_name FULLTEXT ANALYZER blog_analyzer BM25 HIGHLIGHTS;
DEFINE INDEX IF NOT EXISTS files_comment_fts ON TABLE files COLUMNS comment FULLTEXT ANALYZER blog_analyzer BM25 HIGHLIGHTS;
DEFINE INDEX IF NOT EXISTS files_uploaded_at ON TABLE files FIELDS uploaded_at;
DEFINE INDEX IF NOT EXISTS files_mime_type ON TABLE files FIELDS mime_type;
DEFINE INDEX IF NOT EXISTS files_is_image ON TABLE files FIELDS is_image;
DEFINE INDEX IF NOT EXISTS files_reference_count ON TABLE files FIELDS reference_count;

-- ============ MEDIA TAGS ============
-- File tags are stored independently in files.tags and are not shared with post tags.

-- ============ SMART FOLDERS ============
DEFINE TABLE OVERWRITE media_smart_folder SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON media_smart_folder TYPE string;
DEFINE FIELD IF NOT EXISTS filters ON media_smart_folder TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS created_at ON media_smart_folder TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON media_smart_folder TYPE datetime DEFAULT time::now();

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
DEFINE TABLE OVERWRITE access_logs SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS timestamp ON access_logs TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS method ON access_logs TYPE string;
DEFINE FIELD IF NOT EXISTS path ON access_logs TYPE string;
DEFINE FIELD IF NOT EXISTS status_code ON access_logs TYPE int;
DEFINE FIELD IF NOT EXISTS response_time_ms ON access_logs TYPE int;
DEFINE FIELD IF NOT EXISTS ip ON access_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS user_agent ON access_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS request_id ON access_logs TYPE option<string>;
DEFINE FIELD OVERWRITE query_params ON access_logs TYPE option<object> FLEXIBLE;
DEFINE FIELD IF NOT EXISTS referrer ON access_logs TYPE option<string>;
DEFINE INDEX IF NOT EXISTS access_logs_timestamp_desc ON access_logs FIELDS timestamp;
DEFINE INDEX IF NOT EXISTS access_logs_path ON access_logs FIELDS path;
DEFINE INDEX IF NOT EXISTS access_logs_status_code ON access_logs FIELDS status_code;

-- ============ ACTIVITY LOGS ============
DEFINE TABLE OVERWRITE activity_logs SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS timestamp ON activity_logs TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS action ON activity_logs TYPE string;
DEFINE FIELD IF NOT EXISTS resource_type ON activity_logs TYPE string;
DEFINE FIELD IF NOT EXISTS resource_id ON activity_logs TYPE option<string>;
DEFINE FIELD OVERWRITE metadata ON activity_logs TYPE option<object> FLEXIBLE;
DEFINE FIELD IF NOT EXISTS ip ON activity_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS request_id ON activity_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS description ON activity_logs TYPE option<string>;
DEFINE INDEX IF NOT EXISTS activity_logs_timestamp_desc ON activity_logs FIELDS timestamp;
DEFINE INDEX IF NOT EXISTS activity_logs_action ON activity_logs FIELDS action;

-- ============ ERROR LOGS ============
DEFINE TABLE OVERWRITE error_logs SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS timestamp ON error_logs TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS level ON error_logs TYPE string ASSERT $value IN ['debug', 'info', 'warn', 'error'];
DEFINE FIELD IF NOT EXISTS message ON error_logs TYPE string;
DEFINE FIELD IF NOT EXISTS stack ON error_logs TYPE option<string>;
DEFINE FIELD OVERWRITE context ON error_logs TYPE option<object> FLEXIBLE;
DEFINE FIELD IF NOT EXISTS request_id ON error_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS path ON error_logs TYPE option<string>;
DEFINE FIELD IF NOT EXISTS method ON error_logs TYPE option<string>;
DEFINE INDEX IF NOT EXISTS error_logs_timestamp_desc ON error_logs FIELDS timestamp;
DEFINE INDEX IF NOT EXISTS error_logs_level ON error_logs FIELDS level;
