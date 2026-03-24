# Project Structure & Guidelines

Each bounded context (BC) is comprised of the following packages:

### `[bc]-domain-lib`

The core layer containing the business logic. It should be pure and have no external dependencies, dealing only with interfaces. This layer is not concerned with actual implementations (i.e. it does not concern itself with _how_ things are stored, for example.)

#### Entities

- Encapsulate both state, behavior and business rules (invariants).
- Use `private` fields for state to ensure proper encapsulation.
- Use static `create()` for new instances (with validation) and `fromObject(obj)` for rebuilding (rehydrating) existing ones (e.g. when fetching from a repository).
- Provide a `toObject()` method to convert the entity to a plain object (e.g. for storing into a DB).

#### Aggregates

- In our system, the aggregate is typically the entry point into a domain logic flow.
- An aggregate is a cluster of entities that can be treated as a single unit for data changes. It defines a boundary within which business rules (invariants) must be strictly enforced.
- Every aggregate has a single root entity. All access to the objects within the aggregate must go through this root. Outside objects should only hold a reference to the Root Entity's ID.
- Aggregates can process a batch of commands and output "Domain Events" (for publishing to an events topic).
- Repositories operate at the aggregate level. Storing or fetching an aggregate involves the entire cluster of objects within its boundary. Aggregates should manage "flushing" or "storing" their changes to the persistence layer via repository interfaces.

#### Domain Services

- Used when logic doesn't naturally belong to a single entity or aggregate.
- Often used to coordinate or encapsulate multiple aggregates (e.g., `WalletDomainService` orchestrating `WalletAddress` and `WalletAddressAlias`), and enforce cross-aggregate business rules (invariants).
- Should be stateless, they operate on aggregates which hold the state.

#### Testing

- Entities and Aggregates should be unit tested.
- External dependencies (such as repositories and services) should be mocked using their interfaces to keep tests isolated and fast.

### `[bc]-client-lib`

A client for the bounded context provides an entry way into the BC, which other BCs can implement and call.

### `[bc]-public-types`

Contains types for the client of the BC, as well as the events that the BC publishes. This will also contain the proto files for the internal API service that clients will call.

### `[bc]-api-service`

An internal API that the BC's client will make requests to. Currently, these services are using gRPC by default.

### `[bc]-command-handler-service`

A service that consumes messages from the commands topic in the BC, and calls the domain-lib to process the commands.

### `[bc]-event-hander-service`

A service that listens to events from other BCs, and publishes commands for the command hander to process.

### `[bc]-implementations-lib`

The actual implementations for repositories, caching, message producing/consuming, etc.
