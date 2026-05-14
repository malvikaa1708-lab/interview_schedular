const { createEvent } = require("ics")
const fs = require("fs")

function generateInvite(slotId, date, time){

const start = new Date(`${date}T${time}`)

const event = {
title: "Interview Meeting",
description: "Scheduled Interview",
start: [
start.getFullYear(),
start.getMonth()+1,
start.getDate(),
start.getHours(),
start.getMinutes()
],
duration: { minutes: 30 }
}

createEvent(event,(error,value)=>{

if(error){
console.log(error)
return
}

fs.writeFileSync(`invites/${slotId}.ics`,value)

})

return `${process.env.SERVER_URL}/invite/${slotId}.ics`

}

module.exports = generateInvite

