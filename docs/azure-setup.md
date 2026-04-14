# Azure App Registration

To use `@thingsai/todo-mcp-server`, you need an Azure AD app registration. This is free — no paid Azure subscription required. The app uses OAuth 2.0 with PKCE (a public client flow), so **no client secret is needed**.

---

## Option 1: Azure Portal (UI)

### 1. Create the app registration

Go to [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) and click **New registration**.

- **Name:** `Todo CLI`
- **Supported account types** — choose based on which accounts you'll use:
  - **"Personal Microsoft accounts only"** — for @outlook.com, @hotmail.com, @live.com
  - **"Accounts in any organizational directory and personal Microsoft accounts"** — for work/school + personal accounts
- **Redirect URI:**
  - Platform: **Public client/native (mobile & desktop)**
  - URI: `http://localhost:3847/callback`

Click **Register**.

### 2. Enable public client flows

Go to **Authentication** in the left sidebar. Under **Advanced settings**, set:

- **Allow public client flows** → **Yes**

Click **Save**.

### 3. Configure API permissions

Go to **API permissions** in the left sidebar.

1. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
2. Search for `Tasks.ReadWrite` and check it, then click **Add permissions**
3. Remove the default `User.Read` permission (click **⋯** → **Remove permission** → confirm)

### 4. Copy your Client ID

Go to **Overview**. Copy the **Application (client) ID** — you'll need this for `todo setup`.

> **Note:** Do not create a client secret. This app uses PKCE (public client flow) and does not need one.

---

## Option 2: Azure CLI

### Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- Logged in: `az login`

### 1. Create the app registration

```bash
az ad app create \
  --display-name "Todo CLI" \
  --public-client-redirect-uris "http://localhost:3847/callback" \
  --sign-in-audience "AzureADandPersonalMicrosoftAccount" \
  --query appId -o tsv
```

This prints your **Application (client) ID**. Save it.

**`--sign-in-audience` options:**

| Value | Description |
|---|---|
| `PersonalMicrosoftAccount` | Personal Microsoft accounts only (@outlook.com, @hotmail.com, @live.com) |
| `AzureADandPersonalMicrosoftAccount` | Work/school + personal accounts |
| `AzureADMyOrg` | Single organization only |

### 2. Add Tasks.ReadWrite permission

```bash
# Microsoft Graph app ID: 00000003-0000-0000-c000-000000000000
# Tasks.ReadWrite permission ID: 2219042f-cab5-40cc-b0d2-16b1540b4c5f
az ad app permission add \
  --id <your-client-id> \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions 2219042f-cab5-40cc-b0d2-16b1540b4c5f=Scope
```

Replace `<your-client-id>` with the ID from the previous step.

---

## Account Type Guidance

| Account type | Tenant value | Example domains |
|---|---|---|
| Personal accounts | `consumers` (the default) | @outlook.com, @hotmail.com, @live.com |
| Work/school accounts | `common` or your org's tenant ID | @yourcompany.com |

To set the tenant explicitly:

```bash
export TODO_MCP_TENANT="common"
```

---

## Troubleshooting

### MailboxNotEnabledForRESTAPI

Personal Microsoft accounts without a mailbox may hit this error. **Solution:** Ensure you have a valid Microsoft To Do account — sign in at [https://to.do](https://to.do) first to provision your mailbox.

### AADSTS700016 (application not found)

Double-check your **client ID** and confirm the app registration exists in the correct tenant. If you registered for personal accounts only, ensure you're logging in with a personal account.

### AADSTS65001 (consent required)

The user needs to consent to the requested permissions. This happens automatically during `todo setup` — follow the browser prompt to grant consent.

### Redirect URI mismatch

Ensure the redirect URI is exactly `http://localhost:3847/callback` and the platform is set to **Public client/native (mobile & desktop)**. A mismatch in scheme, port, or path will cause authentication to fail.
