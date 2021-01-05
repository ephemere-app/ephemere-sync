import http from 'http'
import express from 'express'
import { Server } from 'socket.io'
import { createAdapter } from 'socket.io-redis'
import pino from 'pino'
import pinoHttp from 'pino-http'
import dotenv from 'dotenv'

dotenv.config()

enum Events {
  userJoin = 'user-join',
  userLeave = 'user-leave',
  userList = 'user-list',
  newRoomData = 'new-room-data',
}

const port = process.env.PORT || 80
const corsOrigin = process.env.CORS_ORIGIN || undefined
const redisUri = process.env.REDIS_URI || undefined

const logger = pino()

const app = express()
app.use((req, res, next) => {
  if (req.header('X-CleverCloud-Monitoring') === 'telegraf') {
    return res.sendStatus(200)
  }
  next()
})
app.use(pinoHttp())
app.get('/', (req, res) => {
  res.status(200).json({
    name: process.env.npm_package_name,
    description: process.env.npm_package_description,
    version: process.env.npm_package_version,
  })
})

const server = http.createServer(app)
server.listen(port, () => {
  logger.info(`Server started on port ${port}`)
})

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

if (redisUri) {
  logger.info('Enabling Socket-IO Redis adapter')
  io.adapter(createAdapter(redisUri))
}

io.on('connection', async (socket) => {
  socket.on('join-room', async (room: string) => {
    socket.join(room)
    socket.to(room).emit(Events.userJoin, socket.id)

    const ids = await io.in(room).allSockets()
    io.in(room).emit(Events.userList, [...ids])
  })

  socket.on('leave-room', async (room: string) => {
    socket.leave(room)
    socket.to(room).emit(Events.userLeave, socket.id)

    const ids = await io.in(room).allSockets()
    io.in(room).emit(Events.userList, [...ids])
  })

  socket.on('broadcast-room-data', (room: string, encryptedData: string) => {
    socket.to(room).emit(Events.newRoomData, encryptedData)
  })

  socket.on(
    'broadcast-volatile-room-data',
    (room: string, encryptedData: string) => {
      socket.volatile.to(room).emit(Events.newRoomData, encryptedData)
    }
  )
})
