/**
 * Cross-cutting guards for every /api route.
 *
 * validateDateQuery — the report/list endpoints pass ?from=&to=… straight
 * into `new Date()` and on to MySQL, so a bad value came back as a 500
 * carrying the SQL error. Reject it up front with a 400 instead.
 *
 * sanitizeErrors — route catch blocks answer with `err.message`, which for
 * database errors leaks table, constraint and column internals. This
 * rewrites those bodies into a plain message with the right status, and
 * hides the text of any other 5xx. The original is still logged.
 */

const DATE_PARAMS = ['from', 'to', 'date', 'start', 'end', 'startDate', 'endDate', 'since', 'until'];

export function validateDateQuery(req, res, next) {
  for (const name of DATE_PARAMS) {
    const v = req.query[name];
    if (v == null || v === '') continue;
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
      return res.status(400).json({ message: `Invalid date for '${name}'` });
    }
  }
  next();
}

// [pattern, status, message] — first match wins. `$1` is the column name
// where the driver reports one.
const DB_ERRORS = [
  [/Cannot delete or update a parent row/i, 409, 'This record is still in use elsewhere and cannot be deleted'],
  [/Cannot add or update a child row|foreign key constraint/i, 400, 'A referenced record (product, location, account, supplier…) does not exist'],
  [/Duplicate entry/i, 409, 'A record with this value already exists'],
  [/notNull Violation: \w+\.(\w+) cannot be null/i, 400, 'Missing required field: $1'],
  [/(?:Incorrect \w+ value|Data truncated|Out of range value).*?column '(\w+)'/i, 400, "Invalid value for '$1'"],
  [/Incorrect \w+ value|Data truncated|Out of range value|Truncated incorrect|Invalid date/i, 400, 'Invalid value in request'],
  [/Unknown column|ER_\w+|SQL syntax|Sequelize\w*Error/i, 500, 'Something went wrong — please try again'],
];

export function sanitizeErrors(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    const msg = body && typeof body.message === 'string' ? body.message : null;
    if (msg && res.statusCode >= 400) {
      for (const [re, status, text] of DB_ERRORS) {
        const m = msg.match(re);
        if (!m) continue;
        console.error(`[api] ${req.method} ${req.originalUrl} → ${msg}`);
        res.status(status);
        return json({ ...body, message: text.replace('$1', m[1] || '') });
      }
      if (res.statusCode >= 500) {
        console.error(`[api] ${req.method} ${req.originalUrl} → ${msg}`);
        return json({ ...body, message: 'Something went wrong — please try again' });
      }
    }
    return json(body);
  };
  next();
}
