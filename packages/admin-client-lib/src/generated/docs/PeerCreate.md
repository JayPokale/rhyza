
# PeerCreate

Schema for creating a new peer.

## Properties

Name | Type
------------ | -------------
`id` | string
`name` | string
`assetCode` | string
`assetScale` | number
`ilpStaticAddress` | string
`http` | [PeerHttp](PeerHttp.md)
`isActive` | boolean

## Example

```typescript
import type { PeerCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "name": null,
  "assetCode": null,
  "assetScale": null,
  "ilpStaticAddress": null,
  "http": null,
  "isActive": null,
} satisfies PeerCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PeerCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


