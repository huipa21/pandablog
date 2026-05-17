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