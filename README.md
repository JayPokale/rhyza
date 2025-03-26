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
# Run (port 3000):
pnpm dev
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

## Main changes from current implementation

- Event driven
  - Decoupling domains/services (e.g. payments domain and ILP connector interact through events)
  - Workers use message queues (e.g. processing outgoing payments, webhook events)
- Accounting decoupling & improvements
  - Getting payment state, such as the amount sent or received for a payment, doesn't require trips to the accounting database. We now use a concept of "micro-payments" to store that information. Within the the ILP context, one packet = one micro-payment.
  - Avoiding creating "accounting" accounts for individual payments. For example, local payments (within the same Rafiki instance) result in transfers between wallet address accounts (instead of single-use payment liquidity accounts).


## Payments flow

The scope of the PoC is a single payment flow:

1. Creating an incoming payment
2. Creating a quote
3. Creating an outgoing payment
4. Completing the outgoing payment (whether that's a local payment, or through ILP)

### Local Payments

#### Sequence diagram

```mermaid
---
config:
  theme: base
---
sequenceDiagram
    autonumber
    participant ASE as ASE
    
    box <br>Rafiki Admin API
    participant GQL as Admin API
    end

    box Rafiki Domain
    participant PS as Payment Service
    participant LS as Liquidity Service
    end

    rect rgba(0, 0, 0, .05)
    note right of ASE: Create incoming payment
    ASE->>GQL: Create incoming payment
    GQL->>PS: Create incoming payment 
    PS->>PS: Persist incoming payment
    PS->>GQL: Return incoming payment
    GQL->>ASE: Return incoming payment
    end

    rect rgba(0, 0, 0, .05)
    note right of ASE: Create quote
    ASE->>GQL: Create quote 
    GQL->>PS: Create quote 
    PS->>PS: Fetch incoming payment
    PS->>PS: Get rates (from Rate Service)
    PS->>PS: Create quote (and persist)
    PS->>GQL: Return created quote
    GQL->>ASE: Return created Quote
    end

    rect rgba(0, 0, 0, .05)
    note right of ASE: Create outgoing payment
    ASE->>GQL: Create outgoing payment <br>(already funded)
    GQL->>PS: Create outgoing payment
    PS->>PS: Fetch quote, check status, expiry
    PS->>PS: Fetch incoming payment
    PS->>LS: Deposit <br>funds into sending wallet address
    PS->>PS: Publish outgoing payment prepared event
    GQL->>ASE: Response OK, on it
    end

    rect rgba(0, 0, 0, .05)
    note left of PS: Local outgoing payment consumer
    PS-->>PS: Receive outgoing payment prepared event
    PS->>LS: Debit sending wallet address <br>and credit receiving wallet address
    PS->>PS: Increment sent amount in outgoing payment<br>and persist
    PS->>PS: Increment received amount in incoming payment<br>and persist
    PS->>PS: Publish outgoing payment completed event
    PS->>PS: Publish incoming payment completed event

    end
```


### Remote Payments

#### Sending prepare packets

![Sending Rafiki](./img/sending.png)

#### Receiving prepare packets

![Receiving Rafiki](./img/receiving.png)

#### Sequence diagram

```mermaid
---
config:
  theme: base
---
sequenceDiagram
    autonumber
    participant SASE as Sending ASE
    
    box Sending <br>Rafiki Admin API
    participant SGQL as Sending Admin API
    end

    box Sending Rafiki Domain
    participant SPS as Payment Service
    participant SLS as Liquidity Service
    end

    box Sending Rafiki <br>Application
    participant SOP as Open Payments <br> Server
    participant SILP as ILP <br>Connector
    end

    box Receving Rafiki
    participant RILP as ILP Connector
    participant ROP as Open Payments Server
    end

    box Receving Rafiki <br> Domain
    participant RLS as Liquidity Service
    participant RPS as Payment Service
    participant RGQL as Receiving Admin API
    end

    participant RASE as Receiving ASE

    rect rgba(0, 0, 0, .05)
    note right of SASE: Create incoming payment
    SASE->>SGQL: Create incoming payment
    SGQL->>SPS: Create incoming payment 
    SPS->>ROP: Create incoming payment
    ROP->>RPS: Create incoming payment
    RPS->>RPS: Persist incoming payment
    ROP->>SPS: Response
    SPS->>SPS: Persist remote incoming payment
    end


    rect rgba(0, 0, 0, .05)
    note right of SASE: Create quote
    SASE->>SGQL: Create quote 
    SGQL->>SPS: Create quote 
    SPS->>SPS: Try to fetch remote incoming payment (assume found)
    SPS->>SILP: Start quote (rate probe)
    SILP->>RILP: Send rate probe packet
    RILP->>SILP: Accepted
    RILP-->>RPS: Rate probing packet received event
    RPS->>RPS: Get rates (from Rate Service)
    RPS-->>RILP: Rate probing packet accepted event
    RILP->>SILP: Send reject packet with amount
    SILP->>RILP: Accepted
    SILP-->>SPS: Reject rate probe packet received event (with peer & amount)
    SPS->>SPS: Create quote (and persist)
    SPS->>SGQL: Return created quote
    SGQL->>SASE: Return created Quote
    end

    rect rgba(0, 0, 0, .05)
    note right of SASE: Create outgoing payment
    SASE->>SGQL: Create outgoing payment <br>(already funded)
    SGQL->>SPS: Create outgoing payment
    SPS->>SPS: Fetch quote
    SPS->>SPS: Try fetch incoming payment (assume found)
    SPS->>SLS: Check liquidity <br>and reserve funds on sending wallet
    SPS->>SPS: Publish outgoing payment prepared event
    SPS->>SGQL: Respond OK, on it
    SGQL->>SASE: Response OK, on it
    end

    rect rgba(0, 0, 0, .05)
    note right of SASE: Outgoing payment worker<br>(outgoing payment prepared event)
    SPS-->>SILP: Outgoing payment prepared event
    loop
    SILP->>RILP: Send prepare packet
    RILP->>SILP: Prepare packet accepted
    RILP-->>RPS: Prepare packet received event (with peerId)
    RPS->>RPS: Fetch incoming payment & check and validate it
    note over RPS, RLS: FX involved if<br> peering asset != incoming payment asset
    RPS->>RLS: Credit receiving wallet address<br> debit peer account
    RPS->>RPS: Check if incoming payment completed<br>publish event if so
    RPS-->>RILP: Prepare packet accepted event <br> (with peerId, and whether incoming payment is completed)
    RILP->>SILP: Send fulfill packet
    SILP->>RILP: Accepted
    SILP-->>SPS: Fulfill packet received event (with peer & partial amount)
    SPS->>SPS: Fetch outgoing payment
    note over SPS, SLS: FX involved if<br> peering asset != outgoing payment asset
    SPS->>SLS: Debit wallet address <br>and credit peer for fulfilled amount
    SPS->>SPS: Increment sent amount in outgoing payment<br>and persist
    SPS->>SPS: Check if outgoing payment is completed, publish event if so
    end

    end
```



