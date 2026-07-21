# AssetsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createAsset**](AssetsApi.md#createasset) | **POST** /assets | Create Asset |



## createAsset

> AssetCreateResponse createAsset(assetCreate)

Create Asset

Create a new asset.

### Example

```ts
import {
  Configuration,
  AssetsApi,
} from '';
import type { CreateAssetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AssetsApi();

  const body = {
    // AssetCreate | Asset creation details
    assetCreate: ...,
  } satisfies CreateAssetRequest;

  try {
    const data = await api.createAsset(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **assetCreate** | [AssetCreate](AssetCreate.md) | Asset creation details | |

### Return type

[**AssetCreateResponse**](AssetCreateResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | The request has succeeded and an asset has been created as a result. |  -  |
| **409** | Asset already exists. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

