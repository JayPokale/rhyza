docker build -t k8scluster-registry.internal:5000/rafiki-poc-api-svc:0.0.1 -f packages/api-svc/Dockerfile .
docker build -t k8scluster-registry.internal:5000/rafiki-poc-liquidity-svc:0.0.1 -f packages/liquidity-svc/Dockerfile .
docker build -t k8scluster-registry.internal:5000/rafiki-poc-payment-cmd-handler-svc:0.0.1 -f packages/payments-command-handler-svc/Dockerfile .
