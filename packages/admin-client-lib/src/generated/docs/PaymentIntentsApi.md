# PaymentIntentsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createPaymentIntent**](PaymentIntentsApi.md#createpaymentintent) | **POST** /payment-intents | Create Payment Intent |
| [**getPaymentIntent**](PaymentIntentsApi.md#getpaymentintent) | **GET** /payment-intents/{id} | Get Payment Intent |



## createPaymentIntent

> PaymentIntentCreateResponse createPaymentIntent(paymentIntentCreate)

Create Payment Intent

Create a new payment intent for a receiver\&#39;s account.

### Example

```ts
import {
  Configuration,
  PaymentIntentsApi,
} from '';
import type { CreatePaymentIntentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PaymentIntentsApi();

  const body = {
    // PaymentIntentCreate | Payment intent creation details
    paymentIntentCreate: ...,
  } satisfies CreatePaymentIntentRequest;

  try {
    const data = await api.createPaymentIntent(body);
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
| **paymentIntentCreate** | [PaymentIntentCreate](PaymentIntentCreate.md) | Payment intent creation details | |

### Return type

[**PaymentIntentCreateResponse**](PaymentIntentCreateResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | The request has succeeded and a payment intent has been created as a result. |  -  |
| **404** | Wallet address not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPaymentIntent

> PaymentIntent getPaymentIntent(id)

Get Payment Intent

Retrieve details of a specific payment intent by its unique identifier.

### Example

```ts
import {
  Configuration,
  PaymentIntentsApi,
} from '';
import type { GetPaymentIntentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PaymentIntentsApi();

  const body = {
    // string | Unique identifier for the payment intent
    id: id_example,
  } satisfies GetPaymentIntentRequest;

  try {
    const data = await api.getPaymentIntent(body);
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
| **id** | `string` | Unique identifier for the payment intent | [Defaults to `undefined`] |

### Return type

[**PaymentIntent**](PaymentIntent.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The request has succeeded. |  -  |
| **404** | Payment intent not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

