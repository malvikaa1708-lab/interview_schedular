require("dotenv").config();
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const proxyAgent = new HttpsProxyAgent("http://appproxy.airtel.com:4145");
// change port if different
async function sendMessage(phone, message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        httpsAgent: proxyAgent
      }
    );
    console.log(response.data);
  } catch (error) {
    console.error(
      error.response?.data || error. Message
    );
  }
}
module.exports = sendMessage