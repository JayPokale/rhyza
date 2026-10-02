// index.ts
//
// Operator entrypoint.
//
// This file:
// 1. Loads the Kubernetes configuration (in-cluster when running in a pod,
//    or from ~/.kube/config when running locally for development)
// 2. Creates a "List+Watch" Informer for RafikiInstance objects
// 3. Calls reconcile() on ADD and UPDATE events
// 4. Calls cleanup() on DELETE events
//

import * as k8s from '@kubernetes/client-node';
import { RafikiOperatorController } from './controller';
import process from 'process';

// Message Consumer/Publisher
const GATEWAY_CLASSNAME = process.env['GATEWAY_CLASSNAME'] || 'traefik';
// Message Consumer/Publisher
const API_PORT = process.env['API_PORT']
  ? parseInt(process.env['API_PORT'])
  : 8008;

const GATEWAY_NAME = 'rafiki-ext-gateway';;

async function main() {
  // -------------------------------------------------------------------------
  // Step 1: Load kubeconfig
  //
  // KubeConfig.loadFromDefault() tries in order:
  //   1. KUBECONFIG environment variable
  //   2. ~/.kube/config (standard local development path)
  //   3. In-cluster config (projected ServiceAccount token) — used when the
  //      operator itself runs as a Pod inside Kubernetes
  // -------------------------------------------------------------------------
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  const controller = new RafikiOperatorController(kc, {
    systemNamespace: 'rafiki-system',
    gatewayClassName: GATEWAY_CLASSNAME,
    gatewayName: GATEWAY_NAME,
    apiPort: API_PORT,
    group: 'rafiki.interledger.org',
    version: 'v1alpha1',
    plural: 'rafikiinstances'
  });

  await controller.init();

  // Keep the process alive. The informer runs asynchronously in the background.
  // Node.js would exit once all synchronous code finishes, so we prevent that.
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    controller.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    controller.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
