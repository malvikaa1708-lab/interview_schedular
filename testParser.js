const parseSlots = require("./slotParser");

// 👉 Test inputs
const inputs = [
  
  "yesterday 4pm"
];

inputs.forEach(input => {
  console.log("\nINPUT:", input);

  const result = parseSlots(input);

  console.log("OUTPUT:", result);
});