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

CREATE TABLE IF NOT EXISTS incoming_payments (
  id UUID PRIMARY KEY NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  asset_code VARCHAR(20) NOT NULL,
  asset_scale INT NOT NULL,
  incoming_amount BIGINT,
  received_amount BIGINT NOT NULL,
  state VARCHAR(255) NOT NULL,
  wallet_address_id UUID NOT NULL,
  -- micro_payments TEXT NOT NULL,
  FOREIGN KEY (wallet_address_id) REFERENCES wallet_addresses(id)
);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY NOT NULL,
  receive_amount_value BIGINT NOT NULL,
  receive_amount_asset_code VARCHAR(20) NOT NULL,
  receive_amount_asset_scale INT NOT NULL,
  debit_amount_value BIGINT NOT NULL,
  debit_amount_asset_code VARCHAR(20) NOT NULL,
  debit_amount_asset_scale INT NOT NULL,
  sender_wallet_address_id UUID NOT NULL,
  incoming_payment_id UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  exchange_rate NUMERIC NOT NULL,
  FOREIGN KEY (sender_wallet_address_id) REFERENCES wallet_addresses(id),
  FOREIGN KEY (incoming_payment_id) REFERENCES incoming_payments(id)
);

CREATE TABLE IF NOT EXISTS outgoing_payments (
  id UUID PRIMARY KEY NOT NULL,
  quote_id UUID NOT NULL,
  asset_code VARCHAR(20) NOT NULL,
  asset_scale INT NOT NULL,
  state VARCHAR(255) NOT NULL,
  sent_amount BIGINT NOT NULL,
  debit_amount BIGINT NOT NULL,
  local_incoming_payment_id UUID,
  remote_incoming_payment_url VARCHAR(255),
  sender_wallet_address_id UUID NOT NULL,
  -- micro_payments TEXT NOT NULL,
  FOREIGN KEY (sender_wallet_address_id) REFERENCES wallet_addresses(id),
  FOREIGN KEY (quote_id) REFERENCES quotes(id)
);
