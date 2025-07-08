## Install prerequisites

```bash
# create namespaces
kubectl apply -f namespaces.yaml

# Install CertManager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.18.2/cert-manager.yaml

# Install Monitoring components
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml

# Install kafka CRD
kubectl create -f 'https://strimzi.io/install/latest?namespace=kafka' -n kafka

# You can install the latest operator manifest for this minor release as follows:
kubectl apply --server-side -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.25/releases/cnpg-1.25.2.yaml

# install nginx ingress controller operator
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml

# Build docker images
sh ./build.sh
```


## Running infrastructure
```bash
kubectl apply -f monitoring/opentelemetry.yaml


# Install infrastructure components
kubectl apply -f infrastructure/kafka
kubectl apply -f infrastructure/postgresql
kubectl apply -f infrastructure/tigerbeetl
```

## Database tables
Connect to PostgreSQL and create the tables for the `payments` and `liquidity` databases:
```bash
\c liquidity

CREATE TABLE IF NOT EXISTS asset_accounts (
  id UUID PRIMARY KEY NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  settlement_account_id UUID NOT NULL,
  liquidity_account_id UUID NOT NULL
);

CREATE TABLE IF NOT EXISTS peer_accounts (
  id UUID PRIMARY KEY NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  liquidity_account_id UUID NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_address_accounts (
  id UUID PRIMARY KEY NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  liquidity_account_id UUID NOT NULL
);

\c payments

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY NOT NULL,
  code TEXT NOT NULL,
  scale SMALLINT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_addresses (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL
);

CREATE TABLE IF NOT EXISTS ilp_peers (
  id TEXT PRIMARY KEY NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  address TEXT NOT NULL,
  connector_url TEXT NOT NULL,
  callback_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS remote_incoming_payments (
  id TEXT PRIMARY KEY NOT NULL,
  ilp_destination_address TEXT NOT NULL,
  ilp_shared_secret TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incoming_payments (
  id TEXT PRIMARY KEY NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  incoming_amount BIGINT,
  received_amount BIGINT NOT NULL,
  state TEXT NOT NULL,
  wallet_address_id TEXT NOT NULL
--   FOREIGN KEY (wallet_address_id) REFERENCES wallet_addresses(id)
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY NOT NULL,
  receive_amount_value BIGINT NOT NULL,
  receive_amount_asset_code TEXT NOT NULL,
  receive_amount_asset_scale INT NOT NULL,
  debit_amount_value BIGINT NOT NULL,
  debit_amount_asset_code TEXT NOT NULL,
  debit_amount_asset_scale INT NOT NULL,
  sender_wallet_address_id TEXT NOT NULL,
  incoming_payment_id TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  exchange_rate NUMERIC NOT NULL
--   FOREIGN KEY (sender_wallet_address_id) REFERENCES wallet_addresses(id)
);

CREATE TABLE IF NOT EXISTS outgoing_payments (
  id TEXT PRIMARY KEY NOT NULL,
  quote_id TEXT,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  state TEXT NOT NULL,
  sent_amount BIGINT NOT NULL,
  debit_amount BIGINT NOT NULL,
  local_incoming_payment_id TEXT,
  remote_incoming_payment_url TEXT,
  sender_wallet_address_id TEXT NOT NULL
--   FOREIGN KEY (sender_wallet_address_id) REFERENCES wallet_addresses(id)
);

CREATE TABLE IF NOT EXISTS incoming_micro_payments (
  id TEXT PRIMARY KEY NOT NULL,
  incoming_payment_id TEXT NOT NULL,
  method TEXT NOT NULL,
  ilp_peer_id TEXT,
  request_id TEXT NOT NULL,
  amount BIGINT NOT NULL
--   FOREIGN KEY (incoming_payment_id) REFERENCES incoming_payments(id),
--   FOREIGN KEY (ilp_peer_id) REFERENCES ilp_peers(id)
);

CREATE TABLE IF NOT EXISTS outgoing_micro_payments (
  id TEXT PRIMARY KEY NOT NULL,
  outgoing_payment_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('LOCAL', 'ILP')),
  ilp_peer_id TEXT,
  request_id TEXT NOT NULL,
  amount BIGINT NOT NULL
--   FOREIGN KEY (outgoing_payment_id) REFERENCES outgoing_payments(id),
--   FOREIGN KEY (ilp_peer_id) REFERENCES ilp_peers(id)
);

CREATE TABLE IF NOT EXISTS asset_accounts (
  id UUID PRIMARY KEY NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  settlement_account_id UUID NOT NULL,
  liquidity_account_id UUID NOT NULL
);

CREATE TABLE IF NOT EXISTS peer_accounts (
  id UUID PRIMARY KEY NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  liquidity_account_id UUID NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_address_accounts (
  id UUID PRIMARY KEY NOT NULL,
  asset_code TEXT NOT NULL,
  asset_scale INT NOT NULL,
  liquidity_account_id UUID NOT NULL
);
```

## Running services
```bash
kubectl apply -f poc-services
```
