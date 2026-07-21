
# QuoteCreate

Schema for creating a payment quote.

## Properties

Name | Type
------------ | -------------
`id` | string
`walletAddress` | string
`paymentIntentId` | string
`paymentIntentUrl` | string
`debitAmount` | string
`receiveAmount` | string

## Example

```typescript
import type { QuoteCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "walletAddress": null,
  "paymentIntentId": null,
  "paymentIntentUrl": null,
  "debitAmount": null,
  "receiveAmount": null,
} satisfies QuoteCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as QuoteCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


