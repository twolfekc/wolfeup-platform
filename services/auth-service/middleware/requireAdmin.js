'use strict';

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || '';

module.exports = function requireAdmin(req, res, next) {
  // Check JWT cookie
  const token = req.cookies?.wolfeup_jwt;
  if (!token) {
    return res.status(403).json({ error: 'Forbidden — not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Forbidden — admin access required' });
    }
    req.jwtUser = decoded;
    return next();
  } catch (err) {
    return res.status(403).json({ error: 'Forbidden — invalid token' });
  }
};
