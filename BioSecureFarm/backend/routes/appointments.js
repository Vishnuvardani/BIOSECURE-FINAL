const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  cancelAppointment,
  getNearbyVeterinarians,
  getAllVeterinarians
} = require('../controllers/appointmentController');

// All routes require authentication
router.use(authMiddleware);

// Appointment CRUD
router.post('/', createAppointment);
router.get('/', getAppointments);
router.get('/nearby-veterinarians', getNearbyVeterinarians);
router.get('/all-veterinarians', getAllVeterinarians);
router.get('/:id', getAppointmentById);
router.put('/:id/status', updateAppointmentStatus);
router.put('/:id/cancel', cancelAppointment);

module.exports = router;