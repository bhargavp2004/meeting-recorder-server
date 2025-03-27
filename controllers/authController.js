const AuthService = require('../services/authService');

class AuthController {
  async register(req, res) {
    try {
      const result = await AuthService.registerUser(req.body);
      
      // Set token in an httpOnly cookie
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "None", 
      });

      res.status(201).json({ 
        message: "User registered successfully", 
        userId: result.userId 
      });
    } catch (err) {
      res.status(400).json({ 
        message: err.message 
      });
    }
  }

  async login(req, res) {
    try {
      const result = await AuthService.loginUser(req.body);
      
      // Set cookie in response
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 3600000, // 1 hour
      });

      res.json({ message: "Login successful" });
    } catch (err) {
      res.status(401).json({ 
        message: err.message 
      });
    }
  }

  async getUserInfo(req, res) {
    try {
      const user = await AuthService.getUserInfo(req.user.userId);
      res.status(200).json(user);
    } catch (err) {
      res.status(500).json({ 
        message: "Server Error", 
        error: err.message 
      });
    }
  }

  logout(req, res) {
    res.clearCookie("token");
    res.json({ message: "Logged out successfully" });
  }
}

module.exports = new AuthController();