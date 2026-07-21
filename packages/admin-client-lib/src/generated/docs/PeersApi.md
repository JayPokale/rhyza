# PeersApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createPeer**](PeersApi.md#createpeer) | **POST** /peers | Create Peer |



## createPeer

> PeerCreateResponse createPeer(peerCreate)

Create Peer

Create a new ILP peer. Creates the peer in both PAL (asset, settlement, static ILP address) and ILP (connector transport config) with the same peer id.

### Example

```ts
import {
  Configuration,
  PeersApi,
} from '';
import type { CreatePeerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeersApi();

  const body = {
    // PeerCreate | Peer creation details
    peerCreate: ...,
  } satisfies CreatePeerRequest;

  try {
    const data = await api.createPeer(body);
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
| **peerCreate** | [PeerCreate](PeerCreate.md) | Peer creation details | |

### Return type

[**PeerCreateResponse**](PeerCreateResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | The request has succeeded and a peer has been created as a result. |  -  |
| **409** | Peer already exists. |  -  |
| **502** | Peer was created in PAL but ILP connector configuration failed; the PAL peer has been deactivated. Retry the request. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

