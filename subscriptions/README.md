# subscriptionInfo Function

The **subscriptionInfo** function provides information about subscription status for various organizations.

## URL format

The URL used to access this function uses the following format:

`http://api.bloomlibrary.org/v1/subscriptionInfo/{code}`

### Parameters

- **code** - A required parameter that identifies the subscription request.

## Response

The function returns JSON with the following possible responses:

### Success (200)

Returns a JSON object with Content-Type: application/json

```json
{
  "code": string,
  "replacementCode": string,
  "tier": string,
  "brandingLabel": string,
  "showMessage": string
}
```

### Errors

- **400** - Missing required parameter: code
- **404** - "Did not find a row with that code" or "No data found"
- **500** - Server error with message

## Environment Variables

The function requires the following environment variables:

- BLOOM_GOOGLE_SERVICE_ACCOUNT_EMAIL
- BLOOM_GOOGLE_SERVICE_PRIVATE_KEY
- BLOOM_SUBSCRIPTION_SPREADSHEET_ID
