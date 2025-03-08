const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const router = express.Router();
const cookieParser = require('cookie-parser'); 
const prisma = new PrismaClient();
router.use(cookieParser());
const cors = require("cors");
const authenticateUser = require("../middleware/authenticateUser");

const allowedOrigins = [
    process.env.CLIENT_URL,        
    process.env.EXTENSION_CLIENT_URL 
].filter(Boolean);

router.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, origin || true); // Reflect allowed origin or allow no-origin requests
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

router.get("/authenticate", authenticateUser, (req, res) => {
    res.json({ isAuthenticated: true, userId: req.user.userId });
});

router.post("/register", async (req, res) => {
    console.log("Register request received");
    try {
        const { email, password, username } = req.body;

        // Check if user already exists with username
        const existingUsername = await prisma.user.findFirst({ where: { username } });

        // Check if user already exists with email
        const existingEmail = await prisma.user.findFirst({ where: { email } });

        if(existingUsername && existingEmail) {
            return res.status(400).json({ message: "Username and Email already exists" });
        } else if (existingUsername) {
            return res.status(400).json({ message: "Username already exists" });
        } else if (existingEmail) {
            return res.status(400).json({ message: "Email already exists" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user in database
        const newUser = await prisma.user.create({
            data: { email, username, password: hashedPassword },
        });

        // Generate JWT token
        const token = jwt.sign({ userId: newUser.id, email: newUser.email }, process.env.JWT_SECRET, { expiresIn: "1h" });

        // Set token in an httpOnly cookie
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None", 
        });

        res.status(201).json({ message: "User registered successfully", userId: newUser.id });
    } catch (err) {
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

// Login User
// Login User with HttpOnly Cookie
router.post("/login", async (req, res) => {
    console.log("Login request received");
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ message: "Invalid email or password" });

        // Validate password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ message: "Invalid email or password" });

        // Generate JWT token
        const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });

        // Set cookie in response
        res.cookie("token", token, {
            httpOnly: true,    // Prevents access via JavaScript
            secure: process.env.NODE_ENV === "production",  // Use secure in production
            sameSite: "Strict", // Prevents CSRF attacks
            maxAge: 3600000,    // 1 hour expiration
        });

        res.json({ message: "Login successful" });
    } catch (err) {
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

router.get("/logout", (req, res) => {
    console.log("Logout request received");
    res.clearCookie("token");
    res.json({ message: "Logged out successfully" });
});

module.exports = router;
