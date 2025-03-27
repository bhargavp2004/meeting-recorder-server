const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../models/prismaClient');

class AuthService {
  async registerUser(userData) {
    const { email, password, username } = userData;

    // Check if user already exists
    const existingUsername = await prisma.user.findFirst({ where: { username } });
    const existingEmail = await prisma.user.findFirst({ where: { email } });

    if (existingUsername && existingEmail) {
      throw new Error('Username and Email already exists');
    } else if (existingUsername) {
      throw new Error('Username already exists');
    } else if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in database
    const newUser = await prisma.user.create({
      data: { email, username, password: hashedPassword },
    });

    return {
      userId: newUser.id,
      email: newUser.email,
      token: this.generateToken(newUser)
    };
  }

  async loginUser(loginData) {
    const { email, password } = loginData;

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid email or password');

    // Validate password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new Error('Invalid email or password');

    return {
      userId: user.id,
      email: user.email,
      token: this.generateToken(user)
    };
  }

  async getUserInfo(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true },
    });
  }

  generateToken(user) {
    return jwt.sign(
      { userId: user.id, email: user.email }, 
      process.env.JWT_SECRET, 
      { expiresIn: "1h" }
    );
  }
}

module.exports = new AuthService();
