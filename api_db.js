const express = require("express");
const router = express.Router();
const db = require("./db");
const util = require("util");
const query = util.promisify(db.query).bind(db);


// ================= CANDIDATES =================

// Add candidate
router.post("/candidates", (req, res) => {
  const { name, phone, email, job_id } = req.body;

  db.query(
    "INSERT INTO candidates (name, phone, email, job_id) VALUES (?, ?, ?, ?)",
    [name, phone, email, job_id],
    (err, result) => {
      if (err) return res.status(500).send(err);
      res.send("Candidate added");
    }
  );
});

// Get candidates
router.get("/candidates", (req, res) => {
  db.query("SELECT * FROM cand", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});


// ================= RECRUITERS =================

// Add recruiter
router.post("/recruiters", (req, res) => {
  const { recruiter_name, job_role, emial } = req.body;

  db.query(
    "INSERT INTO recruiter (recruiter_name, job_role, emial) VALUES (?, ?, ?)",
    [recruiter_name, job_role, emial],
    (err, result) => {
      if (err) return res.status(500).send(err);
      res.send("Recruiter added");
    }
  );
});

// Get recruiters
router.get("/recruiters", (req, res) => {
  db.query("SELECT * FROM recruiter", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});


// ================= MANAGERS =================

// Add manager
router.post("/managers", (req, res) => {
  const { name, phone, email, job_id } = req.body;

  db.query(
    "INSERT INTO manager (name, phone, email, job_id) VALUES (?, ?, ?, ?)",
    [name, phone, email, job_id],
    (err, result) => {
      if (err) return res.status(500).send(err);
      res.send("Manager added");
    }
  );
});

// Get managers
router.get("/managers", (req, res) => {
  db.query("SELECT * FROM manager", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});


// ================= JOB APPLICATION =================

// Apply (connect all)
router.post("/apply", (req, res) => {
  const { candidate_id, recruiter_id, manager_id, job_role_id } = req.body;

  const query = `
    INSERT INTO job_applications (candidate_id, recruiter_id, manager_id, job_role_id)
    VALUES (?, ?, ?, ?)
  `;

  db.query(query, [candidate_id, recruiter_id, manager_id, job_role_id], (err, result) => {
    if (err) return res.status(500).send(err);
    res.send("Application created");
  });
});


// Get all applications (JOIN 🔥)
router.get("/applications", (req, res) => {
  const query = `
    SELECT 
      ja.id,
      c.name AS candidate,
      r.name AS recruiter,
      m.name AS manager,
      ja.status
    FROM job_application ja
    JOIN cand c ON ja.candidate_id = c.id
    JOIN recruiter r ON ja.recruiter_id = r.id
    JOIN manager m ON ja.manager_id = m.id
  `;

  db.query(query, (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});


// Update status
router.put("/applications/:id", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  db.query(
    "UPDATE job_application SET status=? WHERE id=?",
    [status, id],
    (err, result) => {
      if (err) return res.status(500).send(err);
      res.send("Status updated");
    }
  );
});

//////////////////      manager+recruiter data   ///////////////


router.post("/2data", async (req, res) => {
  try {
    const data = req.body;

    let recruiter_id, manager_id;

    for (const item of data) {

      if (item.role === "manager") {
        const result = await query(
          "INSERT INTO manager (name, phone, email, job_id) VALUES (?, ?, ?, ?)",
          [item.name, item.phone, item.email, item.job_id]
        );
        manager_id = result.insertId;
      }

      if (item.role === "recruiter") {
        const result = await query(
          "INSERT INTO recruiter (recruiter_name, email) VALUES (?, ?)",
          [item.recruiter_name,  item.email]
        );
        recruiter_id = result.insertId;
      }
    }

    res.json({
      message: "Both inserted successfully",
      recruiter_id,
      manager_id
    });

  } catch (err) {
    res.status(500).send(err);
  }
});


router.post("/nested_data", async (req, res) => {
  try {
    const data = req.body;

    let results = [];

    for (const jobItem of data) {

      // 👉 Insert job
      const jobResult = await query(
        "INSERT INTO job_roles (job_id, job_role) VALUES (?, ?)",
        [jobItem.job_id, jobItem.job_role]
      );

      const job_role_id = jobResult.insertId;

      let manager_id, recruiter_id, candidate_id;

      // 👉 Loop contacts
      for (const contact of jobItem.contacts) {

        // MANAGER
        if (contact.role.toLowerCase() === "manager") {
          const result = await query(
            "INSERT INTO manager (name, phone, email, job_id) VALUES (?, ?, ?, ?)",
            [contact.name, contact.phone, contact.email, jobItem.job_id]
          );
          manager_id = result.insertId;
        }

        // RECRUITER
        if (contact.role.toLowerCase() === "recruiter") {
          const result = await query(
            "INSERT INTO recruiter (recruiter_name, email, job_id) VALUES (?, ?, ?)",
            [contact.recruiter_name, contact.email,jobItem.job_id]
          );
          recruiter_id = result.insertId;
        }

        // CANDIDATE
        if (contact.role.toLowerCase() === "candidate") {
          const result = await query(
            "INSERT INTO candidates (name, phone, email, job_id) VALUES (?, ?, ?, ?)",
            [contact.name, contact.phone, contact.email, jobItem.job_id]
          );
          candidate_id = result.insertId;
        }
      }

      // Store result 
      results.push({
        job_role_id,
        manager_id,
        recruiter_id,
        candidate_id
      });
    }

    res.json({
      message: "Nested data inserted successfully",
      results
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;