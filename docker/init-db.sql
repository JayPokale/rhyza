CREATE TABLE IF NOT EXISTS wallet_addresses (
  id UUID PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL
);

CREATE TABLE IF NOT EXISTS ilp_peers (
  id UUID PRIMARY KEY NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  address TEXT NOT NULL,
  connector_url TEXT NOT NULL,
  callback_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS remote_incoming_payments (
  id UUID PRIMARY KEY NOT NULL,
  ilp_destination_address TEXT NOT NULL,
  ilp_shared_secret TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incoming_payments (
  id UUID PRIMARY KEY NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  incoming_amount BIGINT,
  received_amount BIGINT NOT NULL,
  state TEXT NOT NULL,
  wallet_address_id UUID NOT NULL,
  FOREIGN KEY (wallet_address_id) REFERENCES wallet_addresses(id)
);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY NOT NULL,
  receive_amount_value BIGINT NOT NULL,
  receive_amount_asset_code TEXT NOT NULL,
  receive_amount_asset_scale INT NOT NULL,
  debit_amount_value BIGINT NOT NULL,
  debit_amount_asset_code TEXT NOT NULL,
  debit_amount_asset_scale INT NOT NULL,
  sender_wallet_address_id UUID NOT NULL,
  incoming_payment_id UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  exchange_rate NUMERIC NOT NULL,
  FOREIGN KEY (sender_wallet_address_id) REFERENCES wallet_addresses(id)
);

CREATE TABLE IF NOT EXISTS outgoing_payments (
  id UUID PRIMARY KEY NOT NULL,
  quote_id UUID,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  state TEXT NOT NULL,
  sent_amount BIGINT NOT NULL,
  debit_amount BIGINT NOT NULL,
  local_incoming_payment_id UUID,
  remote_incoming_payment_url TEXT,
  sender_wallet_address_id UUID NOT NULL,
  FOREIGN KEY (sender_wallet_address_id) REFERENCES wallet_addresses(id)
);

CREATE TABLE IF NOT EXISTS incoming_micro_payments (
  id UUID PRIMARY KEY NOT NULL,
  incoming_payment_id UUID NOT NULL,
  method TEXT NOT NULL,
  ilp_peer_id UUID,
  request_id TEXT NOT NULL,
  amount BIGINT NOT NULL,
  FOREIGN KEY (incoming_payment_id) REFERENCES incoming_payments(id),
  FOREIGN KEY (ilp_peer_id) REFERENCES ilp_peers(id)
);

CREATE TABLE IF NOT EXISTS outgoing_micro_payments (
  id UUID PRIMARY KEY NOT NULL,
  outgoing_payment_id UUID NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('LOCAL', 'ILP')),
  ilp_peer_id UUID,
  request_id TEXT NOT NULL,
  amount BIGINT NOT NULL,
  FOREIGN KEY (outgoing_payment_id) REFERENCES outgoing_payments(id),
  FOREIGN KEY (ilp_peer_id) REFERENCES ilp_peers(id)
);

