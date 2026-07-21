
# AssetCreate

Schema for creating a new asset.

## Properties

Name | Type
------------ | -------------
`code` | string
`scale` | number

## Example

```typescript
import type { AssetCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "code": null,
  "scale": null,
} satisfies AssetCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AssetCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


