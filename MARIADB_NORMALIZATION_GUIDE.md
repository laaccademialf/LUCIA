# MariaDB Normalization Guide (from JSON payload tables)

This project currently stores collection data in generic tables like `lucia_assets` with shape:
- `id` (PK)
- `payload` (JSON)
- `created_at`, `updated_at`

That is great for migration speed, but for reporting/performance you should normalize gradually.

## 1) Strategy (recommended)

1. Keep writes in current JSON tables first.
2. Build normalized tables in parallel.
3. Backfill from `payload` JSON.
4. Validate row counts and critical sums.
5. Switch reads to normalized tables/views.
6. Switch writes to normalized tables.
7. Keep JSON tables as rollback snapshot for 1-2 releases.

## 2) Priority Order

1. `restaurants` (reference/master table)
2. `users` (auth/profile joins)
3. `assets` (largest business value)
4. `serviceRequests`
5. Secondary modules (`checklist*`, `product*`, `team*`, `asset* dictionaries`)

## 3) Example Normalized Schema

Use this starter SQL:

```sql
-- 3.1 Restaurants
CREATE TABLE IF NOT EXISTS restaurants_norm (
  id VARCHAR(255) PRIMARY KEY,
  reg_number VARCHAR(64) NULL,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(500) NULL,
  city VARCHAR(128) NULL,
  country VARCHAR(128) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  KEY idx_restaurants_reg_number (reg_number),
  KEY idx_restaurants_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3.2 Users
CREATE TABLE IF NOT EXISTS users_norm (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) NULL,
  display_name VARCHAR(255) NULL,
  role VARCHAR(64) NULL,
  work_role VARCHAR(128) NULL,
  restaurant_id VARCHAR(255) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  KEY idx_users_email (email),
  KEY idx_users_restaurant (restaurant_id),
  CONSTRAINT fk_users_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES restaurants_norm(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3.3 Assets
CREATE TABLE IF NOT EXISTS assets_norm (
  id VARCHAR(255) PRIMARY KEY,
  inv_number VARCHAR(128) NULL,
  name VARCHAR(500) NULL,
  category VARCHAR(255) NULL,
  subcategory VARCHAR(255) NULL,
  restaurant_id VARCHAR(255) NULL,
  responsible_person VARCHAR(255) NULL,
  initial_cost DECIMAL(18,2) NULL,
  residual_value DECIMAL(18,2) NULL,
  status VARCHAR(128) NULL,
  condition_name VARCHAR(128) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  KEY idx_assets_inv_number (inv_number),
  KEY idx_assets_restaurant (restaurant_id),
  KEY idx_assets_category (category),
  CONSTRAINT fk_assets_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES restaurants_norm(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3.4 Service requests
CREATE TABLE IF NOT EXISTS service_requests_norm (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(500) NULL,
  status VARCHAR(128) NULL,
  priority VARCHAR(64) NULL,
  restaurant_id VARCHAR(255) NULL,
  assignee_id VARCHAR(255) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  KEY idx_sr_status (status),
  KEY idx_sr_restaurant (restaurant_id),
  CONSTRAINT fk_sr_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES restaurants_norm(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_sr_assignee FOREIGN KEY (assignee_id)
    REFERENCES users_norm(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 4) Backfill from `payload` JSON

```sql
-- Restaurants
INSERT INTO restaurants_norm (id, reg_number, name, address, city, country, created_at, updated_at)
SELECT
  id,
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.regNumber')),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.name')), id),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.address')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.city')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.country')),
  STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.createdAt')), '%Y-%m-%dT%H:%i:%s.%fZ'),
  STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.updatedAt')), '%Y-%m-%dT%H:%i:%s.%fZ')
FROM lucia_restaurants
ON DUPLICATE KEY UPDATE
  reg_number = VALUES(reg_number),
  name = VALUES(name),
  address = VALUES(address),
  city = VALUES(city),
  country = VALUES(country),
  updated_at = VALUES(updated_at);

