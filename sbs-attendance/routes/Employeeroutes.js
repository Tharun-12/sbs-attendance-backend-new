const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Accept 3 files
const upload = multer({ storage: storage }).fields([
  { name: 'image', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
  { name: 'aadhaar_card', maxCount: 1 },
]);

// POST - Create new employee
const bcrypt = require("bcrypt");

// POST - Create new employee
router.post('/', upload, async (req, res) => {
  try {
    console.log("➡️ req.body:", req.body);
    console.log("➡️ req.files:", req.files);

    const {
      name, email, contact_no, alternate_contact_no, aadhaar_card_number,
      pan_card, driving_license, dob, gender, department,
      education_qualification, experience, skills, ctc, expected_ctc,
      current_organization, current_industry_type, location, city, state,
      status = 'active', uan_number
    } = req.body;

    const image = req.files?.image ? req.files.image[0].filename : null;
    const resume = req.files?.resume ? req.files.resume[0].filename : null;
    const aadhaar_card = req.files?.aadhaar_card ? req.files.aadhaar_card[0].filename : null;

    // check existing email
    const [existing] = await db.execute('SELECT id FROM employees WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Employee with this email already exists' });
    }

    // 🔑 Generate password = Name@123
    const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
    const plainPassword = `${formattedName}@123`;

    // 🔒 Hash password
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const query = `INSERT INTO employees (
      name, email, password, contactNo, alternateContactNo, aadhaarCardNumber,
      panCard, drivingLicense, dob, gender, department, educationQualification,
      experience, skills, ctc, expectedCtc, currentOrganization,
      currentIndustryType, location, city, state, image, resume,
      aadhaarCard, status, uanNumber, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

    const [result] = await db.execute(query, [
      name, email, hashedPassword, contact_no, alternate_contact_no, aadhaar_card_number,
      pan_card, driving_license, dob, gender, department, education_qualification,
      experience, skills, ctc, expected_ctc, current_organization,
      current_industry_type, location, city, state, image, resume,
      aadhaar_card, status, uan_number
    ]);

    // You may also email plainPassword to employee’s email here with nodemailer (optional)

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: { id: result.insertId, name, email, password: plainPassword } // return plain password once
    });
  } catch (error) {
    console.error('❌ Error creating employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating employee',
      error: error.message
    });
  }
});


// GET all employees
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM employees ORDER BY createdAt DESC'); // Use db, not pool
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching employees',
            error: error.message
        });
    }
});


// GET employee by ID
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM employees WHERE id = ?', [req.params.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching employee',
            error: error.message
        });
    }
});


// PUT - Update employee
router.put('/:id', async (req, res) => {
    try {
        const employeeId = req.params.id;
        const {
            name,
            email,
            contact_no,
            alternate_contact_no,
            aadhaar_card_number,
            pan_card,
            driving_license,
            dob,
            gender,
            department,
            education_qualification,
            experience,
            skills,
            ctc,
            expected_ctc,
            current_organization,
            current_industry_type,
            location,
            city,
            state,
            image,
            resume,
            aadhaar_card,
            status,
            uan_number
        } = req.body;

        // Check if employee exists
        const [existingEmployee] = await db.execute('SELECT id FROM employees WHERE id = ?', [employeeId]);
        if (existingEmployee.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Check if email already exists for other employees
        const [emailCheck] = await db.execute('SELECT id FROM employees WHERE email = ? AND id != ?', [email, employeeId]);
        if (emailCheck.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Employee with this email already exists'
            });
        }

        const query = `
            UPDATE employees SET
                name = ?, email = ?, contact_no = ?, alternate_contact_no = ?,
                aadhaar_card_number = ?, pan_card = ?, driving_license = ?, dob = ?,
                gender = ?, department = ?, education_qualification = ?, experience = ?,
                skills = ?, ctc = ?, expected_ctc = ?, current_organization = ?,
                current_industry_type = ?, location = ?, city = ?, state = ?,
                image = ?, resume = ?, aadhaar_card = ?, status = ?, uan_number = ?
            WHERE id = ?
        `;

        await db.execute(query, [
            name, email, contact_no, alternate_contact_no, aadhaar_card_number,
            pan_card, driving_license, dob, gender, department, education_qualification,
            experience, skills, ctc, expected_ctc, current_organization,
            current_industry_type, location, city, state, image, resume,
            aadhaar_card, status, uan_number, employeeId
        ]);

        res.json({
            success: true,
            message: 'Employee updated successfully'
        });
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating employee',
            error: error.message
        });
    }
});

// DELETE employee
router.delete('/:id', async (req, res) => {
    try {
        const employeeId = req.params.id;

        // Check if employee exists
        const [existingEmployee] = await db.execute('SELECT id FROM employees WHERE id = ?', [employeeId]);
        if (existingEmployee.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        await db.execute('DELETE FROM employees WHERE id = ?', [employeeId]);

        res.json({
            success: true,
            message: 'Employee deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting employee',
            error: error.message
        });
    }
});

// PATCH - Update employee status
router.patch('/:id/status', async (req, res) => {
    try {
        const employeeId = req.params.id;
        const { status } = req.body;

        if (!status || !['active', 'inactive', 'terminated'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be active, inactive, or terminated'
            });
        }

        // Check if employee exists
        const [existingEmployee] = await db.execute('SELECT id FROM employees WHERE id = ?', [employeeId]);
        if (existingEmployee.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        await db.execute('UPDATE employees SET status = ? WHERE id = ?', [status, employeeId]);

        res.json({
            success: true,
            message: 'Employee status updated successfully'
        });
    } catch (error) {
        console.error('Error updating employee status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating employee status',
            error: error.message
        });
    }
});

module.exports = router;