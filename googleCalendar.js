const { google } = require("googleapis");
require("dotenv").config();

// 🔥 OAuth Setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oAuth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const calendar = google.calendar({ version: "v3", auth: oAuth2Client });


// ✅ MAIN FUNCTION
async function createCalendarEvent({ date, time, candidateEmail, managerEmail }) {
  try {

    //  DEBUG 
    console.log("Candidate Email:", candidateEmail);
    console.log("Manager Email:", managerEmail);

    // 👉 Create start time
    const startDateTime = `${date}T${time}+05:30`;
    console.log("✅ FINAL START:", startDateTime);

    // 👉 Create end time (+30 mins)
    const endDate = new Date(startDateTime);
    endDate.setMinutes(endDate.getMinutes() + 30);

    // 🔥 SAFE ATTENDEES (prevents crash)
    const attendees = [];

    if (candidateEmail) {
      attendees.push({ email: candidateEmail });
    } else {
      console.log("⚠️ Candidate email missing");
    }

    if (managerEmail) {
      attendees.push({ email: managerEmail });
    } else {
      console.log("⚠️ Manager email missing");
    }

    // 👉 Event object
    const event = {
      summary: "Interview",

      start: {
        dateTime: startDateTime,
        timeZone: "Asia/Kolkata"
      },

      end: {
        dateTime: endDate.toISOString(),
        timeZone: "Asia/Kolkata"
      },

      attendees: attendees,

      conferenceData: {
        createRequest: {
          requestId: "interview-" + Date.now(),
          conferenceSolutionKey: { type: "hangoutsMeet" }
        }
      }
    };

    // 👉 Insert event
    const res = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: "all"
    });

    console.log("✅ Event created:", res.data.htmlLink);

    const meetLink = res.data.conferenceData?.entryPoints?.[0]?.uri;
    console.log("✅ Meet link:", meetLink);

    return {
      eventLink: res.data.htmlLink,
      meetLink: meetLink
    };

  } catch (error) {
    console.error("❌ GOOGLE ERROR:", error.response?.data || error.message);
  }
}

module.exports = createCalendarEvent;