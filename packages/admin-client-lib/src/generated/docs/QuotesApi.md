# QuotesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createQuote**](QuotesApi.md#createquote) | **POST** /quotes | Create Quote |



## createQuote

> Quote createQuote(quoteCreate)

Create Quote

Create a quote for a payment intent.

### Example

```ts
import {
  Configuration,
  QuotesApi,
} from '';
import type { CreateQuoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new QuotesApi();

  const body = {
    // QuoteCreate | Quote creation details
    quoteCreate: ...,
  } satisfies CreateQuoteRequest;

  try {
    const data = await api.createQuote(body);
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
| **quoteCreate** | [QuoteCreate](QuoteCreate.md) | Quote creation details | |

### Return type

[**Quote**](Quote.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | The request has succeeded and a quote has been created as a result. |  -  |
| **400** | Either paymentIntentId or paymentIntentUrl is required. |  -  |
| **404** | Wallet address not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

