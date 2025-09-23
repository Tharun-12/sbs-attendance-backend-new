const express = require("express");
const router = express.Router();
const db = require("../config/db"); // your mysql pool

// Helper: get today date in YYYY-MM-DD
const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split("T")[0];
};

// Helper: Get company location from database
const getCompanyLocation = async () => {
  try {
    const [rows] = await db.query("SELECT latitude, longitude FROM company_locations ORDER BY id DESC LIMIT 1");
    if (rows.length > 0) {
      return {
        latitude: parseFloat(rows[0].latitude),
        longitude: parseFloat(rows[0].longitude)
      };
    }
    // Default fallback location
    return {
      latitude: 24.071207,
      longitude: 82.622665
    };
  } catch (err) {
    console.error("Error fetching company location:", err);
    return {
      latitude: 24.071207,
      longitude: 82.622665
    };
  }
};

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km
  return distance;
};

// Validate user location against company location
const validateLocation = async (userLocation) => {
  try {
    const companyLocation = await getCompanyLocation();
    
    if (userLocation && userLocation !== "N/A") {
      const [userLat, userLon] = userLocation.split(',').map(coord => parseFloat(coord.trim()));
      
      if (isNaN(userLat) || isNaN(userLon)) {
        return { valid: false, error: "Invalid location format" };
      }
      
      const distance = calculateDistance(
        userLat, 
        userLon, 
        companyLocation.latitude, 
        companyLocation.longitude
      );
      
      if (distance > 1) { // More than 1km away
        return { 
          valid: false, 
          error: `You are ${distance.toFixed(2)}km away from company. Must be within 1km.`,
          distance: distance
        };
      }
      
      return { valid: true, distance: distance, companyLocation: companyLocation };
    }
    
    return { valid: false, error: "Location not provided" };
  } catch (err) {
    console.error("Location validation error:", err);
    return { valid: false, error: "Error validating location" };
  }
};

