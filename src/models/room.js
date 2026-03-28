const mongoose = require('mongoose')

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    default: null
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // نجعله غير مطلوب حالياً لتجنب مشاكل الإنشاء المفاجئة
  }
}, { timestamps: true })

module.exports = mongoose.model('Room', roomSchema)
