require("dotenv").config()
const axios = require("axios")

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
}
})

console.log("WhatsApp Response:", response.data)

} catch (error) {

console.log("WhatsApp Error:")
console.log(error.response?.data || error.message)

}

}

module.exports = sendMessage