# Remote Outgoing Payment - Sending

```mermaid
sequenceDiagram
	autonumber

    participant AAPI as Admin API
    participant PBC as Payments BC
    participant PAL as PAL BC
    participant ILPBC as ILP BC
    participant Peer as Peer / ILP Network

    AAPI ->> PBC: Approve payment send
    PBC ->> PBC: Determine remote payment needed
    PBC ->> PBC: Publish remote payment send approved event

    PBC ->> AAPI: Return payment status

    PAL -->> PBC: Read remote payment send approved event
    PAL ->> PAL: Resolve peer & reserve funds
    PAL ->> PAL: Publish peer liquidity transfer reserved event

    ILPBC -->> PAL: Read peer liquidity transfer reserved event
    ILPBC ->> ILPBC: Store packet correlation & expiry
    ILPBC ->> Peer: Send prepare packet
    Peer -->> ILPBC: Receive fulfill/reject packet
    ILPBC ->> ILPBC: Publish payment confirmed/rejected event

    PBC -->> ILPBC: Read remote payment confirmed/rejected event
    PBC ->> PBC: Mark payment complete/failed
    PBC ->> PBC: Publish remote payment send completed/failed event

    PAL -->> PBC: Read payment send completed/failed event
    PAL ->> PAL: Finalize/void liquidity transfer

```

# Notes

- Should we mark the outgoing remote payment as completed/failed _after_ the PAL BC finalizes or voids the liquidity transfer? Or should we be optimisic? What is a "pending" transfer in the first place?
