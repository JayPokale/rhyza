
# WalletAddressCreate

Schema for creating a new wallet address.

## Properties

Name | Type
------------ | -------------
`address` | string
`assetCode` | string
`publicName` | string
`isActive` | boolean

## Example

```typescript
import type { WalletAddressCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "address": null,
  "assetCode": null,
  "publicName": null,
  "isActive": null,
} satisfies WalletAddressCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WalletAddressCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


