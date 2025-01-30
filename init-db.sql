CREATE TABLE IF NOT EXISTS wallet_addresses (
  id UUID PRIMARY KEY NOT NULL,
  url VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  asset_code VARCHAR(20) NOT NULL,
  asset_scale INT NOT NULL
);
