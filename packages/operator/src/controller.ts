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
import { RafikiInstanceSpec, RafikiInstanceStatus } from './types.js';
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
import { openPaymentsIngress } from './manifests/ingress.js';
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

// ---------------------------------------------------------------------------
// Apply helpers
//
// "Apply" means: create the resource if it doesn't exist, or update it if it
// does. We use server-side apply (SSA) for this — a single PATCH request
// with Content-Type: application/apply-patch+yaml, which the API server
// upserts (creates on first apply, updates thereafter). This replaces the
// old read-then-create-or-patch pattern, which had two problems:
//   1. It wasn't atomic — something else could create the object in the
//      gap between the failed read and the create call.
//   2. It used a JSON Merge Patch, which can only ever add/overwrite fields
//      that are present in the payload. A field removed from the generated
//      manifest (e.g. an env var deleted in a future code change) would
//      silently linger on the live object forever.
//
// SSA tracks field ownership per "fieldManager" in metadata.managedFields.
// force: true means this operator always wins on the fields it sets —
// appropriate here since it is the sole authority over these objects.
// ---------------------------------------------------------------------------

const FIELD_MANAGER = 'rafiki-operator';
const SSA_OPTIONS = {
  headers: { 'Content-Type': k8s.PatchUtils.PATCH_FORMAT_APPLY_YAML }
};

async function applyStatefulSet(
  client: k8s.AppsV1Api,
  ns: string,
  manifest: k8s.V1StatefulSet
): Promise<void> {
  const name = manifest.metadata!.name!;
  await client.patchNamespacedStatefulSet(
    name,
    ns,
    manifest,
    undefined,
    undefined,
    FIELD_MANAGER,
    undefined,
    true,
    SSA_OPTIONS
  );
  console.log(`[StatefulSet] Applied ${name}`);
}

async function applyDeployment(
  client: k8s.AppsV1Api,
  ns: string,
  manifest: k8s.V1Deployment
): Promise<void> {
  const name = manifest.metadata!.name!;
  await client.patchNamespacedDeployment(
    name,
    ns,
    manifest,
    undefined,
    undefined,
    FIELD_MANAGER,
    undefined,
    true,
    SSA_OPTIONS
  );
  console.log(`[Deployment] Applied ${name}`);
}

async function applyService(
  client: k8s.CoreV1Api,
  ns: string,
  manifest: k8s.V1Service
): Promise<void> {
  const name = manifest.metadata!.name!;
  await client.patchNamespacedService(
    name,
    ns,
    manifest,
    undefined,
    undefined,
    FIELD_MANAGER,
    undefined,
    true,
    SSA_OPTIONS
  );
  console.log(`[Service] Applied ${name}`);
}

async function applyIngress(
  client: k8s.NetworkingV1Api,
  ns: string,
  manifest: k8s.V1Ingress
): Promise<void> {
  const name = manifest.metadata!.name!;
  await client.patchNamespacedIngress(
    name,
    ns,
    manifest,
    undefined,
    undefined,
    FIELD_MANAGER,
    undefined,
    true,
    SSA_OPTIONS
  );
  console.log(`[Ingress] Applied ${name}`);
}

