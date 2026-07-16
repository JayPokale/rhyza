import * as k8s from '@kubernetes/client-node';
import { V1ConfigMap } from '@kubernetes/client-node';
import { RafikiInstanceSpec, RafikiInstanceStatus } from './types';
import {
  PromiseMiddlewareWrapper
} from '@kubernetes/client-node/dist/gen/middleware';

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
  contentType: 'application/apply-patch+yaml'
};

let cachedConfiguration: k8s.Configuration<k8s.ObservableMiddleware> | null = null;

async function getConfigurationMiddleware(
  kc: k8s.KubeConfig
): Promise<k8s.Configuration<k8s.ObservableMiddleware>> {
  if (cachedConfiguration) return cachedConfiguration;

  // Define a middleware that forces the SSA content-type
  const ssaMiddleware = new PromiseMiddlewareWrapper({
    pre: async (requestContext) => {
      // Note: Use exact casing 'Content-Type' (lowercase 'content-type' may fail to overwrite)
      requestContext.setHeaderParam(
        'Content-Type',
        'application/apply-patch+yaml'
      );
      return requestContext;
    },
    post: async (responseContext) => responseContext
  });

  // Re-build the Configuration instance with the middleware
  const currentContext = kc.getCurrentContext();
  const currentCluster = kc.getCluster(currentContext);
  if (!currentCluster || !currentCluster.server) {
    throw new Error('Could not determine active cluster configuration');
  }

  const baseServerConfig = new k8s.ServerConfiguration(
    currentCluster.server,
    {}
  );
  const ssaConfiguration = k8s.createConfiguration({
    middleware: [ssaMiddleware],
    baseServer: baseServerConfig,
    authMethods: {
      default: kc
    }
  });
  cachedConfiguration = ssaConfiguration;
  return ssaConfiguration;
}


// ---------------------------------------------------------------------------
// Status updater — write the operator's status back onto the CRD object
// ---------------------------------------------------------------------------

export async function updateStatus(
  kc: k8s.KubeConfig,
  customApi: k8s.CustomObjectsApi,
  name: string,
  namespace: string,
  status: RafikiInstanceStatus
): Promise<void> {
  try {
    const configuration = await getConfigurationMiddleware(kc);
    await customApi.patchNamespacedCustomObjectStatus(
      {
        name,
        namespace,
        group: 'rafiki.interledger.org',
        version: 'v1alpha1',
        plural: 'rafikiinstances',
        body: {
          // CRITICAL: SSA requires Type Metadata to be defined in the payload!
          apiVersion: 'rafiki.interledger.org/v1alpha1',
          kind: 'RafikiInstance',

          // Keep your metadata and status updates here
          metadata: {
            name,
            namespace
          },
          status
        },
        fieldManager: FIELD_MANAGER,
        force: true,
        ...SSA_OPTIONS
      },
      configuration
    );
    /*await customApi.patchNamespacedCustomObjectStatus(
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
    );*/
  } catch (err) {
    console.error('[Status] Failed to update status:', err);
  }
}



export async function applyStatefulSet(
  kc: k8s.KubeConfig,
  client: k8s.AppsV1Api,
  ns: string,
  manifest: k8s.V1StatefulSet
): Promise<void> {
  const name = manifest.metadata!.name!;
  const configuration = await getConfigurationMiddleware(kc);
  await client.patchNamespacedStatefulSet(
    {
      name,
      namespace: ns,
      body:  manifest,
      fieldManager: FIELD_MANAGER,
      force: true,
      ...SSA_OPTIONS
    },
    configuration
  );

  console.log(`[StatefulSet] Applied ${name}`);
}

export async function applyDeployment(
  kc: k8s.KubeConfig,
  client: k8s.AppsV1Api,
  ns: string,
  manifest: k8s.V1Deployment
): Promise<void> {
  const name = manifest.metadata!.name!;
  const configuration = await getConfigurationMiddleware(kc);
  await client.patchNamespacedDeployment(
    {
      name,
      namespace: ns,
      body: manifest,
      fieldManager: FIELD_MANAGER,
      force: true,
      ...SSA_OPTIONS
    },
    configuration
  );

  console.log(`[Deployment] Applied ${name}`);
}

