let io = null;

export function initSocket(socketIo) {
  io = socketIo;

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on('join:admin', () => {
      socket.join('admins');
      console.log(`[Socket.io] Admin joined room: ${socket.id}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });
}

/**
 * Emits a new visit log to all connected admin clients
 * @param {object} visitLog - The visit log object
 */
export function emitNewVisit(visitLog) {
  if (!io) return;
  io.to('admins').emit('visit:new', visitLog);
}
