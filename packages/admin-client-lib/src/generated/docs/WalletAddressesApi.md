# WalletAddressesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createWalletAddress**](WalletAddressesApi.md#createwalletaddress) | **POST** /wallet-addresses | Create Wallet Address |



## createWalletAddress

> WalletAddressCreateResponse createWalletAddress(walletAddressCreate)

Create Wallet Address

Create a new wallet address.

### Example

```ts
import {
  Configuration,
  WalletAddressesApi,
} from '';
import type { CreateWalletAddressRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WalletAddressesApi();

  const body = {
    // WalletAddressCreate | Wallet address creation details
    walletAddressCreate: ...,
  } satisfies CreateWalletAddressRequest;

  try {
    const data = await api.createWalletAddress(body);
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
| **walletAddressCreate** | [WalletAddressCreate](WalletAddressCreate.md) | Wallet address creation details | |

### Return type

[**WalletAddressCreateResponse**](WalletAddressCreateResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | The request has succeeded and a wallet address been created as a result. |  -  |
| **409** | Wallet address already exists. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

