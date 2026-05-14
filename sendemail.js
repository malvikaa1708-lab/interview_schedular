const nodemailer = require("nodemailer");
require("dotenv").config();

// ✅ transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendInterviewEmail({
  candidateEmail,
  managerEmail,
  recruiterEmail,
  meetLink,
  date,
  time
}) {
  try {

    const mailOptions = {
      from: process.env.EMAIL_USER,

      to: [candidateEmail, managerEmail] ,

      cc: [recruiterEmail],

      subject: "Interview Scheduled",

      // ✅ HTML MUST BE IN BACKTICKS
      html: `
        <p>Hi,</p>

        <p>Your interview has been successfully scheduled.</p>

        <p>
          <b>Date:</b> ${date}<br>
          <b>Time:</b> ${time}
        </p>

        <p>
          📅 A calendar invite has been sent to your email.<br>
          👉 Please use that invite to join the meeting.
        </p>

        <p>
          🔗 Quick access to meeting:<br>
          <a href="${meetLink}">${meetLink}</a>
        </p>

        <br>

        <p>Best regards,<br>
        Interview Scheduler System</p>
      `
    };

    await transporter.sendMail(mailOptions);

    console.log("✅ Email sent successfully");

  } catch (err) {
    console.log("❌ Email error:", err);
  }
}

module.exports = sendInterviewEmail;