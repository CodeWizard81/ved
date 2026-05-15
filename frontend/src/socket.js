import { io } from 'socket.io-client';

const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

const socket = io(backendUrl, {
  autoConnect: false // We will connect manually when App mounts
});

export default socket;