// NOTE: intentionally NOT converted to server-side apply like the helpers
// above. A Job's spec.template is immutable after creation, so this isn't a
// "make it match" reconcile — it's "create once, then never touch again."
// Re-applying (even via SSA) after the topics already exist is unnecessary
// and patching most Job fields post-creation is rejected by the API server.
async function applyJob(
  client: k8s.BatchV1Api,
  ns: string,
  manifest: k8s.V1Job
): Promise<void> {
  const name = manifest.metadata!.name!;
  try {
    const existing = await client.readNamespacedJob(name, ns);
    // If the job already succeeded, skip re-creating it — topics already exist
    if (existing.body.status?.succeeded && existing.body.status.succeeded > 0) {
      console.log(`[Job] ${name} already completed — skipping`);
      return;
    }
    console.log(`[Job] ${name} exists but not succeeded — leaving it alone`);
  } catch {
    // Job doesn't exist yet — create it
    await client.createNamespacedJob(ns, manifest);
    console.log(`[Job] Created ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Namespace helper — create the namespace if it doesn't exist
// ---------------------------------------------------------------------------

async function ensureNamespace(
  coreApi: k8s.CoreV1Api,
  namespace: string
): Promise<void> {
  try {
    await coreApi.readNamespace(namespace);
  } catch {
    await coreApi.createNamespace({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: namespace }
    });
    console.log(`[Namespace] Created ${namespace}`);
  }
}

// ---------------------------------------------------------------------------
// RBAC helper — let app pods' initContainers read the Kafka init Job
//
// App Deployments don't set serviceAccountName, so their pods (and the
// waitForKafkaInit initContainer) run as the "default" ServiceAccount in
// the instance's namespace. That account has no permissions by default,
// so "kubectl get job init-kafka" from an initContainer is forbidden
// unless we grant it here.
// ---------------------------------------------------------------------------

async function ensureJobReaderRbac(
  rbacApi: k8s.RbacAuthorizationV1Api,
  namespace: string
): Promise<void> {
  const roleName = 'rafiki-job-reader';

  try {
    await rbacApi.readNamespacedRole(roleName, namespace);
  } catch {
    await rbacApi.createNamespacedRole(namespace, {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { name: roleName, namespace },
      rules: [{ apiGroups: ['batch'], resources: ['jobs'], verbs: ['get'] }]
    });
    console.log(`[RBAC] Created Role ${roleName}`);
  }

  try {
    await rbacApi.readNamespacedRoleBinding(roleName, namespace);
  } catch {
    await rbacApi.createNamespacedRoleBinding(namespace, {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name: roleName, namespace },
      subjects: [{ kind: 'ServiceAccount', name: 'default', namespace }],
      roleRef: {
        kind: 'Role',
        name: roleName,
        apiGroup: 'rbac.authorization.k8s.io'
      }
    });
    console.log(`[RBAC] Created RoleBinding ${roleName}`);
  }
}

// ---------------------------------------------------------------------------
// Status updater — write the operator's status back onto the CRD object
// ---------------------------------------------------------------------------

async function updateStatus(
  customApi: k8s.CustomObjectsApi,
  name: string,
  namespace: string,
  status: RafikiInstanceStatus
): Promise<void> {
  try {
    await customApi.patchNamespacedCustomObjectStatus(
      'rafiki.interledger.org',
      'v1alpha1',
      namespace,
      'rafikiinstances',
      name,
      { status },
      undefined,
      undefined,
      undefined,
      { headers: { 'Content-Type': 'application/merge-patch+json' } }
    );
  } catch (err) {
    console.error('[Status] Failed to update status:', err);
  }
}

// ---------------------------------------------------------------------------
// Main reconcile function
// ---------------------------------------------------------------------------

/**
 * Reconciles a RafikiInstance resource.
 *
 * Steps:
 * 1. Ensure the target namespace exists
 * 2. Verify the integrator-supplied MongoDB password secret exists
 * 3. Apply infrastructure StatefulSets + Services (MongoDB, Redis, Kafka)
 * 4. Apply the Kafka topic init Job
 * 5. Apply all application service Deployments + Services
 * 6. Apply the observability stack (if enabled)
 * 7. Update the CRD status to report success or failure
 *
 * @param kc      - Loaded kubeconfig (used to build API clients)
 * @param name    - Name of the RafikiInstance custom resource
 * @param namespace - Namespace where all resources should be created
 * @param spec    - The spec from the custom resource (user's intent)
 * @param generation - metadata.generation being reconciled, recorded onto
 *                      status.observedGeneration so status-only updates
 *                      (which don't bump generation) can be skipped
 */
export async function reconcile(
  kc: k8s.KubeConfig,
  name: string,
  namespace: string,
  spec: RafikiInstanceSpec,
  generation: number
): Promise<void> {
  console.log(
    `\n--- Reconciling RafikiInstance "${name}" in namespace "${namespace}" ---`
  );

  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  const appsApi = kc.makeApiClient(k8s.AppsV1Api);
  const batchApi = kc.makeApiClient(k8s.BatchV1Api);
  const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
  const rbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
  const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);

  try {
    // -------------------------------------------------------------------------
    // Step 1: Ensure namespace
    // -------------------------------------------------------------------------
    await ensureNamespace(coreApi, namespace);
    await ensureJobReaderRbac(rbacApi, namespace);

    // -------------------------------------------------------------------------
    // Step 2: MongoDB password secret
    //
    // The integrator owns this Secret — created and rotated outside the
    // operator (see spec.mongoPasswordSecretRef in types.ts). The operator
    // never generates or stores the password itself; it only verifies the
    // Secret exists here, so a typo fails reconciliation immediately
    // instead of every app pod crash-looping on a missing secretKeyRef.
    // -------------------------------------------------------------------------
    const mongoSecretRef = spec.mongoPasswordSecretRef;
    await coreApi
      .readNamespacedSecret(mongoSecretRef.name, namespace)
      .catch(() => {
        throw new Error(
          `mongoPasswordSecretRef points to Secret "${mongoSecretRef.name}" in namespace "${namespace}", but it does not exist`
        );
      });

    // -------------------------------------------------------------------------
    // Step 3: Infrastructure StatefulSets + Services
    // -------------------------------------------------------------------------
    console.log('\n[Phase 1] Applying infrastructure...');

    await applyStatefulSet(
      appsApi,
      namespace,
      mongodbStatefulSet(namespace, spec)
    );
    await applyService(coreApi, namespace, mongodbService(namespace));

    await applyStatefulSet(appsApi, namespace, redisStatefulSet(namespace));
    await applyService(coreApi, namespace, redisService(namespace));

    await applyStatefulSet(appsApi, namespace, kafkaStatefulSet(namespace));
    await applyService(coreApi, namespace, kafkaService(namespace));

    // -------------------------------------------------------------------------
    // Step 4: Kafka init Job
    //
    // Application pods use an initContainer that waits for this Job to succeed
    // before starting. This replicates docker-compose's:
    //   depends_on:
    //     init-kafka:
    //       condition: service_completed_successfully
    // -------------------------------------------------------------------------
    console.log('\n[Phase 2] Applying Kafka init job...');
    await applyJob(batchApi, namespace, kafkaInitJob(namespace));

    // -------------------------------------------------------------------------
    // Step 5: Application services
    // -------------------------------------------------------------------------
    console.log('\n[Phase 3] Applying application services...');

    const appManifests = allAppServices(namespace, spec);
    for (const { deployment, service } of appManifests) {
      await applyDeployment(appsApi, namespace, deployment);
      if (service) {
        await applyService(coreApi, namespace, service);
      }
    }

    // -------------------------------------------------------------------------
    // Step 5b: Ingress for open-payments-resource-service (the only service
    // exposed outside the cluster). Only created when spec.host is set.
    // -------------------------------------------------------------------------
    const ingress = openPaymentsIngress(namespace, spec);
    if (ingress) {
      console.log('\n[Phase 3b] Applying Ingress...');
      await applyIngress(networkingApi, namespace, ingress);
    }

    // -------------------------------------------------------------------------
    // Step 6: Observability stack (optional)
    // -------------------------------------------------------------------------
    if (spec.observability !== false) {
      console.log('\n[Phase 4] Applying observability stack...');

      await applyDeployment(
        appsApi,
        namespace,
        otelCollectorDeployment(namespace)
      );
      await applyService(coreApi, namespace, otelCollectorService(namespace));

      await applyDeployment(
        appsApi,
        namespace,
        prometheusDeployment(namespace)
      );
      await applyService(coreApi, namespace, prometheusService(namespace));

      await applyDeployment(appsApi, namespace, tempoDeployment(namespace));
      await applyService(coreApi, namespace, tempoService(namespace));

      await applyDeployment(appsApi, namespace, grafanaDeployment(namespace));
      await applyService(coreApi, namespace, grafanaService(namespace));

      await applyDeployment(
        appsApi,
        namespace,
        redpandaConsoleDeployment(namespace)
      );
      await applyService(coreApi, namespace, redpandaConsoleService(namespace));
    }

    // -------------------------------------------------------------------------
    // Step 7: Update status — tell Kubernetes the reconcile succeeded
    // -------------------------------------------------------------------------
    await updateStatus(customApi, name, namespace, {
      phase: 'Running',
      message: 'All resources applied successfully',
      lastReconciled: new Date().toISOString(),
      observedGeneration: generation
    });

    console.log('\n--- Reconciliation complete ---\n');
  } catch (err) {
    console.error('[Reconcile] Error during reconciliation:', err);

    // Report the error back onto the CRD so users can see it with:
    //   kubectl get rafikiinstances
    await updateStatus(customApi, name, namespace, {
      phase: 'Error',
      message: String(err),
      lastReconciled: new Date().toISOString()
    });

    throw err;
  }
}

/**
 * Cleans up all resources owned by a RafikiInstance when it is deleted.
 *
 * In production operators you would use OwnerReferences so Kubernetes
 * cascades deletes automatically. For simplicity, we delete the namespace
 * which removes all resources inside it.
 *
 * WARNING: Only do this if the namespace is dedicated to Rafiki.
 */
export async function cleanup(
  kc: k8s.KubeConfig,
  namespace: string
): Promise<void> {
  console.log(`[Cleanup] Deleting namespace ${namespace}...`);
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  try {
    await coreApi.deleteNamespace(namespace);
    console.log(`[Cleanup] Namespace ${namespace} deleted`);
  } catch (err) {
    console.error('[Cleanup] Error:', err);
  }
}
