# LiquidityApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**liquidityDeposit**](LiquidityApi.md#liquiditydepositoperation) | **POST** /liquidity/deposit | Deposit Liquidity |



## liquidityDeposit

> LiquidityDeposit202Response liquidityDeposit(liquidityDepositRequest)

Deposit Liquidity

Deposit liquidity so the node can send payments. Debits the asset system account and credits the peer\&#39;s ASE liquidity account by producing a ledger PostTransaction command. Fire-and-forget: returns 202 before the ledger posts the transaction (see the sync TODO in the route).

### Example

```ts
import {
  Configuration,
  LiquidityApi,
} from '';
import type { LiquidityDepositOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new LiquidityApi();

  const body = {
    // LiquidityDepositRequest | Deposit details
    liquidityDepositRequest: ...,
  } satisfies LiquidityDepositOperationRequest;

  try {
    const data = await api.liquidityDeposit(body);
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
| **liquidityDepositRequest** | [LiquidityDepositRequest](LiquidityDepositRequest.md) | Deposit details | |

### Return type

[**LiquidityDeposit202Response**](LiquidityDeposit202Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **202** | Deposit accepted and produced to the ledger (not yet confirmed). |  -  |
| **400** | Missing required fields. |  -  |
| **404** | Asset or peer not found, or missing ledger accounts. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

