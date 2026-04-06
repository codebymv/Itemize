const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { logger } = require('../utils/logger');

class S3Service {
    constructor() {
        this.isConfigured = false;
        this.bucket = process.env.AWS_S3_BUCKET || 'itemize-uploads';
        this.region = process.env.AWS_REGION || 'us-west-2';
        
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        
        if (!accessKeyId || !secretAccessKey) {
            logger.warn('[S3] AWS credentials not configured - S3 uploads disabled');
            this.client = null;
            return;
        }
        
        try {
            this.client = new S3Client({
                region: this.region,
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
            });
            this.isConfigured = true;
            logger.info('[S3] AWS S3 client initialized', { region: this.region, bucket: this.bucket });
        } catch (error) {
            logger.error('[S3] Failed to initialize S3 client', { error: error.message });
            this.client = null;
        }
    }

    async uploadFile(buffer, key, contentType) {
        if (!this.isConfigured) {
            throw new Error('S3 service is not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
        }
        
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));
        
        return this.getPublicUrl(key);
    }

    getPublicUrl(key) {
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }

    async deleteFile(key) {
        if (!this.isConfigured) {
            throw new Error('S3 service is not configured');
        }
        
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
    }

    async getFile(key) {
        if (!this.isConfigured) {
            throw new Error('S3 service is not configured');
        }
        
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
        return response;
    }
    
    async checkHealth() {
        if (!this.isConfigured) {
            return { configured: false, message: 'AWS credentials not set' };
        }
        
        try {
            // Simple health check - list objects with max 1 result
            const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
            await this.client.send(new ListObjectsV2Command({
                Bucket: this.bucket,
                MaxKeys: 1,
            }));
            return { configured: true, message: 'S3 connection healthy' };
        } catch (error) {
            return { configured: true, message: `S3 error: ${error.message}` };
        }
    }
}

module.exports = new S3Service();
