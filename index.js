const express = require("express");
const cors = require("cors");
require("dotenv").config();

const userRoutes = require('./routes/authRoutes');
const mediaUploadRoutes = require('./routes/mediaRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // Parse JSON body
app.use("/", userRoutes); 
app.use("/media", mediaUploadRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});