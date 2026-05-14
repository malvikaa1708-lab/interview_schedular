const chrono = require("chrono-node");

function parseSlots(text) {

  const lines = text.split(/\n|,/);
  const slots = [];

  lines.forEach(line => {

    // Extract date using chrono
    const parsed = chrono.parse(line);

    if(parsed.length === 0) return;

    const dateObj = parsed[0].start.date();
    const date = dateObj.toISOString().split("T")[0];

    // 🔥 Extract ALL times (5pm, 6pm etc.)
    const timeMatches = line.match(/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/gi);

    if(!timeMatches) return;

    timeMatches.forEach(t => {

      let parsedTime = chrono.parse(t)[0];
      if(!parsedTime) return;

      const timeObj = parsedTime.start.date();

      const hours = timeObj.getHours().toString().padStart(2, "0");
      const minutes = timeObj.getMinutes().toString().padStart(2, "0");

      slots.push({
        date: date,
        time: `${hours}:${minutes}:00`
      });

    });

  });

  return slots;
}

module.exports = parseSlots;