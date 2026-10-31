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

-- App-wide values: settings (language…), ticked-off calendar tasks, data version
CREATE TABLE IF NOT EXISTS meta (
  k          VARCHAR(32)  NOT NULL PRIMARY KEY,
  data       LONGTEXT     NOT NULL CHECK (JSON_VALID(data)),
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
