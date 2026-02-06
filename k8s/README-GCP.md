### Connect to the cluster

gcloud container clusters get-credentials rafiki-poc-cluster --region europe-west1 --project rafiki-poc

### Login to GCP artifact repository

gcloud auth configure-docker europe-west1-docker.pkg.dev

### CloudSQL

1. In the Google Cloud console, go to the Cloud SQL Instances page

2. Click `Create instance`.

3. Select PostgreSQL as database engine

4. Select CloudSQL Edition (during the Rafiki Work Week, Enterpise Plus was used)

5. Use `Production` for Edition preset

6. Generate a strong password for the root user (without special characters)

7. Use a single zone for availability (`europe-west1` was used during Rafiki Work Week)

8. Open the `Customize your instance` section

9. Open the `Connections` section

10. Make sure to have `Private IP` checked as well - the private IP will be used for the database connection string (for network selection, `default` was used during Rafiki Work Week)

### Managed Service for Apache Kafka

1. In the Google Cloud console, go to the Managed Service for Apache Kafka Clusters page

2. Click `Create`

3. Decide on the location (`europe-west-1` used during Rafiki Work Week)

4. Capacity configuration: 3 vCPUs, 4GiB Memory per vCPU (adjust based on usage)

5. Wait for the cluster to be initialized (it will take around 15-20 minutes)

6. Once the cluster is created, navigate to the cluster page

7. Click `Create topic`.

8. Click the two topics needed (at the time of Rafiki Work Week - maybe there will be more in the future):

- topic name: `api-response-events`, partition count: `1`, replication factor: `3`
- topic name: `payment-commands`, partition count: `24`, replication factor: `3`

9. Navigate to IAM & Admin, Service Accounts page

10. Click `Create service account`

11. Fill in the details for the service account and click `Create and continue`

12. As permissions, select the `Managed Kafka Admin` role and click `Continue`

13. Click `Done`

14. Navigate to the newly created service account page and click on the `Keys` tab

15. Click `Add key` and `Create new key`

16. Select `JSON` as the key type and create.

17. The JSON key will be automatically downloaded to your machine

18. Base64 encode the contents of the JSON file that was automatically downloaded to your machine:

```sh
base64 -w 0 < your-json-file-name.json > password.txt
```

19. Use the service account email for the `KAFKA_AUTH_USERNAME`

20. Use the contents of `password.txt` as the `KAFKA_AUTH_PASSWORD`
