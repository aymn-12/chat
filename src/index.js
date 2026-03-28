require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const mongoose = require('mongoose')
const cors = require('cors')
const jwt = require('jsonwebtoken')
 

const Message = require('./models/message')
const Room = require('./models/room')
const authRoutes = require('./routes/auth')

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: { origin: 'https://chat-frontend-two-omega.vercel.app/' }
})

app.use(cors())
app.use(express.json())
app.use('/api/auth', authRoutes)

// ── Socket.IO Auth Middleware ──────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (!token) return next(new Error('Unauthorized'))

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    socket.data.userId   = decoded.id
    socket.data.username = decoded.username
    next()
  } catch {
    next(new Error('Invalid token'))
  }
})

// ── Socket.IO Events ───────────────────────────────────
const sendRoomUsers = async (roomName) => {
  if (!roomName) return
  const sockets = await io.in(roomName).fetchSockets()
  const users = [...new Set(sockets.map(s => s.data.username))]
  io.to(roomName).emit('room_users', users)
}

io.on('connection', (socket) => {
  console.log(`✅ ${socket.data.username} اتصل`)

  // انضمام لغرفة + إرسال الرسائل القديمة
  socket.on('join_room', async ({ room: roomName, password }) => {
    try {
      let room = await Room.findOne({ name: roomName })

      // مغادرة الغرفة السابقة إذا وجدت لمنع تداخل الرسائل
      if (socket.data.room) {
        socket.leave(socket.data.room)
      }

      socket.join(roomName)
      socket.data.room = roomName

      if (!room) {
        // إنشاء الغرفة إذا لم تكن موجودة
        room = await Room.create({ 
          name: roomName, 
          password: password || null,
          creator: socket.data.userId || null // نضع null إذا لم يتوفر الـ ID مؤقتاً للتأكد من عدم تعطل النظام
        })
      } else if (room.password && room.password !== password) {
        // كلمة مرور خاطئة
        return socket.emit('join_error', 'كلمة المرور غير صحيحة')
      }

      // آخر 50 رسالة من DB
      const messages = await Message.find({ room: roomName })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('sender', 'username')
        .then(msgs => msgs.reverse())

      socket.emit('message_history', messages)
      socket.to(roomName).emit('user_joined', { username: socket.data.username })
      
      // تحديث قائمة المتواجدين
      sendRoomUsers(roomName)
    } catch (error) {
      console.error('❌ Join room error full details:', error)
      const errorMsg = error.name === 'ValidationError' 
        ? `بيانات الغرفة غير صالحة: ${Object.keys(error.errors).join(', ')}`
        : 'حدث خطأ أثناء الدخول للغرفة'
      socket.emit('join_error', errorMsg)
    }
  })

  // استقبال رسالة جديدة
  socket.on('send_message', async (text) => {
    const room = socket.data.room
    if (!room || !text?.trim()) return

    const message = await Message.create({
      room,
      sender: socket.data.userId,
      text: text.trim()
    })

    const populated = await message.populate('sender', 'username')

    // إرسال للكل في الغرفة
    io.to(room).emit('receive_message', populated)
  })

  // Typing indicator
  socket.on('typing', () => {
    socket.to(socket.data.room).emit('user_typing', {
      username: socket.data.username
    })
  })

  // الحصول على قائمة الغرف
  socket.on('get_rooms', async () => {
    try {
      const rooms = await Room.find({})
        .select('name password createdAt')
        .populate('creator', 'username')
        .sort({ createdAt: -1 })
      
      // نرسل فقط إذا كانت الغرفة بكلمة مرور أم لا، بدون إرسال كلمة المرور نفسها
      const safeRooms = rooms.map(r => ({
        name: r.name,
        hasPassword: !!r.password,
        creator: r.creator?.username || 'system',
        createdAt: r.createdAt
      }))

      socket.emit('rooms_list', safeRooms)
    } catch (error) {
      console.error('Error fetching rooms:', error)
    }
  })

  socket.on('disconnect', () => {
    console.log(`❌ ${socket.data.username} leave`)
    if (socket.data.room) {
      socket.to(socket.data.room).emit('user_left', {
        username: socket.data.username
      })
      sendRoomUsers(socket.data.room)
    }
  })
})

// ── DB + Server ────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connect')
    server.listen(process.env.PORT, () =>
      console.log(`🚀 server is runningport ${process.env.PORT}`)
    )
  })
  .catch(err => console.error('❌ MongoDB error:', err))