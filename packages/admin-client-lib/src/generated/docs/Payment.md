
# Payment

Represents a payment

## Properties

Name | Type
------------ | -------------
`id` | string
`state` | [PaymentState](PaymentState.md)
`senderWalletAddress` | string
`assetCode` | string
`assetScale` | number
`quoteId` | string
`debitAmount` | string
`receiveAmount` | string
`sentAmount` | string

## Example

```typescript
import type { Payment } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "state": null,
  "senderWalletAddress": null,
  "assetCode": null,
  "assetScale": null,
  "quoteId": null,
  "debitAmount": null,
  "receiveAmount": null,
  "sentAmount": null,
} satisfies Payment

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Payment
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


