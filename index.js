const express = require("express");
const cors = require("cors");
require("dotenv").config();

const userRoutes = require('./routes/Auth') // Import user routes

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // Parse JSON body
app.use(cors()); // Enable CORS
app.use("/", userRoutes); 

// app.get("/", (req, res) => {
//   res.send("Intelligent Meeting Assistant Backend is running!");
// });

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
