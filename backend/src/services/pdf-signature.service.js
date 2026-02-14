/**
 * PDF Signature Service
 * Applies signature fields to existing PDFs and appends a certificate page
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { withDbClient } = require('../utils/db');
const { logger } = require('../utils/logger');

let s3Service = null;
try {
    s3Service = require('./s3.service');
} catch (e) {
    logger.info('S3 service not available - signed PDFs will use local storage');
}

function isRemoteUrl(url) {
    return url?.startsWith('http://') || url?.startsWith('https://');
}

async function loadPdfBytes(fileUrl) {
    if (!fileUrl) return null;

    if (isRemoteUrl(fileUrl)) {
        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch PDF from ${fileUrl}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    if (fileUrl.startsWith('/uploads/')) {
        const relativePath = fileUrl.replace('/uploads/', '');
        const fullPath = path.join(__dirname, '../uploads', relativePath);
        return fs.promises.readFile(fullPath);
    }

    return null;
}

function percentToPoints(percent, total) {
    return (parseFloat(percent) / 100) * total;
}

async function embedFieldOnPage(pdfDoc, page, field, font) {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const boxWidth = percentToPoints(field.width, pageWidth);
    const boxHeight = percentToPoints(field.height, pageHeight);
    const x = percentToPoints(field.x_position, pageWidth);
    const yTop = percentToPoints(field.y_position, pageHeight);
    const y = pageHeight - yTop - boxHeight;

    if (field.field_type === 'signature' || field.field_type === 'initials') {
        if (!field.value) return;

        const match = String(field.value).match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) return;
        const contentType = match[1];
        const base64 = match[2];
        const imageBytes = Buffer.from(base64, 'base64');
        const image = contentType.includes('png')
            ? await pdfDoc.embedPng(imageBytes)
            : await pdfDoc.embedJpg(imageBytes);

        page.drawImage(image, {
            x,
            y,
            width: boxWidth,
            height: boxHeight
        });
        return;
    }

    if (field.field_type === 'checkbox') {
        const checked = String(field.value).toLowerCase() === 'true';
        if (checked) {
            page.drawText('✓', {
                x: x + 2,
                y: y + 2,
                size: Math.min(boxHeight, 18),
                font,
                color: rgb(0.1, 0.1, 0.1)
            });
        }
        return;
    }

    const textValue = field.value ? String(field.value) : '';
    if (!textValue) return;

    const fontSize = field.font_size || Math.min(12, boxHeight - 2);
    page.drawText(textValue, {
        x: x + 2,
        y: y + 2,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1)
    });
}

async function appendCertificatePage(pdfDoc, document, recipients, auditLogs) {
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 60;
    const lineGap = 16;

    page.drawText('Certificate of Completion', {
        x: 40,
        y,
        size: 18,
        font: fontBold
    });
    y -= lineGap * 2;

    page.drawText(`Document: ${document.title || 'Untitled'}`, { x: 40, y, size: 12, font });
    y -= lineGap;
    if (document.document_number) {
        page.drawText(`Document ID: ${document.document_number}`, { x: 40, y, size: 12, font });
        y -= lineGap;
    }
    if (document.original_sha256) {
        page.drawText(`Original SHA-256: ${document.original_sha256}`, { x: 40, y, size: 10, font });
        y -= lineGap;
    }

    y -= lineGap;
    page.drawText('Recipients', { x: 40, y, size: 12, font: fontBold });
    y -= lineGap;

    for (const recipient of recipients) {
        const signedAt = recipient.signed_at ? new Date(recipient.signed_at).toISOString() : 'N/A';
        page.drawText(`- ${recipient.name || recipient.email} (${recipient.email})`, { x: 40, y, size: 10, font });
        y -= lineGap;
        page.drawText(`  Signed at: ${signedAt}`, { x: 50, y, size: 9, font });
        y -= lineGap;
    }

    y -= lineGap;
    page.drawText('Audit Log', { x: 40, y, size: 12, font: fontBold });
    y -= lineGap;

    for (const audit of auditLogs.slice(-10)) {
        const eventTime = audit.created_at ? new Date(audit.created_at).toISOString() : '';
        page.drawText(`${eventTime} - ${audit.event_type} - ${audit.description || ''}`, {
            x: 40,
            y,
            size: 9,
            font
        });
        y -= lineGap;
        if (y < 60) break;
    }
}

async function writeSignedPdf(bytes, organizationId, documentId) {
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

    if (s3Service && process.env.AWS_ACCESS_KEY_ID) {
        const key = `signatures/${organizationId}/${documentId}/signed-${Date.now()}.pdf`;
        const fileUrl = await s3Service.uploadFile(bytes, key, 'application/pdf');
        return { fileUrl, sha256 };
    }

    const uploadsDir = path.join(__dirname, '../uploads/signatures');
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    const filename = `signed-${documentId}-${Date.now()}.pdf`;
    const filePath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(filePath, bytes);

    return { fileUrl: `/uploads/signatures/${filename}`, sha256 };
}

async function generateSignedPdf({ pool, documentId, organizationId }) {
    return withDbClient(pool, async (client) => {
        const documentResult = await client.query(
            'SELECT * FROM signature_documents WHERE id = $1 AND organization_id = $2',
            [documentId, organizationId]
        );
        if (documentResult.rows.length === 0) return null;

        const document = documentResult.rows[0];
        const fileBytes = await loadPdfBytes(document.file_url);
        if (!fileBytes) {
            throw new Error('Original PDF not available');
        }

        const pdfDoc = await PDFDocument.load(fileBytes);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const fieldsResult = await client.query(
            'SELECT * FROM signature_fields WHERE document_id = $1 ORDER BY id ASC',
            [documentId]
        );

        for (const field of fieldsResult.rows) {
            const pageIndex = Math.max(0, (field.page_number || 1) - 1);
            const page = pdfDoc.getPage(pageIndex);
            if (!page) continue;
            await embedFieldOnPage(pdfDoc, page, field, font);
        }

        const recipientsResult = await client.query(
            'SELECT * FROM signature_recipients WHERE document_id = $1 ORDER BY signing_order ASC',
            [documentId]
        );
        const auditResult = await client.query(
            'SELECT * FROM signature_audit_log WHERE document_id = $1 ORDER BY created_at ASC',
            [documentId]
        );

        await appendCertificatePage(pdfDoc, document, recipientsResult.rows, auditResult.rows);

        const pdfBytes = await pdfDoc.save();
        return writeSignedPdf(Buffer.from(pdfBytes), organizationId, documentId);
    });
}

module.exports = {
    generateSignedPdf
};
