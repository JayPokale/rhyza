// types.ts
// TypeScript types for the RafikiInstance Custom Resource Definition.
//
// A "Custom Resource" is just a YAML object you invent and register with
// Kubernetes. This file defines what fields it has so the rest of the
// operator stays type-safe.

/** Reference to a key within an existing Secret in the RafikiInstance's namespace. */
export interface SecretRef {
  /** Name of the Secret. */
  name: string;
  /** Key within the Secret holding the value. */
  key: string;
}

export interface RafikiInstanceSpec {
  /**
   * Number of replicas for stateless application services.
   * Infrastructure (mongodb, redis, kafka) always runs as 1 replica.
   * Default: 1
   */
  replicas?: number;

  /**
   * Reference to an existing Secret holding the MongoDB root password,
   * created and rotated by the integrator outside the operator (e.g. via
   * Sealed Secrets, External Secrets Operator, or `kubectl create secret`).
   * The operator only reads it — it never generates or stores the
   * password itself, so it never ends up in the RafikiInstance object.
   */
  mongoPasswordSecretRef: SecretRef;

  /**
   * Container image tag for all Rafiki-built services.
   * Example: "latest", "v1.2.3"
   */
  imageTag: string;

  /**
   * Registry prefix for all images built from this monorepo.
   * Example: "ghcr.io/interledger/rafiki-v2"
   */
  imageRegistry: string;

  /**
   * URL for the webhook endpoint that the notifications service calls.
   * In the compose file this is the ase-mock-service.
   */
  webhookUrl: string;

  /**
   * Whether to deploy the observability stack
   * (Prometheus, Grafana, Tempo, OTEL Collector, Redpanda Console).
   * Default: true
   */
  observability?: boolean;

  /**
   * Public hostname for the Open Payments resource server
   * (e.g. "payments.integrator.com"). This is the ONLY service exposed
   * outside the cluster. When set, the operator creates an Ingress routing
   * this host to open-payments-resource-service, and injects it (bare, no
   * scheme) as OPEN_PAYMENTS_RESOURCE_SERVER_URL — the value the service
   * bakes into wallet address IDs, so it must match the Ingress host
   * exactly. Omit to keep the resource server ClusterIP-only (local dev).
   */
  host?: string;

  /**
   * Name of an existing Secret (in this namespace) of type kubernetes.io/tls
   * holding the certificate for `host`, created and rotated by the
   * integrator outside the operator — same trust boundary as
   * mongoPasswordSecretRef. Required if `host` is set and `tlsIssuer` isn't.
   */
  tlsSecretName?: string;

  /**
   * Name of a cert-manager ClusterIssuer to request a certificate from
   * automatically, as an alternative to supplying tlsSecretName. Only
   * relevant if cert-manager is installed in the cluster; the operator
   * does not install or require cert-manager itself.
   */
  tlsIssuer?: string;

  /**
   * IngressClassName to set on the generated Ingress (e.g. "nginx").
   * Omit to use the cluster's default IngressClass.
   */
  ingressClassName?: string;
}

export interface RafikiInstanceStatus {
  /** Human-readable summary of the operator's current state. */
  phase: 'Pending' | 'Running' | 'Degraded' | 'Error';
  message?: string;
  /** ISO-8601 timestamp of the last reconcile attempt. */
  lastReconciled?: string;
  /**
   * The metadata.generation that was reconciled to produce this status.
   * Used to skip reconciling status-only updates (which don't bump
   * generation) so the operator doesn't loop on its own status patches.
   */
  observedGeneration?: number;
}

/**
 * Full shape of a RafikiInstance custom resource as returned by the
 * Kubernetes API. The `spec` is what YOU write; `status` is written by
 * the operator.
 */
export interface RafikiInstance {
  apiVersion: string;
  kind: 'RafikiInstance';
  metadata: {
    name: string;
    namespace: string;
    resourceVersion?: string;
    uid?: string;
    generation?: number;
  };
  spec: RafikiInstanceSpec;
  status?: RafikiInstanceStatus;
}
