# Rafiki POC

This repository contains a Proof of Concept (PoC) project that explores a new payment flow for Rafiki.

It is intended for experimental purposes only.

## Usage

Prepare correct Node.

```shell
nvm install
nvm use
```

Build and start POC.

```shell
corepack enable
# Install & Build:
pnpm i
pnpm build
```

Full build and install:

```shell
pnpm i && pnpm -r build
```

Once ready, run test.

```shell
pnpm test
```

## Docker-Compose

#### Build:

Start the containers up with 3 command handlers and 2 api instances.

```shell
docker compose up -d --build --scale=backend=3 --scale=api=2
```

Then you can run the benchmark as follows:

```shell
k6 run benchmark.js
```

You can monitor performance results on the Grafana dashboard at:
http://localhost:4501/d/aeg4uh40kdl34d/rafiki-poc?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s

You can monitor Kafka processing on the Redpanda dashboard at:
http://localhost:8080

Inspect the logs:

```shell
docker-compose logs -f backend
```

Shut down and clear images and volumes:

```shell
docker-compose down --volumes --rmi all
```

### Docker

`docker compose -f docker/docker-compose.yaml up`
