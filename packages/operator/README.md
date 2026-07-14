# Rafiki-v2 Kubernetes Operator

A TypeScript Kubernetes operator that manages the full Rafiki-v2 service stack
as a single declarative resource called `RafikiInstance`.

---

## What is a Kubernetes Operator?

Before diving in, here is a short explanation of the core concepts.

**Kubernetes** is a system that manages containers on a cluster of machines.
You tell it "run 3 copies of this container" and it handles placement, restarts,
networking, and storage.

**Custom Resources** extend Kubernetes with your own resource types. Instead of
managing 20 individual Deployments and Services separately, you define one
`RafikiInstance` object that represents the whole Rafiki stack.

**An Operator** is a program that watches for Custom Resources and acts on them.
It runs the "reconcile loop":

```
You create/update a RafikiInstance  →  Operator sees the change
→  Operator calls reconcile()       →  Creates/updates Kubernetes objects
→  Everything matches your intent   →  Operator reports status
```

The operator in this package translates the entire `docker/docker-compose.yaml`
into native Kubernetes Deployments, StatefulSets, Services, Jobs, and Secrets.

---

## Project Structure

```
packages/operator/
├── src/
│   ├── index.ts                     # Entrypoint: watches for RafikiInstance changes
│   ├── types.ts                     # TypeScript types for the CRD
│   ├── controller.ts                # Reconcile loop (core logic)
│   └── manifests/
│       ├── infrastructure.ts        # MongoDB, Redis, Kafka StatefulSets
│       ├── kafkaInit.ts             # Kafka topic initialisation Job
│       ├── appServices.ts           # All 12 application service Deployments
│       └── observability.ts        # Prometheus, Grafana, Tempo, OTEL stack
├── deploy/
│   ├── crd.yaml                     # Registers RafikiInstance with Kubernetes
│   ├── rbac.yaml                    # Operator permissions
│   ├── operator.yaml                # Operator Deployment (runs it in-cluster)
│   └── sample-rafiki-instance.yaml  # Example CR to apply
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## How docker-compose Maps to Kubernetes

| docker-compose concept                                  | Kubernetes equivalent                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `image:` + `restart: always`                            | `Deployment` or `StatefulSet`                                    |
| Named volume (e.g. `mongodb-data`)                      | `PersistentVolumeClaim`                                          |
| Service name DNS (e.g. `mongodb`)                       | `Service` (ClusterIP)                                            |
| `depends_on: condition: service_healthy`                | `initContainer` that polls the dependency                        |
| `depends_on: condition: service_completed_successfully` | `initContainer` that polls the Job status                        |
| `environment:`                                          | `env:` in the container spec, referencing `Secret` for passwords |
| `ports: "3001:3001"`                                    | `Service` + optionally an `Ingress` or `NodePort`                |
| `healthcheck:`                                          | `readinessProbe` + `livenessProbe`                               |

---

## Prerequisites

You need:

```bash
# kubectl — the Kubernetes CLI
brew install kubectl

