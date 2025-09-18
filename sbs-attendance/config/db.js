const mysql = require('mysql2');

// Create connection pool
const pool = mysql.createPool({
    host: 'localhost',       
    user: 'root',            // replace with your DB user
    password: '',            // replace with your DB password
    database: 'sbs_attendance', // ✅ use underscore (not dash)
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    port: 4306
});

// Promise-based pool
const promisePool = pool.promise();

module.exports = promisePool;
