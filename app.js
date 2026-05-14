require("dotenv").config();

const express = require("express");
const sendMessage = require("./whatsapp");
const parseSlots = require("./slotParser");
const db = require("./db");
const createCalendarEvent = require("./googleCalendar");
const cron = require("node-cron");

const app = express()
app.use(express.json())

const apiRoutes = require("./api_db");
app.use("/api", apiRoutes);



/* ---------------- ROOT API (ENTRY POINT) ---------------- */
app.get("/start", (req, res) => {
    res.json({
        status: "success",
        message: "Interview Scheduler API is running 🚀",
        uptime: process.uptime(),
        time: new Date()
    });
});

/* ---------------- HEALTH CHECK ---------------- */
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        message: "Server is healthy ✅"
    });
});

/* ---------------- SAMPLE TEST API ---------------- */
app.get("/test", (req, res) => {
    res.send("API working properly");
});




// ---------------- HELPERS ---------------- //

function convertToISODate(dateStr) {
  const months = {
    January: "01", February: "02", March: "03", April: "04",
    May: "05", June: "06", July: "07", August: "08",
    September: "09", October: "10", November: "11", December: "12"
  }
  const [day, month] = dateStr.split(" ")
  const year = new Date().getFullYear()
  return `${year}-${months[month]}-${day.padStart(2, "0")}`
}

