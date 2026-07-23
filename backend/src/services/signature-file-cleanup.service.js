const fs = require('fs');
const {
    getLocalFilePath,
    getS3KeyFromUrl,
    s3Service,
} = require('./signature/storage');

const redactedError = error => String(error?.message || error || 'Signature file cleanup failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:sk|Bearer)\S+\b/gi, '[redacted-secret]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .slice(0, 500);

class SignatureFileCleanupService {
    constructor(pool, dependencies = {}) {
        this.pool = pool;
        this.unlink = dependencies.unlink || fs.promises.unlink;
        this.s3 = dependencies.s3Service === undefined ? s3Service : dependencies.s3Service;
        this.localPath = dependencies.getLocalFilePath || getLocalFilePath;
        this.s3Key = dependencies.getS3KeyFromUrl || getS3KeyFromUrl;
    }

    async run(options = {}) {
        const limit = this.integer(options.limit, 25, 1, 100);
        const leaseSeconds = this.integer(options.leaseSeconds, 300, 1, 3600);
        const maxAttempts = this.integer(options.maxAttempts, 5, 1, 20);
        const summary = { claimed: 0, deleted: 0, deferred: 0, retry: 0, deadLetter: 0 };
        for (let index = 0; index < limit; index += 1) {
            const claim = await this.claim(leaseSeconds, options.jobId || null);
            if (!claim) break;
            summary.claimed += 1;
            try {
                if (await this.isReferenced(claim.file_url)) {
                    await this.defer(claim);
                    summary.deferred += 1;
                } else {
                    await this.removeOwnedFile(claim.file_url);
                    await this.complete(claim);
                    summary.deleted += 1;
                }
            } catch (error) {
                const retryable = error?.retryable !== false;
                const outcome = await this.fail(claim, error, retryable, maxAttempts);
                if (outcome === 'retry') summary.retry += 1;
                else summary.deadLetter += 1;
            }
            if (options.jobId) break;
        }
        return summary;
    }

    async claim(leaseSeconds, jobId) {
        const result = await this.pool.query(
            `WITH candidate AS (
               SELECT id FROM signature_file_deletion_jobs
               WHERE ($2::bigint IS NULL OR id=$2)
                 AND ((status IN ('queued','retry') AND next_attempt_at<=CURRENT_TIMESTAMP)
                   OR (status='processing' AND lease_expires_at<=CURRENT_TIMESTAMP))
               ORDER BY next_attempt_at,id
               FOR UPDATE SKIP LOCKED LIMIT 1
             )
             UPDATE signature_file_deletion_jobs job
             SET status='processing',attempt_count=attempt_count+1,
               lease_expires_at=CURRENT_TIMESTAMP+($1::int*INTERVAL '1 second'),
               claimed_by=$3,last_error=NULL,updated_at=CURRENT_TIMESTAMP
             FROM candidate WHERE job.id=candidate.id RETURNING job.*`,
            [leaseSeconds, jobId, `backend:${process.pid}`]
        );
        return result.rows[0] || null;
    }

    async isReferenced(fileUrl) {
        const result = await this.pool.query(
            `SELECT EXISTS (
               SELECT 1 FROM signature_documents WHERE file_url=$1
               UNION ALL
               SELECT 1 FROM signature_templates WHERE file_url=$1
             ) AS referenced`,
            [fileUrl]
        );
        return result.rows[0]?.referenced === true;
    }

    async removeOwnedFile(fileUrl) {
        if (fileUrl.startsWith('/uploads/signatures/')) {
            const path = this.localPath(fileUrl);
            if (!path) throw Object.assign(new Error('File locator is not server-owned storage'), { retryable: false });
            try {
                await this.unlink(path);
            } catch (error) {
                if (error?.code !== 'ENOENT') throw error;
            }
            return;
        }
        const key = this.s3Key(fileUrl);
        if (!key) throw Object.assign(new Error('File locator is not server-owned storage'), { retryable: false });
        if (!this.s3?.isConfigured) throw new Error('Signature S3 cleanup is unavailable');
        await this.s3.deleteFile(key);
    }

    complete(claim) {
        return this.updateClaim(
            claim,
            `status='deleted',deleted_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,
             claimed_by=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP`,
            []
        );
    }

    defer(claim) {
        return this.updateClaim(
            claim,
            `status='queued',next_attempt_at=CURRENT_TIMESTAMP+INTERVAL '1 day',
             lease_expires_at=NULL,claimed_by=NULL,last_error='File remains referenced',
             updated_at=CURRENT_TIMESTAMP`,
            []
        );
    }

    async fail(claim, error, retryable, maxAttempts) {
        const status = !retryable || Number(claim.attempt_count) >= maxAttempts
            ? 'dead_letter' : 'retry';
        await this.updateClaim(
            claim,
            `status=$3,next_attempt_at=CASE WHEN $3='retry'
               THEN CURRENT_TIMESTAMP+(LEAST(3600,POWER(2,GREATEST(attempt_count-1)))*
                 INTERVAL '1 minute') ELSE next_attempt_at END,
             lease_expires_at=NULL,claimed_by=NULL,last_error=$4,updated_at=CURRENT_TIMESTAMP`,
            [status, redactedError(error)]
        );
        return status === 'retry' ? 'retry' : 'dead_letter';
    }

    async updateClaim(claim, assignments, additional) {
        const parameters = [claim.id, claim.attempt_count, ...additional];
        const result = await this.pool.query(
            `UPDATE signature_file_deletion_jobs SET ${assignments}
             WHERE id=$1 AND status='processing' AND attempt_count=$2 RETURNING id`,
            parameters
        );
        if (!result.rows[0]) throw new Error('Signature file cleanup claim is stale');
    }

    integer(value, fallback, minimum, maximum) {
        const parsed = Number(value ?? fallback);
        return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
            ? parsed : fallback;
    }
}

module.exports = { SignatureFileCleanupService, redactedError };
