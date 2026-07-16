// manifests/appServices.ts
//
// Factory functions for all Rafiki-v2 application-layer Deployments
// and their Kubernetes Services.
//
// WHY Deployment (not StatefulSet)?
//   Application services are stateless — they keep their state in MongoDB,
//   Kafka, or Redis, not in local disk. Any pod can be replaced safely.
//   Deployments handle rolling updates and replica scaling automatically.
//
// DEPENDENCY HANDLING (initContainers):
//   Docker Compose has `depends_on` with `condition: service_healthy`.
//   Kubernetes has no built-in equivalent. We use initContainers — a special
//   container that runs to completion BEFORE the main container starts.
//   The initContainer polls the dependency until it responds, then exits 0.

import * as k8s from '@kubernetes/client-node';
import { RafikiInstanceSpec } from '../types.js';
import { KubernetesHelpers } from '../helpers';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Image name for a Rafiki-v2 package, e.g. "ghcr.io/.../admin-api-service:latest" */
function image(spec: RafikiInstanceSpec, packageName: string): string {
  return `${spec.imageRegistry}-${packageName}:${spec.imageTag}`;
}

/**
 * An initContainer that waits for a TCP port to be open.
 * Uses busybox's nc (netcat) — available in most minimal container images.
 *
 * This replaces docker-compose's `depends_on: condition: service_healthy`.
 */
function waitForTcp(name: string, host: string, port: number): k8s.V1Container {
  return {
    name: `wait-for-${name}`,
    image: 'busybox:1.36',
    command: [
      'sh',
      '-c',
      `until nc -z ${host} ${port}; do echo "Waiting for ${host}:${port}..."; sleep 2; done`
    ]
  };
}

/**
 * An initContainer that waits for a Kafka Job labelled app=init-kafka
 * to have status.succeeded >= 1, by polling kubectl.
 *
 * NOTE: This approach requires giving the ServiceAccount permission to
 * read Jobs. An alternative is to just wait for the topic to become
 * listable via kafkacat, but this is cleaner.
 */
function waitForKafkaInit(namespace: string): k8s.V1Container {
  return {
    name: 'wait-for-kafka-init',
    image: 'bitnami/kubectl:latest',
    command: [
      'sh',
      '-c',
      `until kubectl -n ${namespace} get job init-kafka -o jsonpath='{.status.succeeded}' | grep -q 1; do echo "Waiting for Kafka init job..."; sleep 5; done`
    ]
  };
}

/** MongoDB URL from a Secret. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mongoUrl(spec: RafikiInstanceSpec): k8s.V1EnvVar {
  return {
    name: 'MONGODB_URL',
    value: `mongodb://root:$(MONGO_PASSWORD)@mongodb:27017`
  };
}

/** MongoDB password env var, sourced from the integrator-supplied Secret. */
function mongoPasswordEnv(spec: RafikiInstanceSpec): k8s.V1EnvVar {
  const { name, key } = spec.mongoPasswordSecretRef;
  return {
    name: 'MONGO_PASSWORD',
    valueFrom: { secretKeyRef: { name, key } }
  };
}

/** Kafka URL — the INTERNAL listener inside the cluster. */
const kafkaUrl: k8s.V1EnvVar = { name: 'KAFKA_URL', value: 'kafka:19092' };

/** Redis URL. */
const redisUrl: k8s.V1EnvVar = { name: 'REDIS_URL', value: 'redis:6379' };

/**
 * Creates a minimal ClusterIP Service for an app service.
 * If ports is empty, no Service is created (internal workers with no ports).
 */
function makeService(
  name: string,
  namespace: string,
  ports: Array<{ port: number; targetPort: number }>
): k8s.V1Service | null {
  if (ports.length === 0) return null;
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name, namespace, labels: { app: name } },
    spec: {
      type: 'ClusterIP',
      selector: { app: name },
      ports: ports.map((p) => ({
        port: p.port
      }))
    }
  };
}

// ---------------------------------------------------------------------------
// Result type: each factory returns both a Deployment and optionally a Service
// ---------------------------------------------------------------------------

export interface AppManifests {
  deployment: k8s.V1Deployment;
  service: k8s.V1Service | null;
}


// ---------------------------------------------------------------------------
// Application services
// ---------------------------------------------------------------------------

/**
 * admin-api-service
 * Ports: 3001
 * Depends on: mongodb, pal-api-service, payments-api-service
 */
