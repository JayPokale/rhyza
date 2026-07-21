
# Quote

Represents a payment quote with estimated amounts and exchange rates.

## Properties

Name | Type
------------ | -------------
`id` | string
`paymentIntentId` | string
`senderWalletAddress` | string
`senderWalletAddressId` | string
`expiresAt` | Date
`debitAmount` | string
`receiveAmount` | string
`exchangeRate` | number

## Example

```typescript
import type { Quote } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "paymentIntentId": null,
  "senderWalletAddress": null,
  "senderWalletAddressId": null,
  "expiresAt": null,
  "debitAmount": null,
  "receiveAmount": null,
  "exchangeRate": null,
} satisfies Quote

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Quote
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