export async function applyService(
  kc: k8s.KubeConfig,
  client: k8s.CoreV1Api,
  ns: string,
  manifest: k8s.V1Service
): Promise<void> {
  const name = manifest.metadata!.name!;
  const configuration = await getConfigurationMiddleware(kc);
  await client.patchNamespacedService(
    {
      name,
      namespace: ns,
      body: manifest,
      fieldManager: FIELD_MANAGER,
      force: true,
      ...SSA_OPTIONS
    },
    configuration
  );
  /*await client.patchNamespacedService(
    name,
    ns,
    manifest,
    undefined,
    undefined,
    FIELD_MANAGER,
    undefined,
    true,
    SSA_OPTIONS
  );*/
  console.log(`[Service] Applied ${name}`);
}

export async function applyIngress(
  kc: k8s.KubeConfig,
  client: k8s.NetworkingV1Api,
  ns: string,
  manifest: k8s.V1Ingress
): Promise<void> {
  const name = manifest.metadata!.name!;
  const configuration = await getConfigurationMiddleware(kc);
  await client.patchNamespacedIngress(
    {
      name,
      namespace: ns,
      body: manifest,
      fieldManager: FIELD_MANAGER,
      force: true,
      ...SSA_OPTIONS
    },
    configuration
  );
  /*await client.patchNamespacedIngress(
    name,
    ns,
    manifest,
    undefined,
    undefined,
    FIELD_MANAGER,
    undefined,
    true,
    SSA_OPTIONS
  );*/
  console.log(`[Ingress] Applied ${name}`);
}