# Node.js 20+
brew install node
```

For a local cluster you need **one** of the following (all work equally well):

| Option                  | Notes                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| **OrbStack** (Mac only) | Easiest. Enable Kubernetes in OrbStack settings — no extra install.        |
| **Docker Desktop**      | Enable Kubernetes in Docker Desktop settings → Kubernetes tab.             |
| **kind**                | `brew install kind` — runs a cluster inside Docker containers.             |
| **minikube**            | `brew install minikube` — similar to kind with more configuration options. |
| **Any real cluster**    | EKS, GKE, AKS, etc. Just point your kubeconfig at it.                      |

The operator code is cluster-agnostic — it uses `KubeConfig.loadFromDefault()` which reads whatever cluster `kubectl` is currently pointed at.

---

## Step-by-Step Guide

### Step 1 — Install dependencies and compile

```bash
cd packages/operator
pnpm install
pnpm run build
```

This runs the TypeScript compiler and outputs JavaScript to `dist/`.
To check for type errors without building:

```bash
pnpm run typecheck
```

### Step 2 — Start a local Kubernetes cluster

Choose the option that matches what you have installed:

**OrbStack** — just enable Kubernetes in the OrbStack menu bar icon → Settings → Kubernetes. No commands needed.

**Docker Desktop** — go to Settings → Kubernetes → Enable Kubernetes, then Apply & Restart.

**kind**:

```bash
kind create cluster --name rafiki-dev
```

**minikube**:

```bash
minikube start
```

Verify the cluster is reachable (works for all options):

```bash
kubectl cluster-info
kubectl get nodes
```

You should see one node in `Ready` state.

### Step 3 — Build and load the operator image

```bash
docker build -t rafiki-operator:dev .
```

Then update `deploy/operator.yaml` to use your local image:

```yaml
image: rafiki-operator:dev
imagePullPolicy: Never # Tell Kubernetes not to pull — use the local one
```

How to make the image available in the cluster depends on your setup:

| Cluster                       | Command                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| **OrbStack / Docker Desktop** | Nothing extra — they share the Docker daemon, so locally built images are already available.   |
| **kind**                      | `kind load docker-image rafiki-operator:dev --name rafiki-dev`                                 |
| **minikube**                  | `minikube image load rafiki-operator:dev`                                                      |
| **Remote cluster**            | Push to a registry: `docker push ghcr.io/your-org/rafiki-operator:dev` and use that image URL. |

> For real deployments, push to a registry like GHCR or Docker Hub instead.

### Step 4 — Build and load the Rafiki service images

The operator creates Deployments that reference container images for each
Rafiki service (e.g. `admin-api-service`, `pal-api-service`, etc.).
These images need to be built from the monorepo Dockerfiles and made
available in the cluster.

```bash
# From the repo root, build each service:
docker build -t rafiki-v2/admin-api-service:latest \
  -f packages/admin-api-service/Dockerfile .

# Repeat for each service, or use a build script.

# Load each into the cluster (kind example — see Step 3 for other options):
kind load docker-image rafiki-v2/admin-api-service:latest --name rafiki-dev
# ... repeat for all services
```

Then set `imageRegistry: "rafiki-v2"` and `imageTag: "latest"` in the sample CR.

### Step 5 — Apply the CRD

This registers the `RafikiInstance` type with Kubernetes.
You only need to do this once per cluster.

```bash
kubectl apply -f deploy/crd.yaml
```

Verify it was registered:

```bash
kubectl get crds | grep rafiki
# rafikiinstances.rafiki.interledger.org
```

### Step 6 — Apply RBAC

This creates the ServiceAccount and permissions the operator needs.

```bash
kubectl apply -f deploy/rbac.yaml
```

### Step 7 — Deploy the operator

This runs the operator itself as a Pod inside the cluster.

```bash
kubectl apply -f deploy/operator.yaml
```

Check it started successfully:

```bash
kubectl -n rafiki-system get pods
# NAME                               READY   STATUS    RESTARTS   AGE
# rafiki-operator-xxxx-xxxx          1/1     Running   0          10s

# Watch the operator logs in real time:
kubectl -n rafiki-system logs -f deployment/rafiki-operator
```

### Step 8 — Create a RafikiInstance

#### Providing the MongoDB password

The operator does not generate or store the MongoDB root password itself —
`RafikiInstance.spec.mongoPasswordSecretRef` points at a Secret you create
(and rotate) yourself, so the password never ends up in the RafikiInstance
object (visible to anyone who can `kubectl get rafikiinstance -o yaml`,
regardless of Secret-read permissions, and unsafe to check into a GitOps repo).

Create the namespace and the Secret before applying the CR:

```bash
kubectl -n rafiki create secret generic my-mongo-secret \
  --from-literal=password='a-real-secret-value'
