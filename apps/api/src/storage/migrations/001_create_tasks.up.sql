CREATE TABLE tasks (
  id          TEXT    PRIMARY KEY NOT NULL,
  text        TEXT    NOT NULL CHECK(length(text) BETWEEN 1 AND 500),
  completed   INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