// NOTE: intentionally NOT converted to server-side apply like the helpers
// above. A Job's spec.template is immutable after creation, so this isn't a
// "make it match" reconcile — it's "create once, then never touch again."
// Re-applying (even via SSA) after the topics already exist is unnecessary
// and patching most Job fields post-creation is rejected by the API server.
export async function applyJob(
  kc: k8s.KubeConfig,
  client: k8s.BatchV1Api,
  ns: string,
  manifest: k8s.V1Job
): Promise<void> {
  const name = manifest.metadata!.name!;
  try {
    const existing = await client.readNamespacedJob({ name, namespace: ns });
    if (existing.status?.succeeded && existing.status.succeeded > 0) {
      console.log(`[Job] ${name} already completed — skipping`);
      return;
    }
    /*const existing = await client.readNamespacedJob(name, ns);
    // If the job already succeeded, skip re-creating it — topics already exist
    if (existing.body.status?.succeeded && existing.body.status.succeeded > 0) {
      console.log(`[Job] ${name} already completed — skipping`);
      return;
    }*/
    console.log(`[Job] ${name} exists but not succeeded — leaving it alone`);
  } catch {
    // Job doesn't exist yet — create it
    await client.createNamespacedJob({ namespace: ns, body: manifest });
    console.log(`[Job] Created ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Namespace helper — create the namespace if it doesn't exist
// ---------------------------------------------------------------------------

export async function ensureNamespace(
  coreApi: k8s.CoreV1Api,
  namespace: string
): Promise<void> {
  try {
    await coreApi.readNamespace({ name: namespace });
    //await coreApi.readNamespace(namespace);
  } catch {
    await coreApi.createNamespace({
      body: {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: namespace }
      }
    });
    /*await coreApi.createNamespace({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: namespace }
    });*/
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

export async function ensureJobReaderRbac(
  rbacApi: k8s.RbacAuthorizationV1Api,
  namespace: string
): Promise<void> {
  const roleName = 'rafiki-job-reader';

  try {
    await rbacApi.readNamespacedRole({ name: roleName, namespace });
    //await rbacApi.readNamespacedRole(roleName, namespace);
  } catch {
    await rbacApi.createNamespacedRole({
      namespace,
      body: {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'Role',
        metadata: { name: roleName, namespace },
        rules: [{ apiGroups: ['batch'], resources: ['jobs'], verbs: ['get'] }]
      }
    });
   /* await rbacApi.createNamespacedRole(namespace, {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { name: roleName, namespace },
      rules: [{ apiGroups: ['batch'], resources: ['jobs'], verbs: ['get'] }]
    });*/
    console.log(`[RBAC] Created Role ${roleName}`);
  }

  try {
    await rbacApi.readNamespacedRoleBinding({ name: roleName, namespace });
    //await rbacApi.readNamespacedRoleBinding(roleName, namespace);
  } catch {
    await rbacApi.createNamespacedRoleBinding({
      namespace,
      body: {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'RoleBinding',
        metadata: { name: roleName, namespace },
        subjects: [{ kind: 'ServiceAccount', name: 'default', namespace }],
        roleRef: {
          kind: 'Role',
          name: roleName,
          apiGroup: 'rbac.authorization.k8s.io'
        }
      }
    });
    /*await rbacApi.createNamespacedRoleBinding(namespace, {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name: roleName, namespace },
      subjects: [{ kind: 'ServiceAccount', name: 'default', namespace }],
      roleRef: {
        kind: 'Role',
        name: roleName,
        apiGroup: 'rbac.authorization.k8s.io'
      }
    });*/
    console.log(`[RBAC] Created RoleBinding ${roleName}`);
  }
}

export function simpleDeployment(
  name: string,
  namespace: string,
  image: string,
  ports: number[],
  env: k8s.V1EnvVar[] = [],
  args: string[] = [],
  volumeMounts: k8s.V1VolumeMount[] = [],
  volumes: k8s.V1Volume[] = []
): k8s.V1Deployment {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name, namespace, labels: { app: name } },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: {
          volumes,
          containers: [
            {
              name,
              image,
              args: args.length > 0 ? args : undefined,
              env: env.length > 0 ? env : undefined,
              ports: ports.map((p) => ({ containerPort: p })),
              volumeMounts: volumeMounts.length > 0 ? volumeMounts : undefined
            }
          ]
        }
      }
    }
  };
}

/** Builds a standard Deployment object. */
export function makeDeployment(
  name: string,
  namespace: string,
  replicas: number,
  image: string,
  env: k8s.V1EnvVar[],
  ports: Array<{ containerPort: number }>,
  initContainers?: k8s.V1Container[]
): k8s.V1Deployment {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name, namespace, labels: { app: name } },
    spec: {
      replicas,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: {
          initContainers: initContainers ?? [],
          containers: [
            {
              name,
              image,
              // IfNotPresent works for both a locally-built dev image (never
              // pushed to a registry, so it must come from the node's local
              // cache) and a real registry image (pulled the first time it's
              // needed, cached after that).
              imagePullPolicy: 'IfNotPresent',
              env,
              ports: ports.map((p) => ({ containerPort: p.containerPort }))
            }
          ]
        }
      }
    }
  };
}

export function clusterIpService(
  name: string,
  namespace: string,
  ports: Array<{ port: number; targetPort: number; name?: string }>
): k8s.V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name, namespace, labels: { app: name } },
    spec: {
      type: 'ClusterIP',
      selector: { app: name },
      ports: ports.map((p) => ({
        name: p.name ?? String(p.port),
        port: p.port
      }))
    }
  };
}

export async function createConfigMap(): Promise<V1ConfigMap> {
  const configMap: k8s.V1ConfigMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'otel-collector-config',
      namespace: 'default'
    },
    data: {
      'config.yaml': `
receivers:
  otlp:
    protocols:
      grpc:
exporters:
  logging:
    verbosity: detailed
`
    }
  };

  return configMap;
}

export async function createCustomObject(
  kc: k8s.KubeConfig,
  customApi: k8s.CustomObjectsApi,
  namespace: string,
  spec: RafikiInstanceSpec,
  objectManifest: k8s.KubernetesObject
): Promise<boolean> {
  try {
    // Automatically extract Group and Version from the manifest apiVersion (e.g., 'gateway.networking.k8s.io/v1')
    const [group, version] = (objectManifest.apiVersion || '').split('/');
    const plural = objectManifest.kind
      ? `${objectManifest.kind.toLowerCase()}s`
      : null;
    const name = objectManifest.metadata?.name;

    if (!name) {
      console.log(
        `Skipping createCustomObject "${objectManifest.metadata?.name}" in namespace "${namespace}"...`
      );
      return false;
    }

    console.log(
      `Creating createCustomObject "${objectManifest.metadata?.name}" in namespace "${namespace}"...`
    );

    const configuration = await getConfigurationMiddleware(kc);

    const response = await customApi.patchNamespacedCustomObject(
      {
        name: name,
        group: group || 'rafiki.interledger.org',
        version: version || 'v1alpha1',
        plural: plural || 'customObjects',
        namespace: namespace,
        body: objectManifest,
        fieldManager: FIELD_MANAGER,
        force: true,
        ...SSA_OPTIONS
      },
      configuration
    ); //

    console.log(`${name} created successfully!`);
    console.log('API Response:', response.body);

    return true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    // Elegant error logging to read detailed API server validation failures
    if (err instanceof k8s.HttpException || err.body) {
      console.error(
        'Failed to create Gateway:',
        JSON.stringify(err.body, null, 2)
      );
    } else {
      console.error('An unexpected error occurred:', err);
    }

    return false;
  }
}

