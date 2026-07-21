
# LiquidityDepositRequest


## Properties

Name | Type
------------ | -------------
`assetCode` | string
`peerId` | string
`amount` | number

## Example

```typescript
import type { LiquidityDepositRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "assetCode": USD,
  "peerId": null,
  "amount": 100000,
} satisfies LiquidityDepositRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as LiquidityDepositRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


