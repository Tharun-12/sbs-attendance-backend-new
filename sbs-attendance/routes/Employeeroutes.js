const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

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

// Function to generate password
const generatePassword = (name) => {
  // Get first word from full name
  const firstName = name.split(' ')[0];
  // Capitalize first letter, lowercase the rest
  const formattedName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  return `${formattedName}@123`;
};

// POST - Create new employee
router.post('/', upload, async (req, res) => {
  try {
    console.log("➡️ req.body:", req.body);
    console.log("➡️ req.files:", req.files);

    // Parse the JSON data from the 'data' field
    let textFields = {};
    if (req.body.data) {
      textFields = JSON.parse(req.body.data);
    } else {
      textFields = req.body;
    }

    const {
      name, email, contact_no, alternate_contact_no, aadhaar_card_number,
      pan_card, driving_license, dob, gender, department,
      education_qualification, experience, skills, ctc, expected_ctc,
      current_organization, current_industry_type, location, city, state,
      status = 'active', uan_number
    } = textFields;

    const image = req.files?.image ? req.files.image[0].filename : null;
    const resume = req.files?.resume ? req.files.resume[0].filename : null;
    const aadhaar_card = req.files?.aadhaar_card ? req.files.aadhaar_card[0].filename : null;

    // Check existing email
    const [existing] = await db.execute('SELECT id FROM employees WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Employee with this email already exists' });
    }

    // 🔑 Generate password = FirstWord@123 (first letter capital, rest small)
    const plainPassword = generatePassword(name);

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

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: { 
        id: result.insertId, 
        name, 
        email, 
        generatedPassword: plainPassword
      }
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

// PUT - Update employee with file upload support
router.put('/:id', upload, async (req, res) => {
  try {
    const employeeId = req.params.id;
    
    // Parse the JSON data from the 'data' field
    let textFields = {};
    if (req.body.data) {
      textFields = JSON.parse(req.body.data);
    } else {
      textFields = req.body;
    }

    const {
      name, email, contact_no, alternate_contact_no, aadhaar_card_number,
      pan_card, driving_license, dob, gender, department,
      education_qualification, experience, skills, ctc, expected_ctc,
      current_organization, current_industry_type, location, city, state,
      status = 'active', uan_number,
      updatePassword = 'false'
    } = textFields;

    // Get existing employee data first
    const [existingEmployee] = await db.execute('SELECT * FROM employees WHERE id = ?', [employeeId]);
    if (existingEmployee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const currentEmployee = existingEmployee[0];

    // Check if email already exists for other employees
    const [emailCheck] = await db.execute('SELECT id FROM employees WHERE email = ? AND id != ?', [email, employeeId]);
    if (emailCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Employee with this email already exists'
      });
    }

    // Handle file uploads - keep existing files if no new files uploaded
    let image = currentEmployee.image;
    let resume = currentEmployee.resume;
    let aadhaar_card = currentEmployee.aadhaarCard;

    if (req.files?.image) {
      image = req.files.image[0].filename;
      // Delete old image if exists
      if (currentEmployee.image) {
        const oldImagePath = path.join(uploadDir, currentEmployee.image);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
    }

    if (req.files?.resume) {
      resume = req.files.resume[0].filename;
      if (currentEmployee.resume) {
        const oldResumePath = path.join(uploadDir, currentEmployee.resume);
        if (fs.existsSync(oldResumePath)) fs.unlinkSync(oldResumePath);
      }
    }

    if (req.files?.aadhaar_card) {
      aadhaar_card = req.files.aadhaar_card[0].filename;
      if (currentEmployee.aadhaarCard) {
        const oldAadhaarPath = path.join(uploadDir, currentEmployee.aadhaarCard);
        if (fs.existsSync(oldAadhaarPath)) fs.unlinkSync(oldAadhaarPath);
      }
    }

    // Handle password update if name changed and updatePassword is true
    let hashedPassword = currentEmployee.password;
    let generatedPassword = null;

    if (updatePassword === 'true' && name !== currentEmployee.name) {
      generatedPassword = generatePassword(name);
      hashedPassword = await bcrypt.hash(generatedPassword, 10);
    }

    const query = `
      UPDATE employees SET
        name = ?, email = ?, password = ?, contactNo = ?, alternateContactNo = ?,
        aadhaarCardNumber = ?, panCard = ?, drivingLicense = ?, dob = ?,
        gender = ?, department = ?, educationQualification = ?, experience = ?,
        skills = ?, ctc = ?, expectedCtc = ?, currentOrganization = ?,
        currentIndustryType = ?, location = ?, city = ?, state = ?,
        image = ?, resume = ?, aadhaarCard = ?, status = ?, uanNumber = ?
      WHERE id = ?
    `;

    await db.execute(query, [
      name, email, hashedPassword, contact_no, alternate_contact_no, aadhaar_card_number,
      pan_card, driving_license, dob, gender, department, education_qualification,
      experience, skills, ctc, expected_ctc, current_organization,
      current_industry_type, location, city, state, image, resume,
      aadhaar_card, status, uan_number, employeeId
    ]);

    const response = {
      success: true,
      message: 'Employee updated successfully'
    };

    if (generatedPassword) {
      response.generatedPassword = generatedPassword;
    }

    res.json(response);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating employee',
      error: error.message
    });
  }
});

