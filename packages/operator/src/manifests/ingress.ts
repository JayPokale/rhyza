// manifests/ingress.ts
//
// The Open Payments resource server is the only service exposed outside the
// cluster — everything else (admin API, gRPC services, observability) stays
// ClusterIP-only. This factory returns null when spec.host isn't set, so
// the resource server is internal-only by default (local dev, or an
// integrator not ready to go public yet).

import * as k8s from '@kubernetes/client-node';
import { RafikiInstanceSpec } from '../types.js';

function ingressRule(
  host: string,
  serviceName: string,
  port: number
): k8s.V1IngressRule {
  return {
    host,
    http: {
      paths: [
        {
          path: '/',
          pathType: 'Prefix',
          backend: { service: { name: serviceName, port: { number: port } } }
        }
      ]
    }
  };
}

export function openPaymentsIngress(
  namespace: string,
  spec: RafikiInstanceSpec
): k8s.V1Ingress | null {
  if (!spec.host) return null;

  const annotations: Record<string, string> = {};
  if (spec.tlsIssuer) {
    annotations['cert-manager.io/cluster-issuer'] = spec.tlsIssuer;
  }

  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'open-payments-resource-service',
      namespace,
      labels: { app: 'open-payments-resource-service' },
      annotations
    },
    spec: {
      ingressClassName: spec.ingressClassName,
      tls: spec.tlsSecretName
        ? [{ hosts: [spec.host], secretName: spec.tlsSecretName }]
        : undefined,
      rules: [ingressRule(spec.host, 'open-payments-resource-service', 3002)]
    }
  };
}
