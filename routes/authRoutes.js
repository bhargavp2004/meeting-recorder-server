const express = require("express");
const router = express.Router();
const cors = require("cors");
const cookieParser = require('cookie-parser');

const AuthController = require('../controllers/authController');
const { 
  registerValidationSchema, 
  loginValidationSchema, 
  validate 
} = require('../validators/authValidator');
const authenticateUser = require('../middleware/authenticateUser');

const allowedOrigins = [
    process.env.CLIENT_URL,        
    process.env.EXTENSION_CLIENT_URL 
].filter(Boolean);

router.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, origin || true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

router.use(cookieParser());

router.get("/authenticate", authenticateUser, (req, res) => {
    res.json({ isAuthenticated: true, userId: req.user.userId });
});

router.get("/getUserInfo", authenticateUser, AuthController.getUserInfo);

router.post(
  "/register", 
//   validate(registerValidationSchema),
  AuthController.register
);

router.post(
  "/login", 
//   validate(loginValidationSchema),
  AuthController.login
);

router.get("/logout", AuthController.logout);

module.exports = router;