// GET all employees
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM employees ORDER BY createdAt DESC');
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

router.put('/:id', upload, async (req, res) => {
  try {
    const employeeId = req.params.id;
    
    // Parse the JSON data from the 'data' field
    let textFields = {};
    if (req.body.data) {
      textFields = JSON.parse(req.body.data);
    } else {
      textFields = req.body;
    }

    // Ensure all fields have default null values to avoid undefined
    const {
      name = null, 
      email = null, 
      contact_no = null, 
      alternate_contact_no = null, 
      aadhaar_card_number = null,
      pan_card = null, 
      driving_license = null, 
      dob = null, 
      gender = null, 
      department = null,
      education_qualification = null, 
      experience = null, 
      skills = null, 
      ctc = null, 
      expected_ctc = null,
      current_organization = null, 
      current_industry_type = null, 
      location = null, 
      city = null, 
      state = null,
      status = 'active', 
      uan_number = null
    } = textFields;

    // Get existing employee data first
    const [existingEmployee] = await db.execute('SELECT * FROM employees WHERE id = ?', [employeeId]);
    if (existingEmployee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const currentEmployee = existingEmployee[0];

    // Check if email already exists for other employees
    const [emailCheck] = await db.execute('SELECT id FROM employees WHERE email = ? AND id != ?', [email, employeeId]);
    if (emailCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Employee with this email already exists'
      });
    }

    // Handle file uploads - keep existing files if no new files uploaded
    let image = currentEmployee.image;
    let resume = currentEmployee.resume;
    let aadhaar_card = currentEmployee.aadhaarCard;

    if (req.files?.image) {
      image = req.files.image[0].filename;
      // Delete old image if exists
      if (currentEmployee.image) {
        const oldImagePath = path.join(uploadDir, currentEmployee.image);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
    }

    if (req.files?.resume) {
      resume = req.files.resume[0].filename;
      if (currentEmployee.resume) {
        const oldResumePath = path.join(uploadDir, currentEmployee.resume);
        if (fs.existsSync(oldResumePath)) fs.unlinkSync(oldResumePath);
      }
    }

    if (req.files?.aadhaar_card) {
      aadhaar_card = req.files.aadhaar_card[0].filename;
      if (currentEmployee.aadhaarCard) {
        const oldAadhaarPath = path.join(uploadDir, currentEmployee.aadhaarCard);
        if (fs.existsSync(oldAadhaarPath)) fs.unlinkSync(oldAadhaarPath);
      }
    }

    // No password regeneration needed since name is read-only
    const hashedPassword = currentEmployee.password;

    const query = `
      UPDATE employees SET
        name = ?, email = ?, password = ?, contactNo = ?, alternateContactNo = ?,
        aadhaarCardNumber = ?, panCard = ?, drivingLicense = ?, dob = ?,
        gender = ?, department = ?, educationQualification = ?, experience = ?,
        skills = ?, ctc = ?, expectedCtc = ?, currentOrganization = ?,
        currentIndustryType = ?, location = ?, city = ?, state = ?,
        image = ?, resume = ?, aadhaarCard = ?, status = ?, uanNumber = ?
      WHERE id = ?
    `;

    await db.execute(query, [
      name || currentEmployee.name,
      email || currentEmployee.email,
      hashedPassword,
      contact_no,
      alternate_contact_no,
      aadhaar_card_number,
      pan_card,
      driving_license,
      dob,
      gender,
      department || currentEmployee.department,
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
      uan_number,
      employeeId
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

    // Get employee data first to delete files
    const [existingEmployee] = await db.execute('SELECT image, resume, aadhaarCard FROM employees WHERE id = ?', [employeeId]);
    
    if (existingEmployee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const employee = existingEmployee[0];
    
    // Delete associated files
    const filesToDelete = [
      { field: 'image', filename: employee.image },
      { field: 'resume', filename: employee.resume },
      { field: 'aadhaarCard', filename: employee.aadhaarCard }
    ];

    filesToDelete.forEach(file => {
      if (file.filename) {
        const filePath = path.join(uploadDir, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    // Delete from database
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



// GET - Get employee profile by email (for employee login)
router.get('/profile/:email', async (req, res) => {
  try {
    const email = req.params.email;
    
    // Query to get employee by email
    const [rows] = await db.execute('SELECT * FROM employees WHERE email = ?', [email]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Remove password from response for security
    const employee = { ...rows[0] };
    delete employee.password;

    res.json({
      success: true,
      data: employee
    });
  } catch (error) {
    console.error('Error fetching employee profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee profile',
      error: error.message
    });
  }
});

module.exports = router;