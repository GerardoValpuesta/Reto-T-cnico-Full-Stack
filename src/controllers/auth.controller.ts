import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/index.js';
import { config } from '../config/index.js';

export async function login(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const userRes = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials or user not found' });
    }

    const user = userRes.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error('Error during login:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
