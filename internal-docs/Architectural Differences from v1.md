# Architectural differences from Rafiki v1

This document outlines the major architectural changes in Rafiki v2 in comparison to v1. The transition focuses on moving from a monolithic backend to a decoupled, event-driven architecture that prioritizes horizontal scalability, simplified liquidity management, and improved developer experience.

## Core Architectural Shifts

### Bounded Contexts & Services

For better decoupling and horizontal scalability, Rafiki v2 is divided into five distinct system modules (bounded contexts). Instead of a monolithic `backend` and `auth` service, functionality is split as follows:

- **Payments**: Stores, initiates, and receives payments.
- **ILP**: Handles sending and receiving ILP packets between peers.
- **PAL (Peers, Accounts, Ledger)**: Manages assets, wallet addresses, peers, and all ledger/liquidity functionality.
- **Auth**: Manages Open Payments Auth grants and access tokens.
- **Notifications**: Communicates system events to the ASE via webhook events.

![Simplified architecture](./diagrams/architecture-simplified.png)

In this architecture, the Open Payments & Admin API servers act as mostly stateless layers that translate external requests into internal commands for the relevant modules.

### Admin API

Instead of two separate GraphQL Admin APIs for `auth` and `backend`, Rafiki has a single REST Admin API server which covers all of the possible functionality of Rafiki. This simplifies ASE integration (+ documentation tooling) while also providing us the ability to automatically generate client libraries/SDKs.

The OpenAPI specifications for this API can be found [here](../packages/admin-api-service/openapi.yaml).

#### Infrastructure

##### MongoDB as default database

In addition to the different services, we have also changed our default infrastructure dependencies. By default, our database of choice is MongoDB, as 1) our data tends to be document-centric, instead of relational 2) we require high write throughput 3) we can horizontally scale natively. Technically, however, the code is structured in a way where it should be quite easy to write different implementations (e.g. PostgreSQL) for our persistence components.

##### Kafka

The event streaming platform Kafka is the foundation for our event-driven architecture. In addition to powering our custom event-sourced ledger, it enables asynchronous command-based communication across all system modules, supporting horizontal scalability and the ability to replay event streams for recovery or auditing.

##### Accounting ledger

Our accouting ledger is an event-sourcing system without requiring additional dependencies & databases (like PostgreSQL or TigerBeetle).

### Liquidity

Liquidity is simplified: it is only tracked for peers/peering relationships. There are no payment, asset or wallet address liquidity accounts. This means that if an ASE only wants to use the Open Payments functionality of Rafiki (and not any ILP functionality), they will not need to make any Admin API liquidity requests or handle any liquidity-specific webhook events.

### Assets

Assets are unique by asset code only, not by both code and scale. In the new architecture, asset scale becomes simply a display value: you could have an asset with code USD and scale 2, while a single wallet address (or a peer) could be on the same asset (USD) but with scale 9 (as an example). This is technically enabled by the fact that the ledger operates at a single, high fixed precision where all of the accounting entries are stored in a asset scale 20.

### Webhook Events

While Rafiki v2 continues to use webhooks for ASE notifications, the payload structure and event types have been updated to reflect the new language in the system modules.

- **Spec**: [Webhook OpenAPI Specification](../external-docs/webhooks.yaml).

### Multi-tenancy

Rafiki v2 is currently not multi-tenanted. A single Rafiki instance is intended to serve a single ASE, simplifying the security and resource isolation model compared to the multi-tenant approach of v1.
