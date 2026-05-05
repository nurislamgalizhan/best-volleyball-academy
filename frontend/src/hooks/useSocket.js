import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

let socket = null;

function getSocket() {
  if (!socket) {
    socket = io('/', { autoConnect: false });
  }
  return socket;
}

export function useAdminSocket(onNewVisit) {
  const cbRef = useRef(onNewVisit);
  cbRef.current = onNewVisit;

  useEffect(() => {
    const s = getSocket();
    s.connect();
    s.emit('join:admin');

    const handler = (visitLog) => cbRef.current?.(visitLog);
    s.on('visit:new', handler);

    return () => {
      s.off('visit:new', handler);
      s.disconnect();
      socket = null;
    };
  }, []);
}
