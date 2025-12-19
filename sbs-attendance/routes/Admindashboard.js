const express = require("express");
const router = express.Router();
const db = require("../config/db");

/**
 * ADMIN DASHBOARD STATS
 * GET /api/attendance/admin/dashboard-stats
 */
router.get("/admin/dashboard-stats", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";

    // Total employees
    const [totalEmployeesResult] = await db.query(`SELECT id FROM employees`);
    const totalEmployees = totalEmployeesResult.length;

    // Daily present employees
    const [dailyPresentResult] = await db.query(`
      SELECT COUNT(*) AS present
      FROM attendance
      WHERE date = ? AND status = 'present'
    `, [today]);
    const dailyPresent = dailyPresentResult[0].present || 0;

    // Daily absent employees = total - present
    const dailyAbsent = totalEmployees - dailyPresent;

    // Monthly present employees (sum of all present for the month)
    const [monthlyPresentResult] = await db.query(`
      SELECT COUNT(DISTINCT employee_id) AS present
      FROM attendance
      WHERE date BETWEEN ? AND ? AND status = 'present'
    `, [monthStart, today]);
    const monthlyPresent = monthlyPresentResult[0].present || 0;

    // Monthly absent employees = total - present (approximation)
    const monthlyAbsent = totalEmployees - monthlyPresent;

    // Recent Activity
    const [recentActivity] = await db.query(`
      SELECT 
        a.id,
        e.id AS employee_id,
        e.name,
        a.check_in AS time,
        CASE
          WHEN a.check_out IS NOT NULL THEN 'Checked Out'
          WHEN a.check_in IS NOT NULL THEN 'Checked In'
          ELSE 'Not Checked In'
        END AS currentStatus,
        CASE
          WHEN a.status IS NULL THEN 'absent'
          ELSE a.status
        END AS status
      FROM employees e
      LEFT JOIN attendance a 
        ON e.id = a.employee_id AND a.date = ?
      ORDER BY a.created_at DESC
      LIMIT 10
    `, [today]);

    res.json({
      success: true,
      data: {
        totalEmployees,
        daily: {
          present: dailyPresent,
          absent: dailyAbsent,
          total: totalEmployees
        },
        monthly: {
          present: monthlyPresent,
          absent: monthlyAbsent,
          total: totalEmployees
        },
        recentActivity,
        summary: {
          dailyPresentRate: totalEmployees ? ((dailyPresent / totalEmployees) * 100).toFixed(1) : 0,
          monthlyPresentRate: totalEmployees ? ((monthlyPresent / totalEmployees) * 100).toFixed(1) : 0,
          averageDailyAttendance: totalEmployees ? Math.round(monthlyPresent / 30) : 0,
          totalWorkingDays: 30
        }
      }
    });

  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


module.exports = router;
