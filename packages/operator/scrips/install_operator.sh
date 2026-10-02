#!/bin/bash

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed."
    echo "Please install kubectl to continue: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

# TODO check helm

echo "kubectl is installed: $(kubectl version --client --output=yaml 2>/dev/null | grep -i gitVersion || echo 'available')"

# Install Gateway CRDs
echo "Installing Gateway CRDs..."
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.2/standard-install.yaml

# install Traefik
helm upgrade --install traefik traefik/traefik --namespace traefik --create-namespace --set providers.kubernetesGateway.enabled=true --set providers.kubernetesIngress.enabled=false --set providers.kubernetesCRD.enabled=true


#Install CRDs, RBAC and operator service
echo "Installing Gateway CRDs, RBAC and operator service..."
kubectl apply -f packages/operator/deploy/crd.yaml
kubectl apply -f packages/operator/deploy/rbac.yaml
kubectl apply -f packages/operator/deploy/operator.yaml

echo "All done, please review 'packages/operator/examples/single-rafiki-instance.yaml' and run:"
echo "\tkubectl apply -f packages/operator/examples/single-rafiki-instance.yaml"
echo "To install the rafiki stack"
