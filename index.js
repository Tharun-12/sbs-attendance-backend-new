// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const employeeRoutes = require('./sbs-attendance/routes/Employeeroutes');
const attendanceRoutes = require("./sbs-attendance/routes/Attendanceroutes");
const authRoutes = require("./sbs-attendance/routes/auth");
const admindashboardRoutes = require("./sbs-attendance/routes/Admindashboard");

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json()); // <--- this is required to parse JSON body


app.use(
  '/uploads',
  express.static(path.join(__dirname, 'sbs-attendance', 'uploads'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
      }
    },
  })
);


// For normal JSON routes
app.use('/api/employees', employeeRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api", authRoutes);
app.use("/api", admindashboardRoutes);

// Default route
app.get('/', (req, res) => res.send('Employee Management API is running!'));

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
