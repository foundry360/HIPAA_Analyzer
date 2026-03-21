# Smoke test – get ID token via AWS CLI (Option A)

Use the **admin** API to sign in and get an ID token. Replace placeholders with your values.

**Values you need:**
- **User Pool ID:** `us-east-1_FxIaCSzUq`
- **Client ID:** `303uuebitg7rsrg4joj6lmroqd`
- **Username:** The username of the Cognito user you created (often the **email** if you used email as the username when creating the user).
- **Password:** The user’s current password (temporary one from “Create user”, or the new one after first sign-in).

---

## Step 1: Sign in and get tokens

Run (replace `YOUR_USERNAME` and `YOUR_PASSWORD`):

```bash
aws cognito-idp admin-initiate-auth \
  --region us-east-1 \
  --user-pool-id us-east-1_FxIaCSzUq \
  --client-id 303uuebitg7rsrg4joj6lmroqd \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=YOUR_USERNAME,PASSWORD=YOUR_PASSWORD
```

**If that fails:** Some pools or clients use the legacy flow. Try:

```bash
aws cognito-idp admin-initiate-auth \
  --region us-east-1 \
  --user-pool-id us-east-1_FxIaCSzUq \
  --client-id 303uuebitg7rsrg4joj6lmroqd \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=YOUR_USERNAME,PASSWORD=YOUR_PASSWORD
```

---

## Step 2: Interpret the response

**A. Success – you get tokens**

You’ll see something like:

```json
{
  "AuthenticationResult": {
    "IdToken": "eyJraWQiOiJ...",
    "AccessToken": "eyJraWQiOiJ...",
    "RefreshToken": "eyJjdHkiOiJKV1...",
    "ExpiresIn": 3600
  }
}
```

Copy the **`IdToken`** value (the long JWT). Use it as:

```bash
Authorization: Bearer <IdToken>
```

**B. New password required**

If the user is in “Force change password” state you’ll see:

```json
{
  "ChallengeName": "NEW_PASSWORD_REQUIRED",
  "Session": "...",
  "ChallengeParameters": { ... }
}
```

Set a new permanent password with:

```bash
aws cognito-idp respond-to-auth-challenge \
  --region us-east-1 \
  --client-id 303uuebitg7rsrg4joj6lmroqd \
  --challenge-name NEW_PASSWORD_REQUIRED \
  --session "PASTE_Session_value_from_above" \
  --challenge-responses NEW_PASSWORD=YourNewSecurePass123!,USERNAME=YOUR_USERNAME
```

From the response, take **`AuthenticationResult.IdToken`**. Next time you can sign in with the new password and skip this step.

**C. MFA required**

If you see `"ChallengeName": "MFA_REQUIRED"`, the user must complete MFA (TOTP or SMS). You’ll need the 6-digit code, then:

```bash
aws cognito-idp respond-to-auth-challenge \
  --region us-east-1 \
  --client-id 303uuebitg7rsrg4joj6lmroqd \
  --challenge-name SOFTWARE_TOKEN_MFA \
  --session "PASTE_Session_value" \
  --challenge-responses USERNAME=YOUR_USERNAME,SOFTWARE_TOKEN_MFA_CODE=123456
```

Use the **IdToken** from the response. If the user hasn’t set up MFA yet, do that in the Cognito Hosted UI or your app first.

---

## Step 3: Call the API with the ID token

Save the token to a variable (no quotes inside the token):

```bash
TOKEN="eyJraWQiOiJ..."
```

**3a. Get upload URL**

```bash
curl -s -X POST "https://2wdg7vmhdc.execute-api.us-east-1.amazonaws.com/prod/upload-url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.pdf","fileType":"application/pdf","analysisType":"GENERAL_SUMMARY"}'
```

From the JSON response, note **uploadUrl**, **documentId**, and **s3Key**.

**3b. Upload a file**

Use the **uploadUrl** from 3a (no `Authorization` header for this request):

```bash
curl -s -X PUT "PASTE_uploadUrl_HERE" \
  -H "Content-Type: application/pdf" \
  --data-binary @/path/to/a/small.pdf
```

**3c. Start analysis**

```bash
curl -s -X POST "https://2wdg7vmhdc.execute-api.us-east-1.amazonaws.com/prod/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"documentId":"PASTE_documentId","s3Key":"PASTE_s3Key","analysisType":"GENERAL_SUMMARY"}'
```

**3d. Get result**

```bash
curl -s "https://2wdg7vmhdc.execute-api.us-east-1.amazonaws.com/prod/result/PASTE_documentId" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Username vs email

When you created the user in the Cognito console, the **Username** field might be an email or a generated sub. To list users and see the **Username** value:

```bash
aws cognito-idp list-users \
  --region us-east-1 \
  --user-pool-id us-east-1_FxIaCSzUq \
  --query 'Users[*].Username' \
  --output text
```

Use that exact value as `YOUR_USERNAME` in the auth command.
