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


const GATEWAY_NAME = 'rafiki-ext-gateway';

export async function createRafikiExternalGateway(
  kc: k8s.KubeConfig,
  customApi: k8s.CustomObjectsApi,
  namespace: string,
  spec: RafikiInstanceSpec
): Promise<void>{
  const gatewayManifest = {
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'Gateway',
    metadata: {
      name: GATEWAY_NAME,
      namespace: namespace
    },
    spec: {
      gatewayClassName: spec.gatewayClassName || 'traefik', // Uses the Traefik GatewayClass by default
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

  const success =
    await KubernetesHelpers.getInstance().createCustomObject(
      namespace,
      spec,
      gatewayManifest
    );

  if(success){
    console.log('Gateway created successfully!');
  }else{
    console.error('Failed to create Gateway');
  }
}


export async function createExternalRoutesGateway(
  kc: k8s.KubeConfig,
  customApi: k8s.CustomObjectsApi,
  namespace: string,
  spec: RafikiInstanceSpec
): Promise<void> {
  const openPaymentsManifest = {
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'HTTPRoute',
    metadata: {
      name: 'open-payments-api-service-routes',
      namespace: namespace
    },
    spec: {
      parentRefs: [{ name: GATEWAY_NAME }],
      hostnames: [
        spec.openPaymentsApiHost || 'open-payments-api.rafiki.cluster'
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
    spec,
    openPaymentsManifest
  );

  if (success) {
    console.log('Http Route created successfully!');
  } else {
    console.error('Failed to create Gateway');
  }
}
