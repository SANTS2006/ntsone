# Setting up "Continue with Google" for NTSOne

This takes about 15 minutes. You only need a Google account and access to the NTSOne settings on Render.
You do **not** need to pay anything or enter a card: Google sign-in is free.

What you will end up with: a **Client ID** (a long text ending in `.apps.googleusercontent.com`). It is not a
secret. You paste it into Render as `GOOGLE_CLIENT_ID`, and the "Continue with Google" button appears on the
sign-in and sign-up pages (and on the voting pages).

---

## Part 1 – Create a Google Cloud project

1. Go to <https://console.cloud.google.com> and sign in with the Google account that should own this (use a
   company account, not a personal one that might be lost).
2. Accept the terms if Google asks.
3. At the top left, click the **project picker** (next to the "Google Cloud" logo), then **New project**.
4. Project name: `NTSOne`. Leave "Organization" and "Location" as they are. Click **Create**.
5. Wait a few seconds, then make sure `NTSOne` is the selected project in the picker.

## Part 2 – Set up the consent screen (what people see when they sign in)

Google calls this the **Google Auth Platform** (older screens call it "OAuth consent screen").

1. Open the menu (three lines, top left) → **APIs & Services** → **OAuth consent screen**.
   If you see **Google Auth Platform → Get started**, click it and follow the same steps below.
2. **App information**
   - App name: `NTSOne`
   - User support email: your support email
3. **Audience**: choose **External** (so anyone with a Google account can sign in). Click **Next**.
4. **Contact information**: enter an email Google can reach you on. **Next**.
5. Tick the box agreeing to the Google API Services User Data Policy, then **Continue** → **Create**.
6. Open the **Branding** tab and fill in:
   - App logo (optional, 120×120 px) – your NTSOne logo
   - **Application home page**: `https://YOUR-SITE` (your real address, for example `https://ntsone.ntsdigitalsolutions.com`)
   - **Application privacy policy link**: `https://YOUR-SITE/privacy`
   - **Application terms of service link**: `https://YOUR-SITE/terms`
   - **Authorized domains**: your main domain, for example `ntsdigitalsolutions.com` (without `https://` or subdomains)
   - **Developer contact email**
   Click **Save**.
7. Open the **Data access** tab. NTSOne only needs the basic sign-in details, which are included
   automatically: `openid`, `email`, `profile`. **Do not add any other scope.** Fewer scopes means Google
   does not need to review your app in depth.
8. Open the **Audience** tab:
   - **Publishing status** starts as **Testing**. In Testing, only people you list under **Test users** can sign in.
     Click **Add users** and add the Gmail addresses you want to test with.
   - When you are ready for everyone, click **Publish app** → **Confirm**. Because you only use the basic
     scopes, this normally happens immediately (no long review).

> Until you publish, real customers will see "Access blocked: NTSOne has not completed the Google verification
> process". That is the single most common reason people think it is broken. Publish the app (step above) before
> you announce Google sign-in.

## Part 3 – Create the Client ID

1. Menu → **APIs & Services** → **Credentials** (or **Google Auth Platform → Clients**).
2. Click **+ Create credentials** → **OAuth client ID** (or **Create client**).
3. **Application type**: **Web application**.
4. **Name**: `NTSOne website`.
5. **Authorized JavaScript origins** – click **+ Add URI** once for each address people use to open NTSOne.
   Exact addresses only: no path, no trailing `/`.
   - `https://ntsone.ntsdigitalsolutions.com` (your live address)
   - `https://ntsone.onrender.com` (only if people can also open the site on the Render address; use your real Render name)
   - `http://localhost:5173` (only if you want to test on your own computer; remove it later if you like)
6. **Authorized redirect URIs**: **leave empty.** NTSOne uses Google's pop-up sign-in, which does not need one.
7. Click **Create**.
8. A box shows **Your Client ID** and **Client secret**.
   - **Copy the Client ID** (ends with `.apps.googleusercontent.com`).
   - You do **not** need the client secret and NTSOne never asks for it. Do not paste it anywhere.
9. Changes to origins can take from 5 minutes up to a few hours to start working. This is normal.

## Part 4 – Give the Client ID to NTSOne (Render)

1. Open <https://dashboard.render.com> → your NTSOne web service → **Environment**.
2. Find `GOOGLE_CLIENT_ID` (it is already listed, empty) or click **Add Environment Variable**.
3. Key: `GOOGLE_CLIENT_ID`
   Value: the Client ID you copied (no spaces, no quotes).
4. Click **Save changes**. Render redeploys automatically (a few minutes). Wait until it says **Live**.
5. Also confirm `APP_URL` in the same list is your real address, starting with `https://` (for example
   `https://ntsone.ntsdigitalsolutions.com`).

## Part 5 – Test it

1. Open your site in a **private/incognito window** and go to `/login`.
2. You should see a **Continue with Google** button above the email box.
3. Click it, choose a Google account (while the app is in Testing, a test user you added).
4. **A new person** (no account yet) is taken to *Verify your email*. A 6-character code arrives in their
   inbox; they enter it. Then they see *Set up your organization*, enter the name and agree to the terms, and the
   system opens.
5. **A returning person** goes straight into the system.
6. Try `/register` too: the same button says "Sign up with Google".

## If something goes wrong

| What you see | Why | Fix |
| --- | --- | --- |
| No Google button at all | `GOOGLE_CLIENT_ID` is empty or the deploy has not finished | Re-check Part 4; wait for **Live**; hard-refresh the page |
| "Google sign-in isn't available right now" under the form | The browser blocked Google's script (ad blocker, school/work network) | Try another browser or network |
| Pop-up says **Error 400: origin_mismatch** | The address in the browser is not in *Authorized JavaScript origins* | Part 3 step 5: add the exact address (https, no trailing `/`), wait a few minutes |
| **Access blocked: has not completed the Google verification process** | App is still in *Testing* and this person is not a test user | Part 2 step 8: add them, or **Publish app** |
| "The given client ID is not found" / button shows an error | Typo or extra space in `GOOGLE_CLIENT_ID` | Re-copy the Client ID exactly |
| "Your Google account's email address isn't verified" | The Google account has an unverified email | Use a normal Gmail / verified Google Workspace account |
| "This Google sign-in has expired or was already used" | The page was left open for over 10 minutes | Refresh the page and try again |
| "Platform administrator accounts must sign in with their email and password" | By design: the owner accounts never use Google | Sign in with email and password |
| The 6-character code does not arrive | Email provider problem or spam folder | Check spam; press **Resend**; check `BREVO_API_KEY` in Render |

## Security notes (what NTSOne does for you)

- Google's signed token is checked on the server: the signature (against Google's published keys), that it was
  issued **for your Client ID**, by Google, that it has not expired, and that Google says the email is verified.
- Every attempt carries a **single-use code** (a "nonce") that is only valid for 10 minutes, so a stolen or
  replayed Google token cannot be used to sign in.
- A **new** Google sign-up must still confirm the email with the emailed 6-character code and agree to the Terms
  before using anything. Nothing else in the system opens until both are done.
- If someone had registered an address with a password but never confirmed it, and the real owner then uses
  Google, that password is cancelled.
- Suspended accounts and platform-administrator accounts can never sign in through Google.
- You do not need the Client Secret and NTSOne never stores one. The Client ID is public by design.
- Keep the Google Cloud project owned by a company account with **2-step verification** on, and add a second
  owner (**IAM & Admin → IAM → Grant access**) so you never lose control of it.
