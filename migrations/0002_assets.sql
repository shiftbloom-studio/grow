-- Small binary assets that are generated, not committed (e.g. the social preview image).
CREATE TABLE IF NOT EXISTS assets (
  name TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
