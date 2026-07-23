const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

jest.mock('../../services/signature-email.service', () => ({
    sendSignatureRequest: jest.fn().mockResolvedValue(true),
    sendSignatureCompleted: jest.fn().mockResolvedValue(true),
    sendDocumentCompleted: jest.fn().mockResolvedValue(true),
    sendSignatureDeclined: jest.fn().mockResolvedValue(true),
    sendSignatureReminder: jest.fn().mockResolvedValue(true),
    sendReminderEmails: jest.fn().mockResolvedValue(true),
    buildSignatureRequestEmail: jest.fn().mockReturnValue({ subject: 'Preview', html: '<p>Preview</p>' }),
}));
jest.mock('../../services/pdf-signature.service', () => ({
    generateSignedPdf: jest.fn().mockResolvedValue(null),
}));

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const signatureEmailService = require('../../services/signature-email.service');
const signatureService = require('../../services/signature.service');
const { SignatureFileCleanupService } = require('../../services/signature-file-cleanup.service');

function createApp(pool) {
    const app = express();
    app.use(cookieParser());
    app.use(express.json({ limit: '10mb' }));
    app.use((req, _res, next) => { req.dbPool = pool; next(); });
    app.use('/api/auth', require('../../auth').router);

    const noop = (_req, _res, next) => next();
    const broadcast = {
        listUpdate: jest.fn(), noteUpdate: jest.fn(), whiteboardUpdate: jest.fn(),
        wireframeUpdate: jest.fn(), userListUpdate: jest.fn(), userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
    };
    registerApiRoutes({
        app, pool, authenticateJWT, requireAdmin,
        publicRateLimit: noop, positionLimiter: noop,
        broadcast, io: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    return app;
}

function authenticated(req, account) {
    return req
        .set('Cookie', [`itemize_auth=${account.token}`])
        .set('x-organization-id', String(account.org.id));
}

describe('Signature lifecycle PostgreSQL contract', () => {
    let dbHelper;
    let app;
    let userA;
    let userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`signature-a-${Date.now()}@test.itemize`, 'Signature User A'),
            dbHelper.seedUser(`signature-b-${Date.now()}@test.itemize`, 'Signature User B'),
        ]);
    }, 30000);

    beforeEach(() => jest.clearAllMocks());
    afterAll(async () => dbHelper.teardown(), 30000);

    async function createDocument(account, title = `Signature ${Date.now()}`) {
        const response = await authenticated(
            request(app).post('/api/signatures/documents'),
            account
        ).send({ title, expiration_days: 7 });
        expect(response.status).toBe(201);
        return response.body.data;
    }

    async function addRecipient(account, documentId, email = 'recipient@test.itemize') {
        const response = await authenticated(
            request(app).put(`/api/signatures/documents/${documentId}`),
            account
        ).send({ recipients: [{ email, name: 'Recipient', signing_order: 1 }] });
        expect(response.status).toBe(200);
        return response.body.data;
    }

    it('retains monotonic source versions and enqueues all of them only when the draft file is removed', async () => {
        const document = await createDocument(userA, 'Retained version contract');
        const first = {
            buffer: Buffer.from('%PDF-1.7\nretained-first'),
            filename: `retained-first-${document.id}.pdf`,
            originalname: 'First.pdf',
            mimetype: 'application/pdf',
            size: 25,
        };
        const second = {
            buffer: Buffer.from('%PDF-1.7\nretained-second'),
            filename: `retained-second-${document.id}.pdf`,
            originalname: 'Second.pdf',
            mimetype: 'application/pdf',
            size: 26,
        };

        const firstUpload = await signatureService.uploadDocument(
            dbHelper.pool, userA.org.id, document.id, first
        );
        const secondUpload = await signatureService.uploadDocument(
            dbHelper.pool, userA.org.id, document.id, second
        );
        expect(firstUpload.file_url).not.toBe(secondUpload.file_url);

        const beforeRemoval = await dbHelper.pool.query(
            `SELECT version_number,file_url,original_sha256
             FROM signature_document_versions
             WHERE document_id=$1 ORDER BY version_number`,
            [document.id]
        );
        expect(beforeRemoval.rows).toEqual([
            expect.objectContaining({
                version_number: 1,
                file_url: firstUpload.file_url,
                original_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
            expect.objectContaining({
                version_number: 2,
                file_url: secondUpload.file_url,
                original_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
        ]);
        expect((await dbHelper.pool.query(
            'SELECT id FROM signature_file_deletion_jobs WHERE document_id=$1',
            [document.id]
        )).rows).toHaveLength(0);

        await signatureService.removeDocumentFile(dbHelper.pool, userA.org.id, document.id);
        expect((await dbHelper.pool.query(
            `SELECT file_url FROM signature_file_deletion_jobs
             WHERE document_id=$1 ORDER BY file_url`,
            [document.id]
        )).rows.map(row => row.file_url).sort()).toEqual(
            [firstUpload.file_url, secondUpload.file_url].sort()
        );
        expect((await dbHelper.pool.query(
            'SELECT id FROM signature_document_versions WHERE document_id=$1',
            [document.id]
        )).rows).toHaveLength(0);
        const cleanupJobs = await dbHelper.pool.query(
            `UPDATE signature_file_deletion_jobs SET next_attempt_at=NOW()
             WHERE document_id=$1 RETURNING id`,
            [document.id]
        );
        const cleanup = new SignatureFileCleanupService(dbHelper.pool);
        for (const job of cleanupJobs.rows) {
            await expect(cleanup.run({ jobId: Number(job.id) })).resolves.toMatchObject({
                claimed: 1,
                deleted: 1,
            });
        }
    });

    it('serves explicit retained-route byte ranges and evidence validators', async () => {
        const document = await createDocument(userA, 'Retained range contract');
        const bytes = Buffer.from('%PDF-1.7\nretained-range-contract');
        const filename = `retained-range-${document.id}.pdf`;
        const directory = path.resolve(__dirname, '../../../uploads/signatures');
        const filePath = path.join(directory, filename);
        await fs.promises.mkdir(directory, { recursive: true });
        await fs.promises.writeFile(filePath, bytes, { flag: 'wx' });
        const hash = createHash('sha256').update(bytes).digest('hex');
        const etag = `"sha256-${hash}"`;
        try {
            await dbHelper.pool.query(
                `UPDATE signature_documents SET
                   file_url=$1,file_name=$2,file_size=$3,file_type='application/pdf',
                   original_sha256=$4
                 WHERE id=$5 AND organization_id=$6`,
                [
                    `/uploads/signatures/${filename}`,
                    filename,
                    bytes.length,
                    hash,
                    document.id,
                    userA.org.id,
                ]
            );

            const ranged = await authenticated(
                request(app).get(`/api/signatures/documents/${document.id}/file`),
                userA
            ).set('Range', 'bytes=5-9');
            expect(ranged.status).toBe(206);
            expect(ranged.body).toEqual(bytes.subarray(5, 10));
            expect(ranged.headers).toMatchObject({
                'accept-ranges': 'bytes',
                'content-range': `bytes 5-9/${bytes.length}`,
                'content-length': '5',
                etag,
            });

            await authenticated(
                request(app).get(`/api/signatures/documents/${document.id}/file`),
                userA
            ).set('If-None-Match', etag).expect(304);

            const stale = await authenticated(
                request(app).get(`/api/signatures/documents/${document.id}/file`),
                userA
            )
                .set('Range', 'bytes=0-3')
                .set('If-Range', '"stale"');
            expect(stale.status).toBe(200);
            expect(stale.body).toEqual(bytes);

            await authenticated(
                request(app).get(`/api/signatures/documents/${document.id}/file`),
                userA
            )
                .set('Range', 'bytes=999-')
                .expect('Content-Range', `bytes */${bytes.length}`)
                .expect(416);
        } finally {
            await fs.promises.unlink(filePath).catch(() => undefined);
        }
    });

    it('allows exactly one concurrent initial send and records one sent event', async () => {
        const document = await createDocument(userA, 'Concurrent signature send');
        await addRecipient(userA, document.id, 'concurrent-sign@test.itemize');

        const send = () => authenticated(
            request(app).post(`/api/signatures/documents/${document.id}/send`),
            userA
        ).send({});
        const responses = await Promise.all([send(), send()]);

        expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
        const state = await dbHelper.pool.query(
            `SELECT d.status, r.signing_token_hash,
                    (SELECT COUNT(*) FROM signature_audit_log a WHERE a.document_id = d.id AND a.event_type = 'sent') AS sent_events
             FROM signature_documents d
             JOIN signature_recipients r ON r.document_id = d.id
             WHERE d.id = $1`,
            [document.id]
        );
        expect(state.rows[0].status).toBe('sent');
        expect(state.rows[0].signing_token_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(Number(state.rows[0].sent_events)).toBe(1);
        expect(signatureEmailService.sendSignatureRequest).toHaveBeenCalledTimes(1);
    });

    it('cancels atomically, revokes capabilities and pending reminders, and is idempotent', async () => {
        const document = await createDocument(userA, 'Cancellation contract');
        await addRecipient(userA, document.id, 'cancel-sign@test.itemize');
        const sendResponse = await authenticated(
            request(app).post(`/api/signatures/documents/${document.id}/send`),
            userA
        ).send({});
        expect(sendResponse.status).toBe(200);
        const signingUrl = signatureEmailService.sendSignatureRequest.mock.calls[0][0].signingUrl;
        const signingToken = signingUrl.split('/').pop();

        await dbHelper.pool.query(
            `INSERT INTO signature_reminders (document_id, recipient_id, scheduled_at, status)
             SELECT document_id, id, NOW() + INTERVAL '1 day', 'pending'
             FROM signature_recipients WHERE document_id = $1`,
            [document.id]
        );

        const cancel = () => authenticated(
            request(app).post(`/api/signatures/documents/${document.id}/cancel`),
            userA
        ).send({});
        expect((await cancel()).status).toBe(200);
        expect((await cancel()).status).toBe(200);

        const state = await dbHelper.pool.query(
            `SELECT d.status, r.signing_token_hash, r.routing_status, sr.status AS reminder_status,
                    (SELECT COUNT(*) FROM signature_audit_log a WHERE a.document_id = d.id AND a.event_type = 'cancelled') AS cancelled_events
             FROM signature_documents d
             JOIN signature_recipients r ON r.document_id = d.id
             JOIN signature_reminders sr ON sr.document_id = d.id
             WHERE d.id = $1`,
            [document.id]
        );
        expect(state.rows[0]).toMatchObject({
            status: 'cancelled',
            signing_token_hash: null,
            routing_status: 'locked',
            reminder_status: 'cancelled',
        });
        expect(Number(state.rows[0].cancelled_events)).toBe(1);

        const revoked = await request(app).get(`/api/public/sign/${signingToken}`);
        expect(revoked.status).toBe(404);
    });

    it('does not allow another organization to schedule reminders', async () => {
        const foreignDocument = await createDocument(userB, 'Foreign reminder target');
        await addRecipient(userB, foreignDocument.id, 'foreign-sign@test.itemize');
        await dbHelper.pool.query(
            "UPDATE signature_documents SET status = 'sent' WHERE id = $1",
            [foreignDocument.id]
        );

        const denied = await authenticated(
            request(app).post(`/api/signatures/documents/${foreignDocument.id}/reminders`),
            userA
        ).send({ days: 2 });
        expect(denied.status).toBe(404);

        const reminders = await dbHelper.pool.query(
            'SELECT COUNT(*) FROM signature_reminders WHERE document_id = $1',
            [foreignDocument.id]
        );
        expect(Number(reminders.rows[0].count)).toBe(0);
    });

    it('rejects invalid reminder delays and edits after the draft lifecycle', async () => {
        const document = await createDocument(userA, 'Immutable after send');
        await addRecipient(userA, document.id, 'immutable-sign@test.itemize');
        await dbHelper.pool.query("UPDATE signature_documents SET status = 'sent' WHERE id = $1", [document.id]);

        const invalidDelay = await authenticated(
            request(app).post(`/api/signatures/documents/${document.id}/reminders`),
            userA
        ).send({ days: 0 });
        expect(invalidDelay.status).toBe(400);

        const edit = await authenticated(
            request(app).put(`/api/signatures/documents/${document.id}`),
            userA
        ).send({ title: 'Illicit replacement title' });
        expect(edit.status).toBe(404);

        const persisted = await dbHelper.pool.query('SELECT title FROM signature_documents WHERE id = $1', [document.id]);
        expect(persisted.rows[0].title).toBe('Immutable after send');
    });

    it('reminds only active unsigned recipients without reopening signed recipients', async () => {
        const document = await createDocument(userA, 'Selective reminder');
        await dbHelper.pool.query(
            "UPDATE signature_documents SET status = 'in_progress', expires_at = NOW() + INTERVAL '7 days' WHERE id = $1",
            [document.id]
        );
        await dbHelper.pool.query(`
            INSERT INTO signature_recipients
                (document_id, organization_id, name, email, status, routing_status, signing_order)
            VALUES
                ($1, $2, 'Signed', 'signed@test.itemize', 'signed', 'active', 1),
                ($1, $2, 'Waiting', 'waiting@test.itemize', 'viewed', 'active', 2)
        `, [document.id, userA.org.id]);

        const response = await authenticated(
            request(app).post(`/api/signatures/documents/${document.id}/remind`),
            userA
        ).send({});
        expect(response.status).toBe(200);

        const recipients = await dbHelper.pool.query(
            'SELECT email, status, signing_token_hash FROM signature_recipients WHERE document_id = $1 ORDER BY signing_order',
            [document.id]
        );
        expect(recipients.rows[0]).toMatchObject({ email: 'signed@test.itemize', status: 'signed', signing_token_hash: null });
        expect(recipients.rows[1].status).toBe('viewed');
        expect(recipients.rows[1].signing_token_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(signatureEmailService.sendSignatureReminder).toHaveBeenCalledTimes(1);
        expect(signatureEmailService.sendSignatureReminder.mock.calls[0][0].to).toBe('waiting@test.itemize');
    });

    it('rejects fields outside the recipient signing contract', async () => {
        const document = await createDocument(userA, 'Unknown field rejection');
        await addRecipient(userA, document.id, 'field-sign@test.itemize');
        const sendResponse = await authenticated(
            request(app).post(`/api/signatures/documents/${document.id}/send`),
            userA
        ).send({});
        expect(sendResponse.status).toBe(200);
        const signingToken = signatureEmailService.sendSignatureRequest.mock.calls[0][0].signingUrl.split('/').pop();

        const response = await request(app)
            .post(`/api/public/sign/${signingToken}`)
            .send({ fields: [{ id: 999999, value: 'not-an-owned-field' }] });
        expect(response.status).toBe(400);

        const recipient = await dbHelper.pool.query(
            'SELECT status, signing_token_hash FROM signature_recipients WHERE document_id = $1',
            [document.id]
        );
        expect(recipient.rows[0].status).toBe('sent');
        expect(recipient.rows[0].signing_token_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('queues contract_signed for each linked contact when the document completes', async () => {
        const contact = await dbHelper.pool.query(`
            INSERT INTO contacts (organization_id, first_name, email, created_by)
            VALUES ($1, 'Contract', $2, $3)
            RETURNING id
        `, [
            userA.org.id,
            `contract-signed-${Date.now()}@test.itemize`,
            userA.user.id,
        ]);
        const document = await createDocument(userA, 'Contract signed trigger');
        const recipientResponse = await authenticated(
            request(app).put(`/api/signatures/documents/${document.id}`),
            userA
        ).send({
            recipients: [{
                contact_id: contact.rows[0].id,
                email: 'contract-recipient@test.itemize',
                name: 'Contract Recipient',
                signing_order: 1,
            }],
        });
        expect(recipientResponse.status).toBe(200);

        const sendResponse = await authenticated(
            request(app).post(`/api/signatures/documents/${document.id}/send`),
            userA
        ).send({});
        expect(sendResponse.status).toBe(200);
        const signingToken = signatureEmailService.sendSignatureRequest
            .mock.calls[0][0].signingUrl.split('/').pop();

        const signed = await request(app)
            .post(`/api/public/sign/${signingToken}`)
            .send({ fields: [] });
        expect(signed.status).toBe(200);

        const triggers = await dbHelper.pool.query(`
            SELECT event_key, contact_id, payload
            FROM workflow_triggers
            WHERE organization_id = $1
              AND trigger_type = 'contract_signed'
              AND entity_id = $2
        `, [userA.org.id, document.id]);
        expect(triggers.rows).toHaveLength(1);
        expect(triggers.rows[0]).toMatchObject({
            event_key: `domain:contract_signed:${document.id}:contact:${contact.rows[0].id}`,
            contact_id: contact.rows[0].id,
            payload: expect.objectContaining({
                document_id: document.id,
                document_title: 'Contract signed trigger',
            }),
        });
    });

    it('rejects unsupported signer assurance instead of silently bypassing it', async () => {
        const document = await createDocument(userA, 'Fail-closed identity method');
        const response = await authenticated(
            request(app).put(`/api/signatures/documents/${document.id}`),
            userA
        ).send({ recipients: [{ email: 'otp@test.itemize', identity_method: 'email_otp' }] });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain('not enabled');
        const count = await dbHelper.pool.query(
            'SELECT COUNT(*) FROM signature_recipients WHERE document_id = $1',
            [document.id]
        );
        expect(Number(count.rows[0].count)).toBe(0);
    });

    it('rejects cross-tenant recipient contacts and cross-document field recipients', async () => {
        const foreignContact = await dbHelper.pool.query(`
            INSERT INTO contacts (organization_id, first_name, email, source)
            VALUES ($1, 'Foreign', 'foreign-contact@test.itemize', 'manual')
            RETURNING id
        `, [userB.org.id]);
        const documentA = await createDocument(userA, 'Reference boundary A');
        const contactDenied = await authenticated(
            request(app).put(`/api/signatures/documents/${documentA.id}`),
            userA
        ).send({ recipients: [{ email: 'local@test.itemize', contact_id: foreignContact.rows[0].id }] });
        expect(contactDenied.status).toBe(400);

        const documentB = await createDocument(userA, 'Reference boundary B');
        await addRecipient(userA, documentB.id, 'document-b@test.itemize');
        const recipientB = await dbHelper.pool.query(
            'SELECT id FROM signature_recipients WHERE document_id = $1',
            [documentB.id]
        );
        const fieldDenied = await authenticated(
            request(app).put(`/api/signatures/documents/${documentA.id}`),
            userA
        ).send({ fields: [{
            recipient_id: recipientB.rows[0].id,
            field_type: 'signature',
            page_number: 1,
            x_position: 10,
            y_position: 10,
            width: 20,
            height: 10,
        }] });
        expect(fieldDenied.status).toBe(400);

        const fields = await dbHelper.pool.query(
            'SELECT COUNT(*) FROM signature_fields WHERE document_id = $1',
            [documentA.id]
        );
        expect(Number(fields.rows[0].count)).toBe(0);
    });
});
