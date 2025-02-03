CREATE TABLE IF NOT EXISTS wallet_addresses (
  id UUID PRIMARY KEY NOT NULL,
  url VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  asset_code VARCHAR(20) NOT NULL,
  asset_scale INT NOT NULL
);

CREATE TABLE IF NOT EXISTS ilp_peers (
  id UUID PRIMARY KEY NOT NULL,
  asset_code VARCHAR(20) NOT NULL,
  asset_scale INT NOT NULL,
  address VARCHAR(255) NOT NULL,
  connector_url VARCHAR(255) NOT NULL,
  callback_url VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS remote_incoming_payments (
  id UUID PRIMARY KEY NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  asset_code VARCHAR(20) NOT NULL,
  asset_scale INT NOT NULL,
  incoming_amount BIGINT,
  received_amount BIGINT NOT NULL,
  ilp_destination_address VARCHAR(255) NOT NULL,
  ilp_shared_secret VARCHAR(255) NOT NULL
);