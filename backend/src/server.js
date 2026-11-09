require('dotenv').config();

// Refuse to start with a missing or weak JWT secret
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET is missing or too short (use at least 16 characters). Check your .env file.');
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
