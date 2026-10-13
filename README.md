<img width="1807" height="769" alt="rhyza copy" src="./docs/src/assets/light-logo.svg" />

# Rhyza

## What is Rhyza?

Rhyza is an open source suite of performant, horizontally scalable services that enable financial service providers (FSPs) to provide Interledger and Open Payments functionality to their users.

## New to Interledger?

Never heard of Interledger before or would you like to learn more? Here are some excellent places to start:

- [Interledger Website](https://interledger.org/)
- [Interledger Specs](https://interledger.org/developers/get-started/)
- [Interledger Explainer Video](https://twitter.com/Interledger/status/1567916000074678272)
- [Open Payments](https://openpayments.dev/)
- [Web Monetization](https://webmonetization.org/)

## Contributing

Please read the [contribution guidelines](.github/contributing.md) before submitting contributions. All contributions must adhere to our [code of conduct](.github/code_of_conduct.md).

## Community Calls

Our Rhyza community calls are open to our community members. We have them every third Tuesday at 14:30 UTC, via Google Meet.

**Google Meet joining info**

Video call link: https://meet.google.com/sms-fwny-ezc

Or dial: (GB) +44 20 3956 0467 PIN: 140 111 239#

More phone numbers: https://tel.meet/sms-fwny-ezc?pin=5321780226087

[Add to Google Calendar](https://calendar.google.com/calendar/event?action=TEMPLATE&tmeid=c2Uyc21oaGNla3M5cDFsbTgwcWR2a2x2bGRfMjAyNjA3MjFUMTQzMDAwWiBjX2NqMDI3Z21oc3VqazkxZXZpMjRkOXB2bXQ0QGc&tmsrc=c_cj027gmhsujk91evi24d9pvmt4%40group.calendar.google.com&scp=ALL)

## Local development environment

### Prerequisites

- [Node.js](https://nodejs.org/) (use [nvm](https://github.com/nvm-sh/nvm) for version management)
- [pnpm](https://pnpm.io/)
- [Docker](https://www.docker.com/)

### Installation and build

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

### Cleanup

To stop and remove all containers, volumes, and images:

```shell
pnpm docker down --volumes --rmi all
```

---

## Project Architecture

The project follows a modular architecture based on **Domain-Driven Design (DDD)**, where each **Bounded Context (BC)** is split into several packages to ensure a separation of concerns.

- [Project Structure & Guidelines](./dev-docs/Structure%20&%20Guidelines.md)
- [Project Structure Diagram](./dev-docs/diagrams/structure.png)
- [Architecture Diagram](./dev-docs/diagrams/architecture.png)
- [Sequence Diagrams](./dev-docs/sequence-diagrams/)

