const { v4: uuid } = require('uuid');

const acceptedRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

const safeHeader = (value) => (
  typeof value === 'string' && acceptedRequestId.test(value) ? value : null
);

const correlationIdMiddleware = (req, res, next) => {
  const requestId = safeHeader(req.headers['x-request-id'])
    || safeHeader(req.headers['x-correlation-id'])
    || uuid();
  req.id = requestId;
  req.requestId = requestId;
  
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-ID', requestId);
  
  next();
};

module.exports = correlationIdMiddleware;
