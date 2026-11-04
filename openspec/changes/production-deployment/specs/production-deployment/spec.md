## ADDED Requirements

### Requirement: Production images contain no development tooling or accounts
The production server and web images SHALL run without the Vite dev server, file watchers, or the seeded development account. The production compose configuration SHALL NOT set `SEED_DEV_ACCOUNT` and SHALL NOT contain default database credentials.

#### Scenario: Production stack started
- **WHEN** the production stack is started with a valid environment file
- **THEN** no process in the server or web container is `vite` or a file watcher, and signing in as the development account fails

#### Scenario: Missing database password
- **WHEN** the production stack is started without the database password variable set
- **THEN** compose refuses to start and names the missing variable

### Requirement: One public origin serves the web app and proxies the backend
The production web container SHALL serve the built web app and SHALL forward `/api`, `/socket.io` (including WebSocket upgrades) and `/uploads` to the server, so a browser uses a single origin for all of them. Unknown paths SHALL return the web app's entry page so client-side routes load on refresh.

#### Scenario: Room page reload
- **WHEN** a user reloads the browser on a room URL
- **THEN** the web app loads and reconnects to the room over WebSocket through the same origin

#### Scenario: Upload retrieval
- **WHEN** the browser requests `/uploads/<key>` for a stored image
- **THEN** the image is returned through the web container

### Requirement: Required configuration is validated at start
The production configuration SHALL list every required variable (`DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `CLIENT_ORIGIN`, `VISION_URL`) in an example file. The server SHALL refuse to start in production when a required storage setting is missing, as already specified by `upload-storage`.

#### Scenario: Example file is complete
- **WHEN** a reader compares `.env.production.example` with the server's production requirements
- **THEN** every required variable appears with a comment saying what it is

### Requirement: Database migrations run once per release
The deployment SHALL apply Prisma migrations as a distinct step before the server starts serving, and the server container SHALL NOT need to apply them on every start.

#### Scenario: Release with a new migration
- **WHEN** a release containing a new migration is deployed
- **THEN** the migration step completes before the new server accepts traffic

### Requirement: A documented path exists for AWS and Google Cloud
The repository SHALL document, step by step, how to deploy the production stack to a single VM and which managed services replace each stateful container on AWS and on Google Cloud.

#### Scenario: Following the one-VM guide
- **WHEN** a team member follows `docs/DEPLOYMENT.md` on a fresh VM with Docker installed
- **THEN** the app is reachable over HTTPS and a GM can create a room and upload a map

### Requirement: CI builds the production images
CI SHALL build the production server and web images on every pull request and fail the check when a build fails.

#### Scenario: Broken production Dockerfile
- **WHEN** a pull request breaks the production web build
- **THEN** the image-build job fails

### Requirement: One-VM AWS deployment can be created and removed with Terraform
The repository SHALL include a Terraform configuration that creates a single AWS VM with a fixed public IP and starts the production stack on it, using generated secrets, and that removes everything it created on `terraform destroy`. Secrets SHALL NOT be committed.

#### Scenario: Apply on a fresh account
- **WHEN** an operator with AWS credentials runs `terraform apply` with the required variables
- **THEN** the VM starts, the production stack comes up, and the output prints the site URL

#### Scenario: Teardown
- **WHEN** the operator runs `terraform destroy`
- **THEN** the instance, security group and Elastic IP are removed

### Requirement: One-VM Google Cloud deployment can be created and removed with Terraform
The repository SHALL include a Terraform configuration that creates a single Compute Engine VM with a reserved static IP and starts the production stack on it, using generated secrets, and that removes everything it created on `terraform destroy`. Secrets SHALL NOT be committed.

#### Scenario: Apply in a fresh project
- **WHEN** an operator with Google Cloud credentials runs `terraform apply` with `project_id` and `ssh_cidr`
- **THEN** the VM starts, the production stack comes up, and the output prints the site URL

#### Scenario: Teardown
- **WHEN** the operator runs `terraform destroy`
- **THEN** the VM, firewall rules and static address are removed