export function adminApiService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'admin-api-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'admin-api-service'),
      [
        mongoPasswordEnv(spec),
        mongoUrl(spec),
        { name: 'PAL_GRPC_URL', value: 'pal-api-service:50051' },
        { name: 'PAYMENTS_GRPC_URL', value: 'payments-api-service:50052' },
        {
          name: 'OPEN_PAYMENTS_URL',
          value: 'http://open-payments-resource-service:3002'
        }
      ],
      [{ containerPort: 3001 }],
      [
        waitForTcp('mongodb', 'mongodb', 27017),
        waitForTcp('pal-api-service', 'pal-api-service', 50051),
        waitForTcp('payments-api-service', 'payments-api-service', 50052)
      ]
    ),
    service: makeService(name, namespace, [{ port: 3001, targetPort: 3001 }])
  };
}

/**
 * open-payments-resource-service
 * Ports: 3002
 * Depends on: pal-api-service, payments-api-service
 */
export function openPaymentsResourceService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'open-payments-resource-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'open-payments-resource-service'),
      [
        { name: 'PAL_GRPC_URL', value: 'pal-api-service:50051' },
        { name: 'PAYMENTS_GRPC_URL', value: 'payments-api-service:50052' },
        {
          // Baked directly into wallet address IDs as `https://${this}/...`
          // (see wallet-addresses.ts) — must equal the Ingress host exactly.
          // Falls back to the internal cluster DNS name when no public host
          // is configured (ClusterIP-only / local dev).
          name: 'OPEN_PAYMENTS_RESOURCE_SERVER_URL',
          value: spec.openPaymentsApiHost ?? 'open-payments-resource-service:3002'
        }
      ],
      [{ containerPort: 3002 }],
      [
        waitForTcp('pal-api-service', 'pal-api-service', 50051),
        waitForTcp('payments-api-service', 'payments-api-service', 50052)
      ]
    ),
    service: makeService(name, namespace, [{ port: 3002, targetPort: 3002 }])
  };
}

/**
 * pal-api-service (Payment Adaptation Layer gRPC)
 * Ports: 50051
 * Depends on: init-kafka, mongodb, redis
 */
export function palApiService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'pal-api-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'pal-api-service'),
      [
        mongoPasswordEnv(spec),
        {
          name: 'MONGO_URL',
          value: 'mongodb://root:$(MONGO_PASSWORD)@mongodb:27017/'
        },
        kafkaUrl
      ],
      [{ containerPort: 50051 }],
      [
        waitForTcp('mongodb', 'mongodb', 27017),
        waitForTcp('redis', 'redis', 6379),
        waitForKafkaInit(namespace)
      ]
    ),
    service: makeService(name, namespace, [{ port: 50051, targetPort: 50051 }])
  };
}

/**
 * pal-ledger-command-handler-service (internal worker, no port)
 * Depends on: init-kafka, kafka, redis
 */
export function palLedgerCommandHandlerService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'pal-ledger-command-handler-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'pal-ledger-command-handler-service'),
      [kafkaUrl, redisUrl],
      [],
      [waitForTcp('redis', 'redis', 6379), waitForKafkaInit(namespace)]
    ),
    service: null
  };
}

/**
 * pal-event-handler-service (internal worker, no port)
 * Depends on: init-kafka, mongodb, redis
 */
export function palEventHandlerService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'pal-event-handler-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'pal-event-handler-service'),
      [
        mongoPasswordEnv(spec),
        {
          name: 'MONGO_URL',
          value: 'mongodb://root:$(MONGO_PASSWORD)@mongodb:27017/'
        },
        kafkaUrl,
        redisUrl
      ],
      [],
      [
        waitForTcp('mongodb', 'mongodb', 27017),
        waitForTcp('redis', 'redis', 6379),
        waitForKafkaInit(namespace)
      ]
    ),
    service: null
  };
}

/**
 * payments-api-service (gRPC)
 * Ports: 50052
 * Depends on: mongodb, init-kafka
 */
export function paymentsApiService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'payments-api-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'payments-api-service'),
      [mongoPasswordEnv(spec), mongoUrl(spec), kafkaUrl],
      [{ containerPort: 50052 }],
      [waitForTcp('mongodb', 'mongodb', 27017), waitForKafkaInit(namespace)]
    ),
    service: makeService(name, namespace, [{ port: 50052, targetPort: 50052 }])
  };
}

