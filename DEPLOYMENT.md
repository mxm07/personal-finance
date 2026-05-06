# Deployment

## Amplify Hosting SSR

This app runs as an Amplify Hosting SSR app and reads/writes DynamoDB from the
server-side compute process.

Set these branch environment variables in Amplify for the hosted branch:

- `APP_AWS_REGION`
- `APP_BASE_URL`
- `DYNAMODB_TABLE_NAME`
- `GOOGLE_ALLOWED_EMAILS`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_PASSWORD`

`SESSION_PASSWORD` must be at least 32 characters.

## DynamoDB Permissions

Amplify SSR compute needs an IAM SSR Compute role. The build service role is not
enough, because the dashboard reads DynamoDB at request time.

Create an IAM role with this trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "amplify.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Attach a least-privilege policy for the finance table:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:DeleteItem",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/TABLE_NAME"
    }
  ]
}
```

Then attach that role in Amplify:

`App settings` -> `IAM roles` -> `Compute role`

Use the app-level default role or a branch override for the hosted branch.
