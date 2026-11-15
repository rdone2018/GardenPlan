-- GardenPlan tables (server.js creates them automatically on start; this file is for reference / manual setup).
-- Each row keeps the whole object as JSON in `data`; the other columns are copies for browsing and queries.

CREATE TABLE IF NOT EXISTS gardens (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL DEFAULT '',
  owner      VARCHAR(255) NOT NULL DEFAULT '',
  data       LONGTEXT     NOT NULL CHECK (JSON_VALID(data)),
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plants (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  name_cs    VARCHAR(255) NOT NULL DEFAULT '',
  name_sk    VARCHAR(255) NOT NULL DEFAULT '',
  name_en    VARCHAR(255) NOT NULL DEFAULT '',
  name_la    VARCHAR(255) NOT NULL DEFAULT '',
  type       VARCHAR(32)  NOT NULL DEFAULT '',
  data       LONGTEXT     NOT NULL CHECK (JSON_VALID(data)),
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_plants_la (name_la),
  KEY idx_plants_cs (name_cs)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A plant planted in a garden (position, status, grid cells, dates…)
CREATE TABLE IF NOT EXISTS placements (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  garden_id  VARCHAR(32)  NULL,
  plant_id   VARCHAR(32)  NULL,
  status     VARCHAR(16)  NOT NULL DEFAULT '',
  data       LONGTEXT     NOT NULL CHECK (JSON_VALID(data)),
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_placements_garden (garden_id),
  KEY idx_placements_plant (plant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipment (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  garden_id  VARCHAR(32)  NULL,
  name       VARCHAR(255) NOT NULL DEFAULT '',
  kind       VARCHAR(32)  NOT NULL DEFAULT '',
  data       LONGTEXT     NOT NULL CHECK (JSON_VALID(data)),
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  garden_id  VARCHAR(32)  NULL,
  title      VARCHAR(255) NOT NULL DEFAULT '',
  data       LONGTEXT     NOT NULL CHECK (JSON_VALID(data)),
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Photos of plants and gardens, kept out of `data` so loading the app stays fast (served by /api/photo/kind/id)
CREATE TABLE IF NOT EXISTS photos (
  kind       VARCHAR(16)  NOT NULL,
  id         VARCHAR(32)  NOT NULL,
  mime       VARCHAR(32)  NOT NULL DEFAULT 'image/jpeg',
  img        LONGBLOB     NOT NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-gardener values: settings (language…), ticked-off calendar tasks, data version
CREATE TABLE IF NOT EXISTS meta (
  k          VARCHAR(32)  NOT NULL PRIMARY KEY,
  data       LONGTEXT     NOT NULL CHECK (JSON_VALID(data)),
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- gardeners, users and sign-in ----------
-- Every data table above also has gardener_id (added by database.js, first in its primary key): each row belongs to
-- one gardener. A gardener (name, contact, country) can have several users who sign in with their e-mail.
CREATE TABLE IF NOT EXISTS gardeners (
  id         VARCHAR(40)  NOT NULL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL DEFAULT '',
  contact    VARCHAR(200) NOT NULL DEFAULT '',
  email      VARCHAR(200) NOT NULL DEFAULT '',
  country    VARCHAR(2)   NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Passwords only as scrypt hashes. is_guest: may only look at the gardener's data. is_admin: the admin console.
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(48)  NOT NULL PRIMARY KEY,
  gardener_id   VARCHAR(40)  NOT NULL,
  email         VARCHAR(200) NOT NULL,
  name          VARCHAR(120) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  is_admin      TINYINT(1)   NOT NULL DEFAULT 0,
  is_guest      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL,
  UNIQUE KEY users_email (email),
  KEY users_gardener (gardener_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sign-in sessions: only a hash of the token in the browser's cookie is kept.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64)    NOT NULL PRIMARY KEY,
  user_id    VARCHAR(48) NOT NULL,
  expires_at DATETIME    NOT NULL,
  KEY sessions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ISO country codes a gardener can choose from (filled by countries.js while empty)
CREATE TABLE IF NOT EXISTS countries (
  code VARCHAR(2)   NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