```

(Use whatever tool you already manage secrets with — Sealed Secrets,
External Secrets Operator, Vault Agent injector — as long as a Secret with
that name/key ends up in the target namespace before you apply the CR.)

Then reference it in the CR:

```yaml
spec:
  mongoPasswordSecretRef:
    name: my-mongo-secret
    key: password
```

If the Secret doesn't exist yet, reconciliation fails fast and the error
shows up in `status.message` (`kubectl get rafikiinstances`) instead of
every app pod crash-looping on a missing secret later.

Edit `deploy/sample-rafiki-instance.yaml` with your settings, then apply it:

```bash
kubectl apply -f deploy/sample-rafiki-instance.yaml
```

The operator immediately sees the new resource and starts creating all the
Kubernetes objects. Watch it happen:

```bash
# Watch all pods come up in the rafiki namespace:
kubectl -n rafiki get pods -w

# See what services were created:
kubectl -n rafiki get services

# Check the RafikiInstance status (updated by the operator):
kubectl get rafikiinstances

# NAME         PHASE     AGE    LASTRECONCILED
# my-rafiki    Running   2m     2024-01-15T10:30:00Z
```

### Step 9 — Access the services

Services are only accessible inside the cluster by default. To reach them from
your laptop, use `kubectl port-forward`:

```bash
# Admin API
kubectl -n rafiki port-forward service/admin-api-service 3001:3001

# Grafana dashboards
kubectl -n rafiki port-forward service/grafana 4501:3000

# Redpanda Console (Kafka browser)
kubectl -n rafiki port-forward service/redpanda-console 8080:8080
```

Then open http://localhost:3001, http://localhost:4501, etc.

---

## Modifying the Operator

The operator is intentionally simple and readable. Here is where to make
changes:

| I want to...                                | Edit this file                     |
| ------------------------------------------- | ---------------------------------- |
| Add a new environment variable to a service | `src/manifests/appServices.ts`     |
| Change MongoDB storage size                 | `src/manifests/infrastructure.ts`  |
| Add a new Kafka topic                       | `src/manifests/kafkaInit.ts`       |
| Add a new field to the CRD                  | `src/types.ts` + `deploy/crd.yaml` |
| Change reconcile logic or ordering          | `src/controller.ts`                |

After any change, rebuild and reload:

```bash
npm run build
docker build -t rafiki-operator:dev .
# Load image into the cluster (see Step 3 for the right command for your setup)
kind load docker-image rafiki-operator:dev --name rafiki-dev
kubectl -n rafiki-system rollout restart deployment/rafiki-operator
```

---

## Deleting Everything

To delete the RafikiInstance and all its resources:

```bash
kubectl delete -f deploy/sample-rafiki-instance.yaml
```

The operator will delete the `rafiki` namespace and all its contents.

To tear down the entire local cluster:

```bash
# kind
kind delete cluster --name rafiki-dev

# minikube
minikube delete

# OrbStack / Docker Desktop: disable Kubernetes in the settings UI
```

---

## Next Steps

Once you are comfortable with the basics, consider:

- **OwnerReferences**: Instead of deleting the namespace on cleanup, set
  `ownerReferences` on every child object so Kubernetes cascades deletes
  automatically. This is the production-quality approach.

- **Leader election**: For high-availability, run 2+ operator replicas. Only
  one should reconcile at a time — use the built-in leader election helpers in
  `@kubernetes/client-node`.

- **Webhooks**: Add a validating admission webhook to reject invalid
  `RafikiInstance` specs before they are stored.

- **Testing with envtest**: The `envtest` binary from the
  [controller-runtime](https://pkg.go.dev/sigs.k8s.io/controller-runtime/pkg/envtest)
  project lets you run a real Kubernetes API server in tests without a cluster.
  A JavaScript equivalent is to use [jest](https://jestjs.io/) with a mock
  `k8s.KubeConfig`.