/**
 * payments-command-handler-service (internal worker)
 * Depends on: mongodb, init-kafka, pal-api-service
 */
export function paymentsCommandHandlerService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'payments-command-handler-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'payments-command-handler-service'),
      [
        mongoPasswordEnv(spec),
        mongoUrl(spec),
        kafkaUrl,
        { name: 'PAL_GRPC_URL', value: 'pal-api-service:50051' },
        { name: 'UV_THREADPOOL_SIZE', value: '128' },
        { name: 'LOG_LEVEL', value: 'info' }
      ],
      [],
      [
        waitForTcp('mongodb', 'mongodb', 27017),
        waitForKafkaInit(namespace),
        waitForTcp('pal-api-service', 'pal-api-service', 50051)
      ]
    ),
    service: null
  };
}

/**
 * payments-event-handler-service (internal worker)
 * Depends on: init-kafka
 */
export function paymentsEventHandlerService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'payments-event-handler-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'payments-event-handler-service'),
      [kafkaUrl],
      [],
      [waitForKafkaInit(namespace)]
    ),
    service: null
  };
}

/**
 * notifications-command-handler-service
 * Ports: 5100
 * Depends on: init-kafka, mongodb
 */
export function notificationsCommandHandlerService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'notifications-command-handler-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'notifications-command-handler-service'),
      [
        mongoPasswordEnv(spec),
        mongoUrl(spec),
        kafkaUrl,
        { name: 'WEBHOOK_URL', value: spec.webhookUrl }
      ],
      [{ containerPort: 5100 }],
      [waitForTcp('mongodb', 'mongodb', 27017), waitForKafkaInit(namespace)]
    ),
    service: makeService(name, namespace, [{ port: 5100, targetPort: 5100 }])
  };
}

/**
 * notifications-event-handler-service
 * Ports: 5101
 * Depends on: mongodb, init-kafka
 */
export function notificationsEventHandlerService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'notifications-event-handler-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'notifications-event-handler-service'),
      [kafkaUrl, { name: 'UV_THREADPOOL_SIZE', value: '128' }],
      [{ containerPort: 5101 }],
      [waitForTcp('mongodb', 'mongodb', 27017), waitForKafkaInit(namespace)]
    ),
    service: makeService(name, namespace, [{ port: 5101, targetPort: 5101 }])
  };
}

/**
 * ilp-connector-service (internal worker)
 * Depends on: init-kafka
 */
export function ilpConnectorService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'ilp-connector-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      spec.replicas ?? 1,
      image(spec, 'ilp-connector-service'),
      [kafkaUrl],
      [],
      [waitForKafkaInit(namespace)]
    ),
    service: null
  };
}

/**
 * ase-mock-service (Account Servicing Entity mock for local dev)
 * Ports: 3000
 * Depends on: admin-api-service
 */
export function aseMockService(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests {
  const name = 'ase-mock-service';
  return {
    deployment: KubernetesHelpers.getInstance().makeDeployment(
      name,
      namespace,
      1, // Always 1 — it's a dev mock
      image(spec, 'ase-mock-service'),
      [
        { name: 'PORT', value: '3000' },
        { name: 'ADMIN_URL', value: 'http://admin-api-service:3001' }
      ],
      [{ containerPort: 3000 }],
      [waitForTcp('admin-api-service', 'admin-api-service', 3001)]
    ),
    service: makeService(name, namespace, [{ port: 3000, targetPort: 3000 }])
  };
}

/**
 * Returns all application service manifests in dependency order.
 * Infrastructure services must already be running before these are applied.
 */
export function allAppServices(
  namespace: string,
  spec: RafikiInstanceSpec
): AppManifests[] {
  return [
    palApiService(namespace, spec),
    palLedgerCommandHandlerService(namespace, spec),
    palEventHandlerService(namespace, spec),
    paymentsApiService(namespace, spec),
    paymentsCommandHandlerService(namespace, spec),
    paymentsEventHandlerService(namespace, spec),
    notificationsCommandHandlerService(namespace, spec),
    notificationsEventHandlerService(namespace, spec),
    ilpConnectorService(namespace, spec),
    openPaymentsResourceService(namespace, spec),
    adminApiService(namespace, spec),
    aseMockService(namespace, spec)
  ];
}
