const jwt = require('jsonwebtoken')
const User = require('../models/user')

const signToken = (user) =>
  jwt.sign(
    { id: user._id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

const register = async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password)
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' })

    const exists = await User.findOne({ username })
    if (exists)
      return res.status(400).json({ message: 'اسم المستخدم محجوز' })

    const user = await User.create({ username, password })
    res.status(201).json({ token: signToken(user), username: user.username })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

const login = async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password)
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' })

    const user = await User.findOne({ username })
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'بيانات خاطئة' })

    res.json({ token: signToken(user), username: user.username })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

module.exports = { register, login }