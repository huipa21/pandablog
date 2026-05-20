DEFINE TABLE IF NOT EXISTS folder SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON folder TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON folder TYPE string;
DEFINE FIELD IF NOT EXISTS parent ON folder TYPE option<record<folder>> DEFAULT NONE;
DEFINE FIELD IF NOT EXISTS created_at ON folder TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON folder TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS folder_slug_unique ON TABLE folder FIELDS slug UNIQUE;
DEFINE INDEX IF NOT EXISTS folder_parent ON TABLE folder FIELDS parent;