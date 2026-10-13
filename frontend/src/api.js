import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : 'https://school-timetable-production.up.railway.app'),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
