# PaymentsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**approvePayment**](PaymentsApi.md#approvepayment) | **POST** /payments/{id}/approve | Approve Payment |
| [**cancelPayment**](PaymentsApi.md#cancelpayment) | **POST** /payments/{id}/cancel | Cancel Payment |
| [**createPayment**](PaymentsApi.md#createpayment) | **POST** /payments | Create Payment |
| [**getPayment**](PaymentsApi.md#getpayment) | **GET** /payments/{id}/payment-intents/{intentId} | Get Payment |



## approvePayment

> ApprovePayment200Response approvePayment(id, paymentApprove)

Approve Payment

Approve a payment, allowing it to proceed.

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { ApprovePaymentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PaymentsApi();

  const body = {
    // string | Unique identifier for the payment to be approved
    id: id_example,
    // PaymentApprove
    paymentApprove: ...,
  } satisfies ApprovePaymentRequest;

  try {
    const data = await api.approvePayment(body);
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
| **id** | `string` | Unique identifier for the payment to be approved | [Defaults to `undefined`] |
| **paymentApprove** | [PaymentApprove](PaymentApprove.md) |  | |

### Return type

[**ApprovePayment200Response**](ApprovePayment200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The request has succeeded. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## cancelPayment

> CancelPayment200Response cancelPayment(id, paymentCancel)

Cancel Payment

Cancel a pending payment

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { CancelPaymentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PaymentsApi();

  const body = {
    // string | Unique identifier for the payment to be cancelled
    id: id_example,
    // PaymentCancel
    paymentCancel: ...,
  } satisfies CancelPaymentRequest;

  try {
    const data = await api.cancelPayment(body);
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
| **id** | `string` | Unique identifier for the payment to be cancelled | [Defaults to `undefined`] |
| **paymentCancel** | [PaymentCancel](PaymentCancel.md) |  | |

### Return type

[**CancelPayment200Response**](CancelPayment200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The request has succeeded. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createPayment

> PaymentCreateResponse createPayment(paymentCreate)

Create Payment

Create a payment for a sender\&#39;s account.

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { CreatePaymentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PaymentsApi();

  const body = {
    // PaymentCreate | Payment creation details
    paymentCreate: ...,
  } satisfies CreatePaymentRequest;

  try {
    const data = await api.createPayment(body);
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
| **paymentCreate** | [PaymentCreate](PaymentCreate.md) | Payment creation details | |

### Return type

[**PaymentCreateResponse**](PaymentCreateResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | The request has succeeded and a payment has been created as a result. |  -  |
| **404** | Wallet address not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPayment

> Payment getPayment(intentId, id)

Get Payment

Retrieve details of a specific payment by its ID within a payment intent.

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '';
import type { GetPaymentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PaymentsApi();

  const body = {
    // string | Unique identifier for the payment intent
    intentId: intentId_example,
    // string | Unique identifier for the payment
    id: id_example,
  } satisfies GetPaymentRequest;

  try {
    const data = await api.getPayment(body);
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
| **intentId** | `string` | Unique identifier for the payment intent | [Defaults to `undefined`] |
| **id** | `string` | Unique identifier for the payment | [Defaults to `undefined`] |

### Return type

[**Payment**](Payment.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The request has succeeded. |  -  |
| **404** | Payment not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

