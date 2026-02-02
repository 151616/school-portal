Setting admin custom claims (scripts/setAdminClaim.js)

1) Download service account key (DO NOT COMMIT)
- Firebase Console -> Project settings -> Service accounts -> Generate new private key
- Save the file as `service-account.json` at the project root
- Ensure `service-account.json` is *in your local .gitignore* (already added)

2) Install dependency if needed (local only)

  npm install firebase-admin

3) Run the helper script

  npm run set-admin-claim -- <USER_UID>

Note: include a SPACE after the double-dash. Example: `npm run set-admin-claim -- zLbC0Q2GJMaEGlcHI0lDYwBHao73` (running `npm run set-admin-claim --<USER_UID>` without a space will be interpreted as an npm cli flag and fail).

4) Optional: Add GitHub Actions deploy (CI)

- Add secrets in GitHub repo -> Settings -> Secrets -> Actions:
  - `GCP_SA_KEY` : copy/paste the *JSON* service account key
  - `FIREBASE_PROJECT_ID` : your Firebase project id
- Push to `main` or run the `Firebase Deploy` workflow manually from the Actions tab.  
- See `./.github/workflows/firebase-deploy.yml` for the exact workflow steps.

5) After adding the admin custom claim (see step 3), deploy the updated `database.rules.json` so the server enforces the intended access.

6) To remove the legacy `emails` map safely (recommended):
 - Backup: `npm run cleanup-emails` (it will save a local backup file and prompt for confirmation before deleting the node)
 - Confirm the UI works by creating an invite and using queries (the app now relies on `Users/*/email` for lookups)


4) Verify
- The user should sign out and sign back in (Auth tokens refresh), or you can check logs
- Optionally inspect the user's token in Cloud Functions or print it on sign-in

Security note
- Keep the `service-account.json` outside version control. Use CI secrets for automation instead of committing keys.
