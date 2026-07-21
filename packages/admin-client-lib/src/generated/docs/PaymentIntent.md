
# PaymentIntent

Represents a payment intent which defines a destination and amount for incoming payments.

## Properties

Name | Type
------------ | -------------
`id` | string
`state` | [PaymentIntentState](PaymentIntentState.md)
`destination` | string
`walletAddress` | string
`incomingAmount` | [Amount](Amount.md)
`receivedAmount` | [Amount](Amount.md)
`expiresAt` | Date
`destinationIlpAddress` | string

## Example

```typescript
import type { PaymentIntent } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "state": null,
  "destination": null,
  "walletAddress": null,
  "incomingAmount": null,
  "receivedAmount": null,
  "expiresAt": null,
  "destinationIlpAddress": null,
} satisfies PaymentIntent

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PaymentIntent
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