// -------------------- Check-In --------------------
router.post("/checkin", async (req, res) => {
  const { employee_id, location } = req.body;
  const date = getTodayDate();
  const now = new Date();

  try {
    // Validate location
    const locationValidation = await validateLocation(location);
    if (!locationValidation.valid) {
      return res.status(400).json({ message: locationValidation.error });
    }

    // Check if already checked in
    const [rows] = await db.query(
      "SELECT * FROM attendance WHERE employee_id=? AND date=?",
      [employee_id, date]
    );

    if (rows.length > 0 && rows[0].check_in) {
      return res.status(400).json({ message: "Already checked in today!" });
    }

    if (rows.length === 0) {
      // Insert new row
      await db.query(
        `INSERT INTO attendance 
         (employee_id, date, check_in, check_in_location, status) 
         VALUES (?, ?, ?, ?, 'Present')`,
        [employee_id, date, now, location]
      );
    } else {
      // Update existing row
      await db.query(
        "UPDATE attendance SET check_in=?, check_in_location=?, status='Present' WHERE employee_id=? AND date=?",
        [now, location, employee_id, date]
      );
    }

    res.json({ 
      message: "Checked in successfully", 
      check_in: now,
      companyLocation: locationValidation.companyLocation
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Check-in failed", error: err.message });
  }
});

// -------------------- Lunch Start --------------------
router.post("/lunchstart", async (req, res) => {
  const { employee_id, location } = req.body;
  const date = getTodayDate();
  const now = new Date();

  try {
    // Validate location (must be within premise)
    const locationValidation = await validateLocation(location);
    if (!locationValidation.valid) {
      return res.status(400).json({ message: locationValidation.error });
    }

    const [rows] = await db.query(
      "SELECT * FROM attendance WHERE employee_id=? AND date=?",
      [employee_id, date]
    );

    if (!rows.length || !rows[0].check_in) {
      return res.status(400).json({ message: "Please check in first!" });
    }

    if (rows[0].lunch_start) {
      return res.status(400).json({ message: "Lunch already started!" });
    }

    if (rows[0].check_out) {
      return res.status(400).json({ message: "Already checked out!" });
    }

    await db.query(
      "UPDATE attendance SET lunch_start=?, lunch_start_location=? WHERE employee_id=? AND date=?",
      [now, location, employee_id, date]
    );

    res.json({ 
      message: "Lunch started successfully", 
      lunch_start: now,
      companyLocation: locationValidation.companyLocation
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lunch start failed", error: err.message });
  }
});

// -------------------- Lunch End --------------------
router.post("/lunchend", async (req, res) => {
  const { employee_id, location } = req.body;
  const date = getTodayDate();
  const now = new Date();

  try {
    // Validate location (must be within premise)
    const locationValidation = await validateLocation(location);
    if (!locationValidation.valid) {
      return res.status(400).json({ message: locationValidation.error });
    }

    const [rows] = await db.query(
      "SELECT * FROM attendance WHERE employee_id=? AND date=?",
      [employee_id, date]
    );

    if (!rows.length || !rows[0].check_in) {
      return res.status(400).json({ message: "Please check in first!" });
    }

    if (!rows[0].lunch_start) {
      return res.status(400).json({ message: "Lunch not started yet!" });
    }

    if (rows[0].lunch_end) {
      return res.status(400).json({ message: "Lunch already ended!" });
    }

    if (rows[0].check_out) {
      return res.status(400).json({ message: "Already checked out!" });
    }

    await db.query(
      "UPDATE attendance SET lunch_end=?, lunch_end_location=? WHERE employee_id=? AND date=?",
      [now, location, employee_id, date]
    );

    res.json({ 
      message: "Lunch ended successfully", 
      lunch_end: now,
      companyLocation: locationValidation.companyLocation
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lunch end failed", error: err.message });
  }
});

// -------------------- Check-Out --------------------
router.post("/checkout", async (req, res) => {
  const { employee_id, location } = req.body;
  const date = getTodayDate();
  const now = new Date();

  try {
    // Validate location (must be within premise)
    const locationValidation = await validateLocation(location);
    if (!locationValidation.valid) {
      return res.status(400).json({ message: locationValidation.error });
    }

    const [rows] = await db.query(
      "SELECT * FROM attendance WHERE employee_id=? AND date=?",
      [employee_id, date]
    );

    if (!rows.length || !rows[0].check_in) {
      return res.status(400).json({ message: "Please check in first!" });
    }

    if (rows[0].check_out) {
      return res.status(400).json({ message: "Already checked out!" });
    }

    if (rows[0].lunch_start && !rows[0].lunch_end) {
      return res.status(400).json({ message: "Please end lunch before check-out!" });
    }

    await db.query(
      "UPDATE attendance SET check_out=?, check_out_location=?, status='Present' WHERE employee_id=? AND date=?",
      [now, location, employee_id, date]
    );

    res.json({ 
      message: "Checked out successfully", 
      check_out: now,
      companyLocation: locationValidation.companyLocation
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Check-out failed", error: err.message });
  }
});

// -------------------- Get Company Location --------------------
router.get("/company-location", async (req, res) => {
  try {
    const companyLocation = await getCompanyLocation();
    res.json({
      success: true,
      data: companyLocation
    });
  } catch (err) {
    console.error("Error fetching company location:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch company location",
      error: err.message
    });
  }
});

router.get("/today", async (req, res) => {
  const { employee_id } = req.query;
  const date = getTodayDate();

  try {
    const [rows] = await db.query(
      "SELECT * FROM attendance WHERE employee_id=? AND date=?",
      [employee_id, date]
    );

    if (rows.length > 0) {
      res.json({ success: true, data: rows[0] });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (err) {
    console.error("Error fetching today attendance:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------- Get Attendance --------------------
router.get("/:employee_id", async (req, res) => {
  const { employee_id } = req.params;
  const date = getTodayDate();

  try {
    const [rows] = await db.query(
      "SELECT * FROM attendance WHERE employee_id=? AND date=?",
      [employee_id, date]
    );

    if (!rows.length) return res.json({ message: "No attendance found for today" });

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Fetch attendance failed", error: err.message });
  }
});

// -------------------- Get Monthly Attendance --------------------
router.get("/:employee_id/monthly/:year/:month", async (req, res) => {
  const { employee_id, year, month } = req.params;

  try {
    const [rows] = await db.query(
      `SELECT * FROM attendance 
       WHERE employee_id = ? 
       AND YEAR(date) = ? 
       AND MONTH(date) = ? 
       ORDER BY date ASC`,
      [employee_id, year, month]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Fetch monthly attendance failed", error: err.message });
  }
});

// ✅ NEW: Get All Attendance Records with Employee Names (for Admin)
router.get("/admin/all", async (req, res) => {
  try {
    console.log('Fetching all attendance records for admin...');
    
    const query = `
      SELECT 
        a.id,
        a.employee_id,
        a.date,
        a.check_in,
        a.check_in_location,
        a.check_out,
        a.check_out_location,
        a.lunch_start,
        a.lunch_start_location,
        a.lunch_end,
        a.lunch_end_location,
        a.status,
        e.name as employee_name,
        e.email as employee_email
      FROM attendance a
      INNER JOIN employees e ON a.employee_id = e.id
      ORDER BY a.date DESC, a.check_in DESC
    `;

    const [rows] = await db.query(query);
    
    console.log(`Found ${rows.length} attendance records`);

    res.json({
      success: true,
      data: rows,
      total: rows.length
    });
  } catch (err) {
    console.error('Error fetching all attendance:', err);
    res.status(500).json({ 
      success: false,
      message: "Fetch all attendance failed", 
      error: err.message 
    });
  }
});

// ✅ NEW: Get All Attendance Records by Date Range (for Admin)
router.get("/admin/date-range", async (req, res) => {
  const { startDate, endDate } = req.query;
  
  try {
    let query = `
      SELECT 
        a.id,
        a.employee_id,
        a.date,
        a.check_in,
        a.check_in_location,
        a.check_out,
        a.check_out_location,
        a.lunch_start,
        a.lunch_start_location,
        a.lunch_end,
        a.lunch_end_location,
        a.status,
        e.name as employee_name,
        e.email as employee_email
      FROM attendance a
      INNER JOIN employees e ON a.employee_id = e.id
    `;
    
    const queryParams = [];
    
    if (startDate && endDate) {
      query += ` WHERE a.date BETWEEN ? AND ?`;
      queryParams.push(startDate, endDate);
    } else if (startDate) {
      query += ` WHERE a.date >= ?`;
      queryParams.push(startDate);
    } else if (endDate) {
      query += ` WHERE a.date <= ?`;
      queryParams.push(endDate);
    }
    
    query += ` ORDER BY a.date DESC, a.check_in DESC`;

    const [rows] = await db.query(query, queryParams);

    res.json({
      success: true,
      data: rows,
      total: rows.length,
      dateRange: { startDate: startDate || null, endDate: endDate || null }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      message: "Fetch attendance by date range failed", 
      error: err.message 
    });
  }
});

// ✅ NEW: Get Attendance Summary (for Dashboard)
router.get("/admin/summary/stats", async (req, res) => {
  const { date } = req.query;
  const targetDate = date || getTodayDate();

  try {
    const [totalEmployees] = await db.query(
      "SELECT COUNT(*) as total FROM employees WHERE status = 'active'"
    );

    const [presentToday] = await db.query(
      "SELECT COUNT(*) as present FROM attendance WHERE date = ? AND status = 'Present'",
      [targetDate]
    );

    const [checkedIn] = await db.query(
      "SELECT COUNT(*) as checked_in FROM attendance WHERE date = ? AND check_in IS NOT NULL",
      [targetDate]
    );

    const [checkedOut] = await db.query(
      "SELECT COUNT(*) as checked_out FROM attendance WHERE date = ? AND check_out IS NOT NULL",
      [targetDate]
    );

    const [onLunch] = await db.query(
      `SELECT COUNT(*) as on_lunch 
       FROM attendance 
       WHERE date = ? 
       AND lunch_start IS NOT NULL 
       AND lunch_end IS NULL 
       AND check_out IS NULL`,
      [targetDate]
    );

    res.json({
      success: true,
      data: {
        date: targetDate,
        totalEmployees: totalEmployees[0].total,
        presentToday: presentToday[0].present,
        checkedIn: checkedIn[0].checked_in,
        checkedOut: checkedOut[0].checked_out,
        onLunch: onLunch[0].on_lunch,
        absent: totalEmployees[0].total - presentToday[0].present
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      message: "Fetch attendance summary failed", 
      error: err.message 
    });
  }
});

// ✅ Get all users (employees) - moved to the end to avoid route conflicts
router.get("/users/all", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, name, email FROM employees WHERE status = 'active'");
    res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      message: "Fetch users failed", 
      error: err.message 
    });
  }
});

module.exports = router;