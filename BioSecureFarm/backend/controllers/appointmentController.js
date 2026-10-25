const Appointment = require('../models/Appointment');
const Farm = require('../models/Farm');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Create appointment
exports.createAppointment = async (req, res) => {
  try {
    const { farmId, veterinarianId, appointmentDate, appointmentTime, visitType, reason } = req.body;
    
    const farm = await Farm.findById(farmId);
    if (!farm) return res.status(404).json({ error: 'Farm not found' });
    
    const veterinarian = await User.findById(veterinarianId);
    if (!veterinarian || veterinarian.role !== 'veterinarian') {
      return res.status(404).json({ error: 'Veterinarian not found' });
    }
    
    const appointment = await Appointment.create({
      farm: farmId,
      farmer: req.user.id,
      veterinarian: veterinarianId,
      appointmentDate,
      appointmentTime,
      visitType: visitType || 'Farm Visit',
      reason
    });
    
    await appointment.populate([
      { path: 'farm', select: 'farmName farmType address' },
      { path: 'farmer', select: 'fullName mobile' },
      { path: 'veterinarian', select: 'fullName' }
    ]);
    
    // Send notification to veterinarian
    await Notification.create({
      recipient: veterinarianId,
      title: 'New Appointment Request',
      message: `New appointment request from ${farm.farmName} for ${new Date(appointmentDate).toLocaleDateString()} at ${appointmentTime}. Reason: ${reason || 'Not specified'}`,
      type: 'appointment',
      data: { appointmentId: appointment._id, farmId, action: 'new_request' }
    });
    
    res.status(201).json(appointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get appointments (by role)
exports.getAppointments = async (req, res) => {
  try {
    const { veterinarianId, farmerId, farmId, status } = req.query;
    const query = {};
    
    if (veterinarianId) query.veterinarian = veterinarianId;
    else if (farmerId) query.farmer = farmerId;
    else if (req.user.role === 'farmer') query.farmer = req.user.id;
    else if (req.user.role === 'veterinarian') query.veterinarian = req.user.id;
    
    if (status) query.status = status;
    
    const appointments = await Appointment.find(query)
      .populate('farm', 'farmName farmType address location')
      .populate('farmer', 'fullName mobile district')
      .populate('veterinarian', 'fullName district')
      .sort({ createdAt: -1 });
    
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single appointment
exports.getAppointmentById = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('farm', 'farmName farmType address location')
      .populate('farmer', 'fullName mobile district')
      .populate('veterinarian', 'fullName district');
    
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update appointment status (accept/reject)
exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const { id } = req.params;
    
    const appointment = await Appointment.findById(id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    
    // Only veterinarian can accept/reject
    if (req.user.role !== 'veterinarian' || String(appointment.veterinarian) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to update this appointment' });
    }
    
    if (!['CONFIRMED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    appointment.status = status;
    if (status === 'CONFIRMED') {
      appointment.confirmedAt = new Date();
    } else if (status === 'REJECTED') {
      appointment.rejectedAt = new Date();
      appointment.rejectionReason = rejectionReason;
    }
    
    await appointment.save();
    await appointment.populate([
      { path: 'farm', select: 'farmName' },
      { path: 'farmer', select: 'fullName' },
      { path: 'veterinarian', select: 'fullName' }
    ]);
    
    // Send notification to farmer
    const notificationTitle = status === 'CONFIRMED' ? 'Appointment Confirmed' : 'Appointment Declined';
    const notificationMessage = status === 'CONFIRMED'
      ? `Your appointment for ${appointment.farm.farmName} has been confirmed for ${new Date(appointment.appointmentDate).toLocaleDateString()} at ${appointment.appointmentTime}.`
      : `Your appointment request for ${appointment.farm.farmName} has been declined. ${rejectionReason ? `Reason: ${rejectionReason}` : ''}`;
    
    await Notification.create({
      recipient: appointment.farmer._id,
      title: notificationTitle,
      message: notificationMessage,
      type: 'appointment',
      data: { appointmentId: appointment._id, status, rejectionReason }
    });
    
    // If confirmed, assign vet to farm
    if (status === 'CONFIRMED') {
      await Farm.findByIdAndUpdate(appointment.farm._id, {
        assignedVet: appointment.veterinarian._id
      });
    }
    
    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cancel appointment (farmer)
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id);
    
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    
    if (String(appointment.farmer) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    if (!['PENDING', 'CONFIRMED'].includes(appointment.status)) {
      return res.status(400).json({ error: 'Cannot cancel this appointment' });
    }
    
    appointment.status = 'CANCELLED';
    await appointment.save();
    
    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get available veterinarians within radius
exports.getNearbyVeterinarians = async (req, res) => {
  try {
    const { farmId } = req.query;
    
    if (!farmId) return res.status(400).json({ error: 'Farm ID required' });
    
    const farm = await Farm.findById(farmId);
    if (!farm) return res.status(404).json({ error: 'Farm not found' });
    
    const { coordinates } = farm.location;
    if (!coordinates || coordinates[0] === 0) {
      // Return all veterinarians if no coordinates
      const vets = await User.find({ role: 'veterinarian', isActive: true })
        .select('fullName district fcmToken')
        .lean();
      return res.json(vets.map(v => ({
        userId: v._id,
        name: v.fullName,
        district: v.district,
        availability: 'AVAILABLE',
        specializations: [],
        proximityLabel: v.district || 'Location not specified',
        workload: 0,
        capacity: 10
      })));
    }
    
    const RADIUS_KM = 50; // 50km radius for initial search
    const maxDistance = RADIUS_KM * 1000;
    
    const nearbyVets = await User.find({
      role: 'veterinarian',
      isActive: true,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates },
          $maxDistance: maxDistance
        }
      }
    }).select('fullName district fcmToken').lean();
    
    // Calculate distance for each vet
    const vetsWithDistance = nearbyVets.map(vet => {
      const vetCoords = vet.location?.coordinates || [0, 0];
      const distance = getDistanceFromLatLonInKm(
        coordinates[1], coordinates[0],
        vetCoords[1], vetCoords[0]
      );
      return {
        userId: vet._id,
        name: vet.fullName,
        district: vet.district,
        availability: 'AVAILABLE',
        specializations: [],
        proximityLabel: `${distance.toFixed(1)} km away`,
        distance: distance.toFixed(2),
        workload: 0,
        capacity: 10
      };
    });
    
    // Sort by distance
    vetsWithDistance.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    
    res.json(vetsWithDistance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all veterinarians (for demo/fallback)
exports.getAllVeterinarians = async (req, res) => {
  try {
    const vets = await User.find({ role: 'veterinarian', isActive: true })
      .select('fullName district fcmToken')
      .lean();
    
    res.json(vets.map(v => ({
      userId: v._id,
      name: v.fullName,
      district: v.district,
      availability: 'AVAILABLE',
      specializations: [],
      proximityLabel: v.district || 'Location not specified',
      workload: 0,
      capacity: 10
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}