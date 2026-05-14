require("dotenv").config();
const mysql = require("mysql2");

const isLocal = process.env.MODE === "local";

console.log("USER:", process.env.LOCAL_DB_USER); // debug
console.log("MODE:", process.env.MODE); // debug

const db = mysql.createConnection({
  host: "localhost",     // or your server IP
  user: "root",          // your username
  password: "9910105877",  // your password
  database: "interview_scheduler",  // your DB name
  port: 3306             // default MySQL port
});

db.connect((err) => {
  if (err) {
    console.error("❌ DB Connection Failed:", err);
  } else {
    console.log(`✅ Connected to ${isLocal ? "LOCAL DB" : "RAILWAY DB"}`);
  }
});

module.exports = db;