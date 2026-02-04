const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

class S3Service {
    constructor() {
        this.client = new S3Client({
            region: process.env.AWS_REGION || 'us-west-2',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucket = process.env.AWS_S3_BUCKET || 'itemize-uploads';
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
        const region = process.env.AWS_REGION || 'us-west-2';
        return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
    }

    async deleteFile(key) {
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
    }

    async getFile(key) {
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
        return response;
    }
}

module.exports = new S3Service();
