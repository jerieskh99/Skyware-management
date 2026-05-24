# Attachment storage setup (Phase 3 §5.3)

Attachments are stored in an S3-compatible bucket. The portal uses the
official AWS SDK v3, which works against AWS S3, Cloudflare R2, MinIO, or
any other S3 API implementation.

## Environment variables

| Var | Required | Notes |
| --- | --- | --- |
| `S3_ENDPOINT` | yes | Full URL, no trailing slash. Example below. |
| `S3_REGION` | no (default `auto`) | Required for AWS, ignored by R2. |
| `S3_BUCKET` | yes | Existing bucket. Create it before first run. |
| `S3_ACCESS_KEY_ID` | yes | Access key with `s3:Put/Get/Delete` on the bucket. |
| `S3_SECRET_ACCESS_KEY` | yes | Paired secret. |
| `S3_FORCE_PATH_STYLE` | no (default `false`) | Set to `true` for MinIO. |
| `S3_PUBLIC_URL` | no | Reserved for a future CDN front. Not used yet. |

The feature flag `attachments_enabled` controls whether the UI surfaces
the uploader and whether `/api/attachments` accepts requests. It defaults
to `false`. Flip it from the Admin Panel after S3 is configured.

## Cloudflare R2

```
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=skyware-attachments
S3_ACCESS_KEY_ID=<R2 access key>
S3_SECRET_ACCESS_KEY=<R2 secret>
S3_FORCE_PATH_STYLE=false
```

R2 requires `region=auto`. CORS must allow `PUT` from your portal origin
for direct browser uploads to succeed.

## AWS S3

```
S3_ENDPOINT=https://s3.eu-west-1.amazonaws.com
S3_REGION=eu-west-1
S3_BUCKET=skyware-attachments
S3_ACCESS_KEY_ID=<IAM access key>
S3_SECRET_ACCESS_KEY=<IAM secret>
S3_FORCE_PATH_STYLE=false
```

The IAM principal needs at minimum:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`

Scope the policy to `arn:aws:s3:::<bucket>/attachments/*`.

## MinIO (local dev)

```
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=skyware-attachments
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

MinIO needs `forcePathStyle=true`. Create the bucket and CORS up-front:

```
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/skyware-attachments
mc anonymous set-json /tmp/cors.json local/skyware-attachments  # optional
```

## Object layout

Files are stored at:

```
attachments/<YYYY>/<MM>/<attachment-uuid>/<sanitized-filename>
```

The `attachment-uuid` is the `Attachment.id` row id, which is also the
canonical handle in the API. Filenames are stripped of path separators
and control characters and have their extension lower-cased before being
used in the object key.

## Upload policy

Enforced in both `lib/storage/upload-policy.ts` (server) and the client
uploader before any network call:

- Max size: 50 MB.
- Allowed MIME types: images, PDF, Office documents (.docx, .xlsx,
  .pptx, .doc), plain text, and zip archives.

Anything else is rejected with HTTP 400.

## Visibility

Each attachment row carries a `visibility` flag:

- `public_in_org` (default) — readable by any authenticated user who can
  see the parent (job, post, reply).
- `admin_only` — readable by admins only, regardless of parent scope.

Download URLs are presigned per request and expire in 5 minutes.
