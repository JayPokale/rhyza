## 0.0.0

15 changes: 3 error, 2 warning, 10 info
error	[api-path-removed-without-deprecation] at packages/admin-api-service/openapi.yaml
	in API GET /payment-intents/{intentId}/payments/{id}
		api path removed without deprecation

error	[api-path-removed-without-deprecation] at packages/admin-api-service/openapi.yaml
	in API POST /payment-intents/{intentId}/payments/{id}/approve
		api path removed without deprecation

error	[api-path-removed-without-deprecation] at packages/admin-api-service/openapi.yaml
	in API POST /payment-intents/{intentId}/payments/{id}/cancel
		api path removed without deprecation

warning	[response-property-enum-value-added] at docs/openapi/admin/admin-api.yaml
	in API GET /payment-intents/{id}
		added the new `COMPLETED` enum value to the `state` response property for the response status `200`
		Adding new enum values to a response can be unexpected for clients; use x-extensible-enum instead.

warning	[response-property-enum-value-added] at docs/openapi/admin/admin-api.yaml
	in API GET /payment-intents/{id}
		added the new `CREATED` enum value to the `state` response property for the response status `200`
		Adding new enum values to a response can be unexpected for clients; use x-extensible-enum instead.

info	[api-operation-id-removed] at packages/admin-api-service/openapi.yaml
	in API POST /assets
		api operation id `Assets_createAsset` removed and replaced with `createAsset`

info	[api-operation-id-removed] at packages/admin-api-service/openapi.yaml
	in API POST /payment-intents
		api operation id `PaymentIntents_createPaymentIntent` removed and replaced with `createPaymentIntent`

info	[api-operation-id-removed] at packages/admin-api-service/openapi.yaml
	in API GET /payment-intents/{id}
		api operation id `PaymentIntents_getPaymentIntent` removed and replaced with `getPaymentIntent`

info	[api-operation-id-removed] at packages/admin-api-service/openapi.yaml
	in API POST /payments
		api operation id `Payments_createPayment` removed and replaced with `createPayment`

info	[endpoint-added] at docs/openapi/admin/admin-api.yaml
	in API POST /payments/{id}/approve
		endpoint added

info	[endpoint-added] at docs/openapi/admin/admin-api.yaml
	in API POST /payments/{id}/cancel
		endpoint added

info	[endpoint-added] at docs/openapi/admin/admin-api.yaml
	in API GET /payments/{id}/payment-intents/{intentId}
		endpoint added

info	[api-operation-id-removed] at packages/admin-api-service/openapi.yaml
	in API POST /peers
		api operation id `Peers_createPeer` removed and replaced with `createPeer`

info	[api-operation-id-removed] at packages/admin-api-service/openapi.yaml
	in API POST /quotes
		api operation id `Quotes_createQuote` removed and replaced with `createQuote`

info	[api-operation-id-removed] at packages/admin-api-service/openapi.yaml
	in API POST /wallet-addresses
		api operation id `WalletAddresses_createWalletAddress` removed and replaced with `createWalletAddress`

