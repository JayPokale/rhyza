// controller.ts
//
// The RECONCILE LOOP — the core of the operator.
//
// Reconcile means: "look at what the user declared they want (the CRD spec),
// look at what currently exists in Kubernetes, and make them match."
//
// This function is called by the informer (index.ts) whenever a RafikiInstance
// resource is created, modified, or needs re-syncing. It is idempotent:
// running it multiple times has the same effect as running it once.

import * as k8s from '@kubernetes/client-node';
import { RafikiInstanceSpec } from './types.js';
import {
  mongodbStatefulSet,
  mongodbService,
  redisStatefulSet,
  redisService,
  kafkaStatefulSet,
  kafkaService
} from './manifests/infrastructure.js';
import { kafkaInitJob } from './manifests/kafkaInit.js';
import { allAppServices } from './manifests/appServices.js';
// import { openPaymentsIngress } from './manifests/ingress.js';
import {
  otelCollectorDeployment,
  otelCollectorService,
  prometheusDeployment,
  prometheusService,
  tempoDeployment,
  tempoService,
  grafanaDeployment,
  grafanaService,
  redpandaConsoleDeployment,
  redpandaConsoleService
} from './manifests/observability.js';
import {
  KubernetesHelpers,
} from './helpers';
import {
  createExternalGatewayRoutes,
  createExternalGateway
} from './manifests/gateway-and-routes';
import {
  ObjectCoreV1Api,
  ObjectCustomObjectsApi
} from '@kubernetes/client-node/dist/gen/types/ObjectParamAPI';

// ---------------------------------------------------------------------------
// Main reconcile function
// ---------------------------------------------------------------------------



