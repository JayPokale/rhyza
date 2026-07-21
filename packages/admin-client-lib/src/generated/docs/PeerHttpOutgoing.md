
# PeerHttpOutgoing

Connector settings for sending ILP packets to this peer.

## Properties

Name | Type
------------ | -------------
`endpoint` | string
`authToken` | string

## Example

```typescript
import type { PeerHttpOutgoing } from ''

// TODO: Update the object below with actual values
const example = {
  "endpoint": null,
  "authToken": null,
} satisfies PeerHttpOutgoing

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PeerHttpOutgoing
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


