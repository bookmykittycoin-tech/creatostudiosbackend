const jwt = require('jsonwebtoken');
const { STATUS_CODE } = require('../utils/statusCode');

const authMiddleware = (req, res, next) => {
  try {
    // 1️⃣ Get Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({
        message: 'Authorization header missing',
      });
    }

    // 2️⃣ Must start with "Bearer "
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({
        message: 'Invalid authorization format',
      });
    }

    // 3️⃣ Extract token
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({
        message: 'Token missing',
      });
    }

    // 4️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 5️⃣ Attach user info to request
    req.user = decoded; // { id, email }

    // 6️⃣ Continue
    next();

  } catch (error) {
    return res.status(STATUS_CODE.UNAUTHORIZED).json({
      message: 'Invalid or expired token',
    });
  }
};

module.exports = authMiddleware;
