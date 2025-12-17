// routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../config/db");
const nodemailer = require("nodemailer");

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'tharunkumarreddy1212@gmail.com',
    pass: process.env.EMAIL_PASS || 'lucy drra jctw zadi'
  }
});

// In-memory OTP store (no database table needed)
const otpStore = new Map();

// Generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Clean expired OTPs
function cleanExpiredOTPs() {
  const now = Date.now();
  for (const [key, data] of otpStore.entries()) {
    if (data.expiresAt < now) {
      otpStore.delete(key);
    }
  }
}

// Clean OTPs every hour
setInterval(cleanExpiredOTPs, 60 * 60 * 1000);

// POST /api/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {}; // prevent destructure error

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const [rows] = await db.query("SELECT * FROM employees WHERE email = ?", [
      email,
    ]);

    if (rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        contactNo: user.contactNo,
        role: user.department,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/forgot-password - Send OTP to email
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ 
      success: false,
      error: "Email is required" 
    });
  }

  try {
    // Check if email exists in employees table
    const [rows] = await db.query(
      "SELECT id, email, name FROM employees WHERE email = ? AND status = 'Active'",
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Email not found or account not active" 
      });
    }

    const user = rows[0];
    const otp = generateOTP();
    
    // OTP expires in 10 minutes
    const expiresAt = Date.now() + 10 * 60 * 1000;
    
    // Store OTP in memory
    otpStore.set(email, {
      otp,
      expiresAt,
      attempts: 0,
      verified: false
    });

    // Send OTP via email
    const mailOptions = {
      from: process.env.EMAIL_USER || 'tharunkumarreddy1212@gmail.com',
      to: email,
      subject: 'Password Reset OTP - Employee Portal',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; color: white;">
            <h2 style="margin: 0;">Employee Portal</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Password Reset Request</p>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h3 style="color: #333; margin-bottom: 20px;">Hello ${user.name},</h3>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              You requested to reset your password for the Employee Portal. 
              Use the One-Time Password (OTP) below to proceed with resetting your password:
            </p>
            
            <div style="background: white; border-radius: 10px; padding: 25px; text-align: center; margin: 25px 0; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p style="color: #666; margin-bottom: 15px; font-size: 14px;">Your OTP Code:</p>
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; display: inline-block; margin: 10px 0;">
                <h1 style="margin: 0; font-size: 32px; letter-spacing: 10px; font-weight: bold;">${otp}</h1>
              </div>
              <p style="color: #ff6b6b; margin-top: 15px; font-size: 13px; font-weight: bold;">
                ⏰ This OTP will expire in 10 minutes
              </p>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px; font-size: 14px;">
              <strong>Important:</strong> 
              <ul style="color: #666; padding-left: 20px; margin: 15px 0;">
                <li>Do not share this OTP with anyone</li>
                <li>This OTP is valid for one-time use only</li>
                <li>If you didn't request this, please ignore this email</li>
              </ul>
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Email sending error:", error);
        return res.status(500).json({
          success: false,
          error: "Failed to send OTP email"
        });
      }

      res.status(200).json({
        success: true,
        message: "OTP has been sent to your email address"
      });
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to process forgot password request" 
    });
  }
});

// POST /api/verify-otp - Verify OTP before allowing password reset
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ 
      success: false,
      error: "Email and OTP are required" 
    });
  }

  try {
    const otpData = otpStore.get(email);
    
    if (!otpData) {
      return res.status(400).json({ 
        success: false,
        error: "OTP not found or expired" 
      });
    }

    // Check if OTP is expired
    if (Date.now() > otpData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        error: "OTP has expired" 
      });
    }

    // Check if OTP matches
    if (otpData.otp !== otp) {
      otpData.attempts++;
      
      // If too many failed attempts, delete OTP
      if (otpData.attempts >= 5) {
        otpStore.delete(email);
        return res.status(400).json({ 
          success: false,
          error: "Too many failed attempts. Please request a new OTP" 
        });
      }
      
      return res.status(400).json({ 
        success: false,
        error: "Invalid OTP" 
      });
    }

    // Mark OTP as verified
    otpData.verified = true;
    otpStore.set(email, otpData);

    res.status(200).json({
      success: true,
      message: "OTP verified successfully"
    });

  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to verify OTP" 
    });
  }
});

// POST /api/reset-password - Reset password with verified OTP
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ 
      success: false,
      error: "Email, OTP and new password are required" 
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ 
      success: false,
      error: "Password must be at least 6 characters long" 
    });
  }

  try {
    const otpData = otpStore.get(email);
    
    // Check if OTP exists and is verified
    if (!otpData || !otpData.verified || otpData.otp !== otp) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid or unverified OTP" 
      });
    }

    // Check if OTP is expired
    if (Date.now() > otpData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        error: "OTP has expired" 
      });
    }

    // Check if email exists
    const [rows] = await db.query(
      "SELECT id FROM employees WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Email not found" 
      });
    }

    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const updateQuery = "UPDATE employees SET password = ? WHERE email = ?";
    const [result] = await db.query(updateQuery, [hashedPassword, email]);

    if (result.affectedRows === 0) {
      return res.status(500).json({ 
        success: false,
        error: "Failed to update password" 
      });
    }

    // Delete OTP after successful password reset
    otpStore.delete(email);

    res.status(200).json({
      success: true,
      message: "Password reset successfully"
    });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to reset password" 
    });
  }
});

// POST /api/resend-otp - Resend OTP
router.post("/resend-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ 
      success: false,
      error: "Email is required" 
    });
  }

  try {
    // Check if user exists
    const [rows] = await db.query(
      "SELECT id, email, name FROM employees WHERE email = ? AND status = 'Active'",
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Email not found or account not active" 
      });
    }

    const user = rows[0];
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Update OTP in memory store
    otpStore.set(email, {
      otp,
      expiresAt,
      attempts: 0,
      verified: false
    });

    // Send new OTP via email
    const mailOptions = {
      from: process.env.EMAIL_USER || 'tharunkumarreddy1212@gmail.com',
      to: email,
      subject: 'New OTP - Employee Portal Password Reset',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; color: white;">
            <h2 style="margin: 0;">Employee Portal</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">New Password Reset OTP</p>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h3 style="color: #333; margin-bottom: 20px;">Hello ${user.name},</h3>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              Here is your new One-Time Password (OTP) as requested:
            </p>
            
            <div style="background: white; border-radius: 10px; padding: 25px; text-align: center; margin: 25px 0; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p style="color: #666; margin-bottom: 15px; font-size: 14px;">Your New OTP Code:</p>
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; display: inline-block; margin: 10px 0;">
                <h1 style="margin: 0; font-size: 32px; letter-spacing: 10px; font-weight: bold;">${otp}</h1>
              </div>
              <p style="color: #ff6b6b; margin-top: 15px; font-size: 13px; font-weight: bold;">
                ⏰ This OTP will expire in 10 minutes
              </p>
            </div>
            
            <p style="color: #999; font-size: 12px; margin: 20px 0 0 0; text-align: center;">
              If you didn't request a new OTP, please contact your system administrator.
            </p>
          </div>
        </div>
      `
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error("Resend email error:", error);
        return res.status(500).json({
          success: false,
          error: "Failed to send OTP email"
        });
      }

      res.status(200).json({
        success: true,
        message: "New OTP has been sent to your email"
      });
    });

  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to resend OTP" 
    });
  }
});

module.exports = router;