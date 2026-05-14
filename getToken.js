const { google } = require("googleapis");

// 🔥 PUT YOUR VALUES HERE
const CLIENT_ID ="70016566861-m9omgua24ko8jd10subfq0cpu7qf45vc.apps.googleusercontent.com";
const CLIENT_SECRET ="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";
const REDIRECT_URI ="http://localhost:3000";

// Step 1: Create OAuth client
const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Step 2: Generate auth URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/calendar"],
});

console.log("\n👉 Open this URL in browser:\n");
console.log(authUrl);

// 👉 AFTER YOU GET CODE, PASTE BELOW
const code = "4/0AeoWuM9OdmAqkfIdYffEMbtEwiLeoQI49EoaJlO6zMjl6FBCxaG9jUWsNitdfrY6k1gPig";  // ⚠️ Replace after step 3

// Step 3: Exchange code for token
oAuth2Client.getToken(code, (err, token) => {
  if (err) {
    console.error("❌ Error retrieving token:", err);
    return;
  }

  console.log("\n✅ TOKENS RECEIVED:\n");
  console.log(token);

  console.log("\n🔥 COPY THIS REFRESH TOKEN:\n");
  console.log(token.refresh_token);
});