function convertTo24Hour(timeStr) {
  timeStr = timeStr.toLowerCase().trim()
  let [time, modifier] = timeStr.split(" ")
  let [hours, minutes] = time.split(":")
  hours = parseInt(hours)
  minutes = minutes ? parseInt(minutes) : 0

  if (modifier === "pm" && hours !== 12) hours += 12
  if (modifier === "am" && hours === 12) hours = 0

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:00`
}

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "scheduler789"; //whatsapp callback url token

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

function buildDate(dateValue, timeValue){
 const start = new Date(dateValue)
 const parts = timeValue.split(":")
 start.setHours(parseInt(parts[0]), parseInt(parts[1]), 0)
 return start
}

//-----------------New Enrty Detection--------------------------------

function detectNewData(){

  // 🔹 Candidates
  db.query(
    "SELECT COUNT(*) AS count FROM candidates WHERE processed_status='UNPROCESSED'",
    (err, res) => {
      if(res[0].count > 0){
        console.log(`🆕 New candidates: ${res[0].count}`);
      }
    }
  );

  // 🔹 Managers
  db.query(
    "SELECT COUNT(*) AS count FROM manager WHERE processed_status='UNPROCESSED'",
    (err, res) => {
      if(res[0].count > 0){
        console.log(`🆕 New managers: ${res[0].count}`);

        // ✅ mark as processed AFTER detection
        db.query(
          "UPDATE manager SET processed_status='PROCESSED' WHERE processed_status='UNPROCESSED'"
        );
      }
    }
  );

  // 🔹 Recruiters
  db.query(
    "SELECT COUNT(*) AS count FROM recruiter WHERE processed_status='UNPROCESSED'",
    (err, res) => {
      if(res[0].count > 0){
        console.log(`🆕 New recruiters: ${res[0].count}`);

        // ✅ mark as processed AFTER detection
        db.query(
          "UPDATE recruiter SET processed_status='PROCESSED' WHERE processed_status='UNPROCESSED'"
        );
      }
    }
  );

}


//-------------------------------AUTO MAPPING------------------------------//

async function mapCandidates() {
  db.query(
    "SELECT * FROM candidates WHERE processed_status = 'UNPROCESSED'",
    (err, candidates) => {

      if (err) {
        console.log("Error fetching candidates:", err);
        return;
      }

      if (candidates.length === 0) {
        console.log("No new candidates to map");
        return;
      }

      candidates.forEach(candidate => {

        // 🔍 Find manager
        db.query(
          "SELECT * FROM manager WHERE job_id = ?",
          [candidate.job_id],
          (err, managers) => {

            if (err) {
              console.log(err);
              return;
            }

            if (managers.length === 0) {
              console.log("No manager found for:", candidate.candidate_id);
              return;
            }

            const manager = managers[0];

            // 🔍 Find recruiter (MOVE HERE ✅)
            db.query(
              "SELECT * FROM recruiter WHERE job_id = ?",
              [candidate.job_id],
              (err, recruiters) => {

                if (err) {
                  console.log(err);
                  return;
                }

                let recruiter_id = null;

                if (recruiters.length > 0) {
                  recruiter_id = recruiters[0].recruiter_id;
                }

                // 🔥 Insert mapping (single clean insert)
                db.query(
                  `INSERT INTO job_applications 
                  (candidate_id, manager_id, recruiter_id, job_role_id, status)
                  VALUES (?, ?, ?, ?, 'PENDING')`,
                  [
                    candidate.candidate_id,
                    manager.manager_id,
                    recruiter_id,
                    candidate.job_id
                  ],
                  (err) => {

                    if (err) {
                      if (err.code === "ER_DUP_ENTRY") {
                        console.log("Already mapped:", candidate.candidate_id);
                      } else {
                        console.log("Insert error:", err);
                      }
                      return;
                    }

                    console.log("✅ Fully mapped:", candidate.candidate_id);

                    // ✅ Mark processed
                    db.query(
                      "UPDATE candidates SET processed_status='PROCESSED' WHERE candidate_id=?",
                      [candidate.candidate_id]
                    );
                  }
                );
              }
            );
          }
        );
      });
    }
  );
}

// ---------------- FETCH DATA ---------------- //

function getInterviewDetails(callback){
  db.query(
  `SELECT 
      c.candidate_id,
      c.name AS candidate_name,
      c.phone AS candidate_phone,
      c.email AS candidate_email,

      m.manager_id,
      m.name AS manager_name,
      m.phone AS manager_phone,
      m.email AS manager_email,  

      

      j.job_id,
      j.job_role
  FROM candidates c
  JOIN job_roles j ON c.job_id = j.job_id
  JOIN manager m ON m.job_id = j.job_id
  
  LIMIT 1`,
  
  (err, result)=>{
    if(err){
  console.log("DB Error:", err)
  return
}

if(result.length === 0){
  console.log("❌ No data returned from query")
  return
}
    callback(result[0])
  })
}

// ---------------- SERVER START ---------------- //

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);


  // 🔥 AUTO TRIGGER INITIAL MESSAGES
  sendInitialRequests();
});

// ---------------- CRON REMINDER ---------------- //

cron.schedule("* * * * *", () => {
  console.log("⏰ Checking reminders...");

//--------------MAPPING------------//
  detectNewData();  // new data enrty check//
  mapCandidates();
  sendInitialRequests();

  

  //----manager remindner msz----//
  db.query(
    `SELECT DISTINCT m.*
     FROM manager m
     JOIN slots s ON m.manager_id = s.manager_id
     WHERE m.request_sent_at IS NOT NULL
     AND m.request_sent_at <= NOW() - INTERVAL 23 HOUR
     AND m.reminder_sent = FALSE
     AND s.status = 'available'`,
    (err, managers) => {

      if(err){
        console.log(err);
        return;
      }

      console.log("Managers found:", managers.length);

      managers.forEach(m => {
        sendMessage(m.phone, "⏰ Reminder: Please send your availability for interview");

        db.query(
          "UPDATE manager SET reminder_sent=TRUE WHERE manager_id=?",
          [m.manager_id]
        );
      });
    }
  );




  //------candidate reminder msz-------//

// -------- CANDIDATE REMINDER -------- //
db.query(
  `SELECT DISTINCT c.phone, j.job_role
   FROM candidates c
   JOIN slots s ON c.candidate_id = s.candidate_id
   JOIN job_roles j ON s.job_id = j.job_id
   WHERE s.status = 'available'
   AND s.booked_at IS NULL
   AND s.created_at <= NOW() - INTERVAL 23 HOUR`,
  (err, candidates) => {

    if(err){
      console.log(err);
      return;
    }

    console.log("Candidates found:", candidates.length);

    candidates.forEach(c => {
      console.log("Sending reminder to candidate:", c.phone);

      sendMessage(c.phone, `⏰ This is a reminder to share your availability for the "${c.job_role}" opportunity at . Looking forward to scheduling your interview.`);
    });
  }
);


// -------- INTERVIEW 9 AM REMINDER -------- //
    const now = new Date();
    const currentHour = now.getHours();
    const minute = now.getMinutes();
   

    // ⏰ Only run at 9 AM
    if (currentHour === 15 && minute === 0) {// time when to sent the reminder for the interview
    
    
db.query(
  `SELECT s.*, 
          c.phone AS candidate_phone,
          m.phone AS manager_phone,
          c.name AS candidate_name,
          j.job_role
   FROM slots s
   JOIN candidates c ON s.candidate_id = c.candidate_id
   JOIN manager m ON s.manager_id = m.manager_id
   JOIN job_roles j ON s.job_id = j.job_id
   WHERE s.status = 'booked'
   AND DATE(s.slot_date) = CURRENT_DATE
   AND s.interview_reminder_sent = FALSE`,
  async (err, interviews) => {

    if(err){
      console.log("Interview reminder error:", err);
      return;
    }
  
    

      console.log("📩 Sending interview reminders...");

      for(const i of interviews){
        const dateObj = new Date(i.slot_date);
        const timeObj = new Date(`1970-01-01T${i.start_time}`);
        const formattedDate = dateObj.toLocaleDateString("en-IN", {
                   day: "numeric",
                   month: "long",
                   year: "numeric"
                  });
        const time = timeObj.toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true
        });

        // 📲 Candidate message
        await sendMessage(i.candidate_phone,
`⏰This is a reminder for your interview scheduled for ${i.job_role} at .

💼 Role: ${i.job_role}
📅 Date: ${formattedDate}
⏰ Time: ${time}

Best of luck! 🚀`);

        // 📲 Manager message
        await sendMessage(i.manager_phone,
`⏰ Interview Remider

👤 Candidate: ${i.candidate_name}
💼 Role: ${i.job_role}
📅 Date: ${formattedDate}
⏰ Time: ${time}`);

        // ✅ Mark as sent
        db.query(
          "UPDATE slots SET interview_reminder_sent = TRUE WHERE slot_id = ?",
          [i.slot_id]
        );
      }
    }
   
)};

// -------- INTERVIEW 2 HOURS BEFORE REMINDER -------- //
db.query(
  `SELECT s.*, 
          c.phone AS candidate_phone,
          c.name AS candidate_name,
          j.job_role,
          s.slot_date,
          s.start_time
   FROM slots s
   JOIN candidates c ON s.candidate_id = c.candidate_id
   JOIN job_roles j ON s.job_id = j.job_id
   WHERE s.status = 'booked'
   AND s.interview_reminder_2hr_sent = FALSE`,
  async (err, interviews) => {

    if (err) {
      console.log("2hr reminder error:", err);
      return;
    }

    const now = new Date();

    for (const i of interviews) {

      const dateObj = new Date(i.slot_date);
const formattedDate = dateObj.toLocaleDateString("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

      // combine date + time
      const interviewDateTime = new Date(`${i.slot_date}T${i.start_time}`);

      // difference in ms
      const diff = interviewDateTime - now;

      // convert to minutes
      const diffMinutes = diff / (1000 * 60);
    

      // 🎯 send only when within 2hr window (115–120 mins)
      if (diffMinutes <= 120 && diffMinutes > 115) {

        console.log("⏰ Sending 2hr reminder to:", i.candidate_phone);

        await sendMessage(
          i.candidate_phone,
`⏰ Reminder: Your interview starts in 2 hours.

💼 Role: ${i.job_role}
📅 Date: ${formattedDate}
🕒 Time: ${i.start_time}

Please be prepared.

Best of luck! 🚀`
        );

        // ✅ mark as sent
        db.query(
          "UPDATE slots SET interview_reminder_2hr_sent = TRUE WHERE slot_id = ?",
          [i.slot_id]
        );
      }
    }
  }
);

});

//------------------INTIAL MESSAGE---------------//


function sendInitialRequests(){

  db.query(`
    SELECT ja.*, 
           m.name AS manager_name,
           m.phone AS manager_phone,
           c.name AS candidate_name,
           j.job_role
           
    FROM job_applications ja
    JOIN manager m ON ja.manager_id = m.manager_id
    JOIN candidates c ON ja.candidate_id = c.candidate_id
    JOIN job_roles j ON j.job_id = ja.job_role_id
    WHERE ja.status = 'PENDING'
  `, async (err, results)=>{

    if(err){
      console.log("Initial Error:", err)
      return
    }

    console.log("🚀 Initial requests:", results.length)

    for(const row of results){

      const message = `Hi Manager ${row.manager_name} 👋

We have a candidate shortlisted for “${row.job_role}” role. 
Request you to please share your availability. 
I'll share with candidate accordingly.

What are your available slots?
👤 Candidate: ${row.candidate_name}
💼 Job Role: ${row.job_role}
`

      await sendMessage(row.manager_phone, message)

      db.query(`
        UPDATE job_applications
        SET status='REQUEST_SENT',
            request_sent_at = NOW()
        WHERE id=?
      `, [row.id])

    }

  })

}
  



// ---------------- WEBHOOK ---------------- //

app.post("/webhook", (req, res) => {

const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]

if(!message){
  return res.sendStatus(200)
}

// 🔍 DEBUG (ADD THIS)
console.log("RAW sender:", message.from)

// 🔥 FIX (REPLACE OLD sender LINE)
const sender = message.from.replace(/\D/g, '')

// 🔍 DEBUG
console.log("Normalized sender:", sender)


const text = message.text?.body

// 🔍 STEP 1: CHECK IF MANAGER
db.query(
  "SELECT * FROM manager WHERE phone=?",
  [sender],
  (err, managerResult)=>{
    
// ================= MANAGER FLOW ================= //

    if(managerResult.length > 0){

      const manager = managerResult[0]


      db.query(
  `SELECT * FROM job_applications
WHERE manager_id=?
AND status IN ('REQUEST_SENT', 'SLOTS_RECEIVED')
ORDER BY created_at DESC
LIMIT 1`,
  [manager.manager_id],
  (err, result) => {

    if (err) {
      console.log(err);
      return;
    }

    if (result.length === 0) {
      sendMessage(sender, "❌ No active request found");
      return;
    }

    const application = result[0];

    const data = {
  manager_id: application.manager_id,
  candidate_id: application.candidate_id,
  job_id: application.job_role_id,
  application_id: application.id   
};

    console.log("🎯 Auto-mapped application:", data);
      

        // -------- MANAGER -------- //
        if(true){   

          const slots = parseSlots(text);

          // -------- 1. FORMAT VALIDATION -------- //
          if(slots.length === 0){
            sendMessage(sender,
`❌ Could not understand your slots.

Please send in any of these formats:

✔ Date Month 5pm 6pm  
✔ Date Month 3pm 5pm  
✔ Date Month 10am 11:30am 2pm  
✔ tomorrow 5pm  
✔ next monday 3pm  

You can also send multiple lines:

   ✔ Date Month 5pm 6pm  
      Date Month 3pm 5pm

      (or use comma between dates)
   ✔ Date Month 4pm 6pm, Date Month 3pm 6pm
   ✔ Date Month 4pm 6pm,
      Date Month 3pm 6pm`
            );
            return;
          }

          // -------- 2. DATE VALIDATION -------- //
          const now = new Date();
          const maxDate = new Date();
          maxDate.setDate(now.getDate() + 7);

          const validSlots = [];

          for (let slot of slots) {

            const slotDateTime = new Date(`${slot.date} ${slot.time}`);

            if (slotDateTime <= now) continue;
            if (slotDateTime > maxDate) continue;

            validSlots.push(slot);
          }

          if(validSlots.length === 0){
            sendMessage(sender,
`❌ All slots are invalid.

✔ Only future slots allowed  
✔ Maximum 7 days ahead  

Example:
Date Month 5pm 6pm`
            );
            return;
          }

          if(validSlots.length < slots.length){
            sendMessage(sender, "⚠️ Some invalid slots were ignored.");
          }

          console.log("Valid slots:", validSlots);



// DELETE OLD SLOTS
          db.query(
            "DELETE FROM slots WHERE manager_id=? AND candidate_id=?",
            [data.manager_id, data.candidate_id],
            (err)=>{

              if(err){
                console.log("Delete error:", err)
                return
              }

             

// ===== INSERT ===== //
              validSlots.sort((a, b) => {
  if (a.date === b.date) {
    return a.time.localeCompare(b.time)
  }
  return a.date.localeCompare(b.date)
})
              const insertPromises = validSlots.map(slot => {
              return new Promise((resolve, reject) => {

    // 🔍 CHECK DUPLICATE SLOT
    db.query(
      `SELECT * FROM slots 
       WHERE manager_id=? 
       AND candidate_id=? 
       AND slot_date=? 
       AND start_time=?`,
      [data.manager_id,data.candidate_id, slot.date, slot.time],
      (err, existing) => {

        if(existing.length > 0){
          console.log("⚠️ Duplicate slot skipped");
          return resolve(); // skip duplicate
        }

        // ✅ INSERT ONLY IF UNIQUE
        db.query(
          `INSERT INTO slots (manager_id, job_id, candidate_id, application_id, slot_date, start_time, status)
VALUES (?, ?, ?, ?, ?, ?, 'available')`,
          [
  data.manager_id,
  data.job_id,
  data.candidate_id,
  application.id,   // 🔥 ADD THIS
  new Date(slot.date).toISOString().split('T')[0],
  slot.time
],
          (err)=> err ? reject(err) : resolve()
        )

      }
    )

  })
})

// ✅ EXECUTE INSERT
            Promise.all(insertPromises)
              .then(()=>{

                db.query(
  `UPDATE job_applications
   SET status='SLOTS_RECEIVED'
   WHERE id=?`,
  [application.id]
)

                sendSlotsToCandidate(data)

              })
              .catch(err=>console.log(err))

          }
        )

      }
    })
    return;
  }

    // 🔍 STEP 2: ELSE → CANDIDATE
    // ================= CANDIDATE FLOW (FIXED) ================= //

else {

  db.query(
    "SELECT * FROM candidates WHERE REPLACE(phone,'+','') = ?",
    [sender],
    (err, candidateResult) => {

      if (err) {
        console.log(err);
        return;
      }

      if (candidateResult.length === 0) {
        console.log("❌ Candidate not found");
        sendMessage(sender, "❌ You are not registered");
        return;
      }

      const candidate = candidateResult[0];

      console.log("✅ Candidate found:", candidate.candidate_id);

      // 🔥 GET LATEST APPLICATION (RELAXED STATUS)
      db.query(
        `SELECT * FROM job_applications
         WHERE candidate_id=?
         AND status IN ('SLOTS_RECEIVED')
         ORDER BY created_at DESC
         LIMIT 1`,
        [candidate.candidate_id],
        (err, result) => {

          if (err) {
            console.log(err);
            return;
          }

          console.log("Application result:", result);

          if (result.length === 0) {
            sendMessage(sender, "⚠️ No active interview process found");
            return;
          }

          const application = result[0];

          // 🔥 FETCH AVAILABLE SLOTS
          db.query(
  `SELECT * FROM slots
   WHERE application_id=?
   AND status='available'
   ORDER BY slot_date,start_time`,
  [application.id],
            (err, slots) => {

              if (err) {
                console.log(err);
                return;
              }

              console.log("Slots fetched:", slots);

              if (slots.length === 0) {
                sendMessage(sender, "❌ No slots available right now");
                return;
              }

              const cleanText = text.trim();

              // ================= SLOT SELECTION ================= //
              if (/^\d+$/.test(cleanText)) {

                const slotNumber = Number(cleanText);

                console.log("User selected:", slotNumber);

                const selectedSlot = slots[slotNumber - 1];

                if (!selectedSlot) {
                  sendMessage(sender, "❌ Invalid slot number");
                  return;
                }

                console.log("✅ Slot selected:", selectedSlot);

                reserveSlot(selectedSlot.slot_id, application.id, sender);

              }

              // ================= INVALID INPUT ================= //
              else {
                sendMessage(sender, "⚠️ Please reply with a valid slot number (e.g., 1, 2)");
              }

            }
          );

        }
      );

    }
  );

}


}) 

res.sendStatus(200)

})

// ---------------- SEND SLOTS ---------------- //

function sendSlotsToCandidate(data){

db.query(
  `SELECT s.*, c.name AS candidate_name, j.job_role
   FROM slots s
   JOIN candidates c ON s.candidate_id = c.candidate_id
   JOIN job_roles j ON s.job_id = j.job_id
   WHERE application_id=?
   AND status='available'
   ORDER BY slot_date,start_time`,
  [data.application_id] ,  // you must include this in data,
async (err, result) => {

if(err){
  console.log(err)
  return
}

console.log("Slots found:", result.length)

if(result.length === 0){
  console.log("❌ No slots to send")

  await sendMessage(sender, "⚠️ No valid slots found. Please resend slots.")
  return
}

let message = `Hi ${result[0].candidate_name},

It was great speaking with you about the "${result[0].job_role}" opportunity at Airtel.
Your experience aligns well with the role, so we'd like to move your profile forward.

Could you select your availability for an interview?

📅 Available Interview Slots\n\n`
let counter = 1
let currentDate = ""

const slotMap = {}

result.forEach((slot, index) => {

   const num = index + 1
  slotMap[num] = slot.slot_id 

const dateObj = new Date(slot.slot_date)

const date = dateObj.toLocaleDateString("en-IN",{day:"numeric",month:"long"})

let timeObj = new Date(`1970-01-01T${slot.start_time}`)
let time = timeObj.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit",hour12:true})

if(date !== currentDate){
message += `\n${date}\n`
currentDate = date
}

message += `${counter}️⃣ ${time}\n`
counter++

})

message += "\nReply with slot number to confirm."

console.log("Candidate ID:", data.candidate_id)
console.log("Manager ID:", data.manager_id)

// 🔥 FETCH candidate phone
db.query(
  "SELECT phone FROM candidates WHERE candidate_id=?",
  [data.candidate_id],
  async (err, res) => {

    if(err){
      console.log(err)
      return
    }

    if(res.length === 0){
      console.log("❌ Candidate not found")
      return
    }

    const phone = res[0].phone

    console.log("Fetched slots:", result)

    console.log("Sending to candidate:", phone)

    try {
      await sendMessage(phone, message);
      console.log("✅ Message sent to candidate");
    } catch (err) {
      console.log("❌ Error sending to candidate:", err);
    }

  }
)

})
}

// ---------------- RESERVE SLOT ---------------- //

function reserveSlot(slotId,applicationId, candidatePhone){

db.query(
"SELECT candidate_id FROM candidates WHERE REPLACE(phone,'+','') = ?",
[candidatePhone],
(err, result)=>{

if(result.length === 0){
console.log("Candidate not found")
return
}

const candidateId = result[0].candidate_id

db.query(
`UPDATE slots
SET status='booked',
candidate_id=?,
booked_at=NOW()
WHERE slot_id=? 
AND application_id=?
AND status='available'`,
[ candidateId, slotId, applicationId ],
(err, res2)=>{

if(res2.affectedRows === 0){
sendMessage(candidatePhone,"⚠️ Slot already booked")
return
}
db.query(
  `UPDATE job_applications
   SET 
     status = 'CONFIRMED',
     slot_selected_at = NOW(),
     interview_scheduled_at = NOW()
   WHERE id=?`,
  [applicationId]
);

db.query(
  "UPDATE manager SET reminder_sent=TRUE WHERE manager_id = (SELECT manager_id FROM slots WHERE slot_id=?)",
  [slotId]
);

db.query(
`SELECT s.*, 
c.name AS candidate_name, 
m.name AS manager_name, 
m.phone AS manager_phone,
c.email AS candidate_email, 
m.email AS manager_email,
r.email AS recruiter_email, 
j.job_role
FROM slots s
LEFT JOIN candidates c ON s.candidate_id = c.candidate_id
LEFT JOIN manager m ON s.manager_id = m.manager_id
LEFT JOIN job_roles j ON s.job_id = j.job_id
LEFT JOIN recruiter r ON j.recruiter_id = r.recruiter_id

WHERE s.slot_id=?`,
[slotId],
async (err, result)=>{
  if(err){
      console.log("DB error:", err);
      return;
    }

    if(!result || result.length === 0){
      console.log("❌ No slot found for ID:", slotId);
      return;
    }

const s = result[0]

console.log("Recruiter Email:", s.recruiter_email);

console.log("Slot data:", s);

const start = buildDate(s.slot_date, s.start_time)
const end = new Date(start.getTime() + 30*60000)

const date = start.toLocaleDateString("en-IN",{day:"numeric",month:"long"})
const time = start.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit",hour12:true})
const sendInterviewEmail = require("./sendemail");

console.log("DATA FROM DB:", s); 

const event = await createCalendarEvent({
  date: convertToISODate(date),
  time: convertTo24Hour(time),
  candidateEmail: s.candidate_email,
  managerEmail: s.manager_email
})


await sendInterviewEmail({
  candidateEmail: s.candidate_email,
  managerEmail: s.manager_email,
  recruiterEmail: s.recruiter_email,
  meetLink: event?.meetLink, 
  date,
  time
});



await sendMessage(candidatePhone,
`✅ Your interview for the "${s.job_role}" at Airtel has been scheduled for:

📅 ${date}
⏰ ${time}
📩 Calendar invite has been sent. Please check your email.

Best of luck!`)

await sendMessage(s.manager_phone,
`📌 Interview Booked

👤Candidate: ${s.candidate_name}
📞 Phone: ${candidatePhone}
💼Role: ${s.job_role}

📅 ${date}
⏰ ${time}
📩 Calendar invite has been sent. Please check your email.`)

})

})

})

}
