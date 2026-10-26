const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const farmRoutes = require('./routes/farms');
const livestockRoutes = require('./routes/livestock');
const vaccinationRoutes = require('./routes/vaccinations');
const diseaseRoutes = require('./routes/diseases');
const biosecurityRoutes = require('./routes/biosecurity');
const gisRoutes = require('./routes/gis');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const reportRoutes = require('./routes/reports');
const healthRoutes = require('./routes/health');
const inventoryRoutes = require('./routes/inventory');
const farmActivityRoutes = require('./routes/farmActivities');
const appointmentRoutes = require('./routes/appointments');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/livestock', livestockRoutes);
app.use('/api/vaccinations', vaccinationRoutes);
app.use('/api/diseases', diseaseRoutes);
app.use('/api/biosecurity', biosecurityRoutes);
app.use('/api/gis', gisRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/health-records', healthRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/farm-activities', farmActivityRoutes);
app.use('/api/appointments', appointmentRoutes);

app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

app.use(errorHandler);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    logger.info('MongoDB Atlas connected');
    app.listen(process.env.PORT || 5000, () =>
      logger.info(`Server running on port ${process.env.PORT || 5000}`)
    );
  })
  .catch(err => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = app;
