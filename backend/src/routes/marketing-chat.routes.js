const crypto = require('crypto');
const express = require('express');
const marketingChatService = require('../services/marketingChatService');
const { sendError, sendSuccess } = require('../utils/response');
const { logger } = require('../utils/logger');

const ASK_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 500;
const inMemoryAskTokens = new Map();

function getTokenSecret() {
    return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'development-marketing-chat-secret';
}

function generateAskToken() {
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();
    const payload = `${nonce}.${timestamp}`;
    const signature = crypto.createHmac('sha256', getTokenSecret()).update(payload).digest('hex');
    return `${payload}.${signature}`;
}

function issueAskToken() {
    const token = generateAskToken();
    inMemoryAskTokens.set(token, Date.now() + ASK_TOKEN_TTL_MS);
    return token;
}

function consumeAskToken(token) {
    if (!token || typeof token !== 'string' || token.length > 200) {
        return false;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        return false;
    }

    const [nonce, timestamp, signature] = parts;
    const expected = crypto.createHmac('sha256', getTokenSecret()).update(`${nonce}.${timestamp}`).digest('hex');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return false;
    }

    const expiresAt = inMemoryAskTokens.get(token);
    if (!expiresAt || Date.now() > expiresAt) {
        inMemoryAskTokens.delete(token);
        return false;
    }

    inMemoryAskTokens.delete(token);
    return true;
}

function validateMessages(messages) {
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
        return null;
    }

    const sanitized = [];
    for (const message of messages) {
        const role = message?.role;
        const content = typeof message?.content === 'string' ? message.content.trim() : '';
        if (!['user', 'assistant'].includes(role) || !content || content.length > MAX_MESSAGE_LENGTH) {
            return null;
        }
        sanitized.push({ role, content });
    }

    return sanitized;
}

module.exports = (publicRateLimit) => {
    const router = express.Router();

    router.get('/token', publicRateLimit, (_req, res) => {
        sendSuccess(res, { token: issueAskToken() });
    });

    router.post('/ask', publicRateLimit, async (req, res) => {
        try {
            const token = req.headers['x-ask-token'] || '';
            if (!consumeAskToken(token)) {
                return sendError(res, 'Session expired. Please try again.', 401, 'AUTH_UNAUTHORIZED');
            }

            const messages = validateMessages(req.body?.messages);
            if (!messages) {
                return sendError(res, 'Invalid request', 400, 'VALIDATION_ERROR');
            }

            const reply = await marketingChatService.answer(messages, { ip: req.ip });
            sendSuccess(res, { reply });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('[MarketingChat] Failed to answer', { error: message });

            if (/quota|rate.?limit|429/i.test(message)) {
                return sendError(res, 'The assistant is busy right now. Please try again shortly.', 429, 'RATE_LIMIT_EXCEEDED');
            }

            return sendError(res, 'The assistant is temporarily unavailable.', 500, 'MARKETING_CHAT_UNAVAILABLE');
        }
    });

    return router;
};
