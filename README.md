# Rafiki v2

This repository contains Rafiki’s new architecture: a suite of performant, horizontally scalable services that enable Account Servicing Entities (ASEs) to provide Interledger and Open Payments functionality to their users.

## Project Architecture

The project follows a modular architecture based on **Domain-Driven Design (DDD)**, where each **Bounded Context (BC)** is split into several packages to ensure a separation of concerns.

- [Project Structure & Guidelines](./internal-docs/Structure%20&%20Guidelines.md)
- [Project Structure Diagram](./internal-docs/diagrams/structure.png)
- [Architecture Diagram](./internal-docs/diagrams/architecture.png)
- [Sequence Diagrams](./internal-docs/sequence-diagrams/)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (use [nvm](https://github.com/nvm-sh/nvm) for version management)
- [pnpm](https://pnpm.io/)
- [Docker](https://www.docker.com/)

### Installation & Build

1. **Set up Node version**:

   ```shell
   nvm install
   nvm use
   ```

2. **Initialize git submodule**:
   This repository uses a git submodule for Open Payments specifications located at `open-payments-specifications/`.

   ```shell
   git submodule update --init --recursive
   ```

3. **Enable corepack and install dependencies**:

   ```shell
   corepack enable
   pnpm install
   ```

4. **Build the project**:
   ```shell
   pnpm -r build
   ```

### Running Tests

To run the full test suite:

```shell
pnpm test
```

## Running with Docker Compose

The easiest way to run the entire stack is using Docker Compose.

```shell
pnpm docker compose up -d --build
```

### Monitoring & Dashboards

Once the services are running, you can monitor them at:

- **Grafana**: [http://localhost:4501](http://localhost:4501)
- **Redpanda (Kafka Console)**: [http://localhost:8080](http://localhost:8080)

### Benchmarking

To run a performance benchmark using [k6](https://k6.io/):

```shell
k6 run benchmark.js
```

### Cleanup

To stop and remove all containers, volumes, and images:

```shell
pnpm docker down --volumes --rmi all
```