-- Users
INSERT INTO users_norm (id, email, display_name, role, work_role, restaurant_id, created_at, updated_at)
SELECT
  id,
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.email')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.displayName')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.role')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.workRole')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.restaurant')),
  STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.createdAt')), '%Y-%m-%dT%H:%i:%s.%fZ'),
  STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.updatedAt')), '%Y-%m-%dT%H:%i:%s.%fZ')
FROM lucia_users
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  display_name = VALUES(display_name),
  role = VALUES(role),
  work_role = VALUES(work_role),
  restaurant_id = VALUES(restaurant_id),
  updated_at = VALUES(updated_at);

-- Assets
INSERT INTO assets_norm (
  id, inv_number, name, category, subcategory, restaurant_id,
  responsible_person, initial_cost, residual_value, status, condition_name,
  created_at, updated_at
)
SELECT
  id,
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.invNumber')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.name')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.category')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.subcategory')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.restaurantId')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.responsiblePerson')),
  CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.initialCost')) AS DECIMAL(18,2)),
  CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.residualValue')) AS DECIMAL(18,2)),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.condition')),
  STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.createdAt')), '%Y-%m-%dT%H:%i:%s.%fZ'),
  STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.updatedAt')), '%Y-%m-%dT%H:%i:%s.%fZ')
FROM lucia_assets
ON DUPLICATE KEY UPDATE
  inv_number = VALUES(inv_number),
  name = VALUES(name),
  category = VALUES(category),
  subcategory = VALUES(subcategory),
  restaurant_id = VALUES(restaurant_id),
  responsible_person = VALUES(responsible_person),
  initial_cost = VALUES(initial_cost),
  residual_value = VALUES(residual_value),
  status = VALUES(status),
  condition_name = VALUES(condition_name),
  updated_at = VALUES(updated_at);

-- Service requests
INSERT INTO service_requests_norm (
  id, title, status, priority, restaurant_id, assignee_id, created_at, updated_at
)
SELECT
  id,
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.title')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.priority')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.restaurantId')),
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.assigneeId')),
  STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.createdAt')), '%Y-%m-%dT%H:%i:%s.%fZ'),
  STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.updatedAt')), '%Y-%m-%dT%H:%i:%s.%fZ')
FROM lucia_serviceRequests
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  status = VALUES(status),
  priority = VALUES(priority),
  restaurant_id = VALUES(restaurant_id),
  assignee_id = VALUES(assignee_id),
  updated_at = VALUES(updated_at);
```

## 5) Data Validation Checklist

Run these checks before switching reads:

```sql
SELECT (SELECT COUNT(*) FROM lucia_restaurants) AS src, (SELECT COUNT(*) FROM restaurants_norm) AS norm;
SELECT (SELECT COUNT(*) FROM lucia_users) AS src, (SELECT COUNT(*) FROM users_norm) AS norm;
SELECT (SELECT COUNT(*) FROM lucia_assets) AS src, (SELECT COUNT(*) FROM assets_norm) AS norm;
SELECT (SELECT COUNT(*) FROM lucia_serviceRequests) AS src, (SELECT COUNT(*) FROM service_requests_norm) AS norm;
```

Also verify business-critical totals:

```sql
SELECT SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.initialCost')) AS DECIMAL(18,2))) AS src_sum FROM lucia_assets;
SELECT SUM(initial_cost) AS norm_sum FROM assets_norm;
```

## 6) Cutover Pattern (safe)

1. Keep current write path for 1 release, normalize in batch every 5-15 minutes.
2. Switch read APIs one module at a time (`restaurants`, then `users`, then `assets`).
3. After stable period, switch writes to normalized tables and keep JSON mirror (optional).
4. Remove JSON dependency only after rollback window closes.

## 7) Practical Notes for this repo

- Generic table naming from the server is `lucia_<collectionName>`.
- For collection names with dashes, server converts `-` to `_` in table name.
- If some JSON keys differ in your live data, adjust `JSON_EXTRACT(payload, '$.<path>')` accordingly.
