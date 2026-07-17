const express = require('express');
const request = require('supertest');
const { validators } = require('../../validators');

function createApp() {
    const app = express();
    app.use(express.json());
    app.post('/contacts', validators.createContact, (req, res) => res.json(req.body));
    app.put('/contacts/:id', validators.updateContact, (req, res) => res.json(req.body));
    return app;
}

describe('contact validators', () => {
    const app = createApp();

    it.each([
        ['create', () => request(app).post('/contacts')],
        ['update', () => request(app).put('/contacts/1')],
    ])('accepts blank optional email and phone values on %s', async (_name, buildRequest) => {
        const response = await buildRequest().send({ email: '  ', phone: '  ' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ email: '', phone: '' });
    });

    it.each([
        ['create', () => request(app).post('/contacts')],
        ['update', () => request(app).put('/contacts/1')],
    ])('rejects malformed non-empty email and phone values on %s', async (_name, buildRequest) => {
        const response = await buildRequest().send({ email: 'invalid', phone: '123' });

        expect(response.status).toBe(400);
        expect(response.body.error.details).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'email', message: 'Invalid email format' }),
            expect.objectContaining({ field: 'phone', message: 'Invalid phone number' }),
        ]));
    });
});
