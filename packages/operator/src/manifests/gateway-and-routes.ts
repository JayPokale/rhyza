// manifests/ingress.ts
//
// The Open Payments resource server is the only service exposed outside the
// cluster — everything else (admin API, gRPC services, observability) stays
// ClusterIP-only. This factory returns null when spec.host isn't set, so
// the resource server is internal-only by default (local dev, or an
// integrator not ready to go public yet).

import * as k8s from '@kubernetes/client-node';
import { RafikiInstanceSpec } from '../types.js';
import { KubernetesHelpers } from '../helpers';




export async function createExternalGateway(
  namespace: string,
  gatewayClassName: string,
  gatewayName:string
): Promise<void> {
  const gatewayManifest = {
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'Gateway',
    metadata: {
      name: gatewayName,
      namespace: namespace
    },
    spec: {
      gatewayClassName: gatewayClassName || 'traefik', // Uses the Traefik GatewayClass by default
      listeners: [
        {
          name: 'http',
          protocol: 'HTTP',
          port: 8000 // Safe port 8000 to match Traefik defaults
          // allowedRoutes: {
          //   namespaces: {
          //     from: 'Same',
          //   },
          // },
        }
      ]
    }
  };

  console.log(
    `Creating Gateway "${gatewayManifest.metadata.name}" in namespace "${namespace}"...`
  );

  const success = await KubernetesHelpers.getInstance().createCustomObject(
    namespace,
    gatewayManifest
  );

  if (success) {
    console.log('Gateway created successfully!');
  } else {
    console.error('Failed to create Gateway');
  }
}


export async function createExternalGatewayRoutes(
  namespace: string,
  spec: RafikiInstanceSpec,
  parentGatewayName:string
): Promise<void> {
  const openPaymentsManifest = {
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'HTTPRoute',
    metadata: {
      name: 'open-payments-api-service-routes',
      namespace: namespace
    },
    spec: {
      parentRefs: [{ name: parentGatewayName }],
      hostnames: [
        spec.openPaymentsApiHost || `open-payments-api.${namespace}.cluster`
      ],
      rules: [
        {
          backendRefs: [
            {
              name: 'open-payments-resource-service',
              port: 3002
            }
          ]
        }
      ]
    }
  };

  console.log(
    `Creating HTTPRoute "${openPaymentsManifest.metadata.name}" in namespace "${namespace}"...`
  );

  const success = await KubernetesHelpers.getInstance().createCustomObject(
    namespace,
    openPaymentsManifest
  );

  if (success) {
    console.log('Http Route created successfully!');
  } else {
    console.error('Failed to create Gateway');
  }
}
