CREATE DATABASE "liquidity-service";
\c liquidity-service

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
