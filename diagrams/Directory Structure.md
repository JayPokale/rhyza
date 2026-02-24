```
// General structure
*-public-types: contains all of the published events that other BCs can import
*-client: a published client that can be used by other BCs
*-api-service: an internal API (that the client uses)
*-domain-lib: The business logic of the BC, the core layer. Does not have any dependencies (and has abstractions of client as well)
*-command-handler-service: a service that processes commands in the BC
*-event-hander-service: a service that listens to events from other BCs and publishes commands on the command handler service
*-implementations-lib: the implementations for repositories, caching, etc.

// Payments BC
payments-public-types
payments-api-service
payments-client
payments-command-handler-service
payments-domain-lib
payments-event-handler-service
payments-implementations-lib

// PAL BC
pal-public-types
pal-api-service
pal-command-handler-service
pal-domain-lib
pal-event-handler-service
pal-client
pal-implementations-lib

// ILP BC
ilp-public-types
ilp-api-service
ilp-command-handler-service
ilp-domain-lib
ilp-event-handler-service
ilp-implementations-lib

// Auth BC
auth-client
auth-public-types -> contains events
auth-api-service
auth-command-handler-service
auth-domain-lib
auth-event-handler-service
auth-implementations-lib

// Notifications BC
notifications-event-handler-service
notifications-command-handler-service
notifications-api-service

// Supporting
admin-api-service
admin-client // optional

open-payments-resource-service
open-payments-auth-service
```
