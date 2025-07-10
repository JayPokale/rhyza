# build and push for local k8s (orbstack default registry)
docker build -t europe-west1-docker.pkg.dev/rafiki-poc/rafiki-poc/api-svc:0.0.1 -f packages/api-svc/Dockerfile .
docker build -t europe-west1-docker.pkg.dev/rafiki-poc/rafiki-poc/liquidity-svc:0.0.1 -f packages/liquidity-svc/Dockerfile .
docker build -t europe-west1-docker.pkg.dev/rafiki-poc/rafiki-poc/payment-cmd-handler-svc:0.0.1 -f packages/payments-command-handler-svc/Dockerfile .

# build and push for the GCP artifact
#docker buildx build --platform=linux/amd64,linux/arm64 -f packages/api-svc/Dockerfile -t europe-west1-docker.pkg.dev/rafiki-poc/rafiki-poc/api-svc:0.0.1 . --push
#docker buildx build --platform=linux/amd64,linux/arm64 -f packages/liquidity-svc/Dockerfile -t europe-west1-docker.pkg.dev/rafiki-poc/rafiki-poc/liquidity-svc:0.0.1 . --push
#docker buildx build --platform=linux/amd64,linux/arm64 -f packages/payments-command-handler-svc/Dockerfile -t europe-west1-docker.pkg.dev/rafiki-poc/rafiki-poc/payment-cmd-handler-svc:0.0.1 . --push

