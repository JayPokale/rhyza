# Remote Quote - Receiving

```mermaid
sequenceDiagram
	autonumber


    participant Peer as Peer / ILP Network
    participant ILPBC as ILP BC
    participant PBC as Payments BC
    participant PAL as PAL BC

    Peer ->> ILPBC: Quoting packet (prepare)
    ILPBC ->> ILPBC: Decode packet & determine peer
    ILPBC ->> ILPBC: Publish quote received event

    PBC -->> ILPBC: Read quote received event
    PBC ->> PBC: Fetch payment intent
    PBC ->> PAL: Fetch wallet address
    opt If payment intent asset differs from peer asset
    PBC ->> PAL: Fetch FX rates
    end
    PBC ->> PBC: Calculate quote details
    PBC ->> PBC: Publish remote quote determined event

    ILPBC -->> PBC: Read remote quote determined event
    ILPBC ->> ILPBC: Build & send reject packet (quote response)
    ILPBC ->> Peer: Quoting response (reject packet)
```
