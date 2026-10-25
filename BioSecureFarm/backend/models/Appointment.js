const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true },
  farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  veterinarian: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentDate: { type: Date, required: true },
  appointmentTime: { type: String, required: true },
  visitType: { type: String, enum: ['Farm Visit', 'Online Consultation'], default: 'Farm Visit' },
  reason: { type: String },
  status: { type: String, enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'], default: 'PENDING' },
  rejectionReason: { type: String },
  confirmedAt: { type: Date },
  rejectedAt: { type: Date },
  notes: { type: String }
}, { timestamps: true });

appointmentSchema.index({ veterinarian: 1, appointmentDate: 1 });
appointmentSchema.index({ farmer: 1, status: 1 });
appointmentSchema.index({ farm: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);