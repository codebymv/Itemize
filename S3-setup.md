# S3 Storage Setup for Itemize

## Problem

Railway uses ephemeral filesystem storage. When the container restarts or redeploys:
- Uploaded files (logos, attachments) are lost
- Image URLs break, showing broken placeholders
- PDFs can't embed logos because the files no longer exist

## Solution: AWS S3 (or S3-Compatible Storage)

Use S3 for persistent file storage. Options include:
- **AWS S3** - Industry standard, reliable
- **Cloudflare R2** - S3-compatible, no egress fees
- **DigitalOcean Spaces** - S3-compatible, simple pricing
- **Backblaze B2** - S3-compatible, very cheap

## Implementation Plan

### Phase 1: AWS S3 Setup

1. **Create S3 Bucket**
   ```
   Bucket name: itemize-uploads
   Region: us-east-1 (or closest to your users)
   Block public access: OFF (for public logo URLs)
   ```

2. **Create IAM User**
   ```
   User: itemize-s3-user
   Policy: Custom policy with S3 access to itemize-uploads bucket
   ```

3. **IAM Policy**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::itemize-uploads",
           "arn:aws:s3:::itemize-uploads/*"
         ]
       }
     ]
   }
   ```

4. **Bucket Policy (for public read access to logos)**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::itemize-uploads/logos/*"
       }
     ]
   }
   ```

### Phase 2: Environment Variables

Add to Railway:
```
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=itemize-uploads
```

### Phase 3: Backend Code Changes

1. **Install AWS SDK**
   ```bash
   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
   ```

2. **Create S3 Service** (`backend/src/services/s3.service.js`)
   ```javascript
   const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
   
   class S3Service {
     constructor() {
       this.client = new S3Client({
         region: process.env.AWS_REGION || 'us-east-1',
         credentials: {
           accessKeyId: process.env.AWS_ACCESS_KEY_ID,
           secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
         },
       });
       this.bucket = process.env.AWS_S3_BUCKET;
     }
   
     async uploadFile(buffer, key, contentType) {
       await this.client.send(new PutObjectCommand({
         Bucket: this.bucket,
         Key: key,
         Body: buffer,
         ContentType: contentType,
       }));
       
       return this.getPublicUrl(key);
     }
   
     getPublicUrl(key) {
       return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
     }
   
     async deleteFile(key) {
       await this.client.send(new DeleteObjectCommand({
         Bucket: this.bucket,
         Key: key,
       }));
     }
   }
   
   module.exports = new S3Service();
   ```

3. **Update Logo Upload Route** (`backend/src/routes/invoices.routes.js`)
   - Change from saving to local filesystem to uploading to S3
   - Store S3 URL in database instead of local path
   - Delete old file from S3 when updating logo

4. **Update PDF Service**
   - Logos are now public S3 URLs that puppeteer can access directly
   - No need for special handling - URLs are publicly accessible

### Phase 4: Migration

1. **Migrate existing logos** (if any exist)
   - Download from current location
   - Upload to S3
   - Update database URLs

2. **Remove local upload directory**
   - Remove `/uploads/logos` from code
   - Remove static file serving for uploads

### Phase 5: Frontend Changes

1. **Update logo display**
   - Use full S3 URLs directly
   - Remove `getAssetUrl()` helper for logo URLs (they're now absolute)

## File Structure After Implementation

```
backend/
  src/
    services/
      s3.service.js      # New S3 service
      pdf.service.js     # No changes needed (URLs work directly)
    routes/
      invoices.routes.js # Updated logo upload to use S3
```

## Alternative: Cloudflare R2

If you prefer Cloudflare R2 (no egress fees):

1. **Create R2 Bucket** in Cloudflare dashboard
2. **Enable public access** with custom domain or R2.dev URL
3. **Get API credentials** from R2 settings
4. **Use S3-compatible endpoint**:
   ```
   AWS_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   AWS_ACCESS_KEY_ID=<r2-access-key>
   AWS_SECRET_ACCESS_KEY=<r2-secret-key>
   AWS_S3_BUCKET=itemize-uploads
   ```

## Cost Estimates

### AWS S3 (us-east-1)
- Storage: $0.023/GB/month
- PUT requests: $0.005/1000
- GET requests: $0.0004/1000
- Data transfer: $0.09/GB (first 10TB)

For a small app with ~100 logos (~5MB total):
- **~$0.12/month** storage
- **~$0.50/month** requests
- **Total: ~$1/month**

### Cloudflare R2
- Storage: $0.015/GB/month
- Class A ops: $4.50/million
- Class B ops: $0.36/million
- **No egress fees!**

For same usage:
- **Total: ~$0.10/month**

## Implementation Priority

1. ✅ Create S3 bucket and credentials
2. ✅ Add environment variables to Railway
3. ✅ Install AWS SDK
4. ✅ Create S3 service
5. ✅ Update logo upload route
6. ✅ Test logo persistence across deploys
7. ✅ Verify PDFs can access logos

## Notes

- Logos must be publicly accessible for PDF generation to work
- Consider using CloudFront CDN for better performance (optional)
- Set up lifecycle rules to delete old/unused files (optional)
- Consider image resizing/optimization on upload (optional)
