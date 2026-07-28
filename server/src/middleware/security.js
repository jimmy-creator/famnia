// XSS sanitization — strip HTML/script tags from all string inputs
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const key of Object.keys(value)) {
      sanitized[key] = sanitizeValue(value[key]);
    }
    return sanitized;
  }
  return value;
}

// Middleware: sanitize req.body (query and params are read-only in Express 5)
export const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
};

// Middleware: block NoSQL injection patterns ($ and . in keys)
export const preventInjection = (req, res, next) => {
  const check = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) return true;
      if (typeof obj[key] === 'object' && check(obj[key])) return true;
    }
    return false;
  };

  if (check(req.body)) {
    return res.status(400).json({ message: 'Invalid input' });
  }
  next();
};

// Middleware: log admin actions
export const adminLogger = (req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    console.log(`[ADMIN] ${req.method} ${req.originalUrl} by ${req.user?.email || 'unknown'} — ${res.statusCode}`);
    return originalSend.call(this, body);
  };
  next();
};

// Middleware: force HTTPS in production (skip internal proxy requests)
export const forceHttps = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' &&
      req.headers['x-forwarded-proto'] !== 'https' &&
      !req.secure &&
      req.headers['x-forwarded-proto']) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
};
