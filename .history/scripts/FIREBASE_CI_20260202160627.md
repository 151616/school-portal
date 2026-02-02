GitHub Actions CI: Firebase Deploy

This workflow deploys your Firebase Cloud Functions and Realtime Database rules from the `main` branch.

Required repository secrets (add in GitHub → Settings → Secrets → Actions):

- `GCP_SA_KEY` (required)
  - The full JSON content of a Google Cloud service account key. Create a service account in the Google Cloud Console, grant it the roles below, then generate and copy the JSON into this secret.

- `FIREBASE_PROJECT_ID` (required)
  - The Firebase project id (e.g., `my-app-12345`) to deploy to.

Recommended service account roles (least privilege):
- `roles/cloudfunctions.admin` (Cloud Functions Admin)
- `roles/firebase.admin` OR `roles/firebase.managementAdmin` (Firebase Admin/Management)
- `roles/iam.serviceAccountUser` or `roles/iam.serviceAccountTokenCreator` (to allow the action to authenticate with service account tokens)
- `roles/owner` is NOT recommended unless absolutely necessary.

Notes & tips
- If your Cloud Functions require billing (e.g., background scaling or paid features), enable Blaze billing in the Firebase Console.
- Keep the service account JSON secret private. For production flows prefer short-lived keys and rotate them periodically.
- The workflow supports manual runs via the Actions tab ("Run workflow").

Local testing with emulators (recommended before deploying):

1) Start emulators locally:
   firebase emulators:start --only auth,database,functions

2) Test the invite & sign-up flows against the emulators before pushing to main.

If you want, I can also add an environment-specific workflow (staging -> production) or a PR check that runs the emulator tests automatically.