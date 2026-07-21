
# PaymentIntentCreate

Schema for creating a new payment intent.

## Properties

Name | Type
------------ | -------------
`id` | string
`walletAddress` | string
`incomingAmount` | number
`expiresAt` | Date
`metadata` | string

## Example

```typescript
import type { PaymentIntentCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "walletAddress": null,
  "incomingAmount": null,
  "expiresAt": null,
  "metadata": null,
} satisfies PaymentIntentCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PaymentIntentCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


