/**
 * Seed script to connect Vet Priya Vishnu with Jay Farms
 * Run: node scripts/seed-priya-jay.js
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../BioSecureFarm/backend/models/User');
const Farm = require('../BioSecureFarm/backend/models/Farm');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/biosecure_db';

async function seedPriyaJay() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Create vet Priya Vishnu
  const vetPassword = await bcrypt.hash('vet123456', 12);
  const vet = await User.findOneAndUpdate(
    { email: 'priya.vishnu@biosecure.in' },
    {
      fullName: 'Priya Vishnu',
      email: 'priya.vishnu@biosecure.in',
      mobile: '+91 9876543200',
      role: 'veterinarian',
      password: vetPassword,
      district: 'Coimbatore',
      state: 'Tamil Nadu',
      isActive: true,
      isVerified: true,
      location: {
        type: 'Point',
        coordinates: [76.9558, 11.0168] // Coimbatore coordinates
      }
    },
    { upsert: true, new: true }
  );
  console.log('Vet Priya Vishnu created:', vet._id);

  // Create Jay Farms
  const farm = await Farm.findOneAndUpdate(
    { farmName: 'Jay Farms' },
    {
      farmName: 'Jay Farms',
      farmType: 'pig',
      owner: vet._id, // Same owner for demo purposes
      registrationNumber: 'JAY-FARM-2024',
      address: {
        street: '123 Farm Road',
        city: 'Coimbatore',
        district: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641001'
      },
      location: {
        type: 'Point',
        coordinates: [76.9558, 11.0168] // Same location as vet for demo
      },
      totalArea: 5,
      capacity: 500,
      currentCount: 250,
      assignedVet: vet._id,
      biosecurityScore: 85,
      riskLevel: 'low',
      isActive: true
    },
    { upsert: true, new: true }
  );
  console.log('Jay Farms created:', farm._id);

  // Assign vet to farm
  await Farm.findByIdAndUpdate(farm._id, { assignedVet: vet._id });
  console.log('Vet assigned to farm');

  // Add farm to vet's assigned farms
  await User.findByIdAndUpdate(vet._id, { $addToSet: { assignedFarms: farm._id } });
  console.log('Farm added to vet assignments');

  console.log('\n✅ Seed completed successfully!');
  console.log('Vet Priya Vishnu:', vet.email, '/ vet123456');
  console.log('Jay Farms:', farm.farmId);
  
  await mongoose.disconnect();
}

seedPriyaJay().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});