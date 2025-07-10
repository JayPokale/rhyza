
### Connect to the cluster
gcloud container clusters get-credentials rafiki-poc-cluster --region europe-west1 --project rafiki-poc

### Login to GCP artifact repository
gcloud auth configure-docker europe-west1-docker.pkg.dev

