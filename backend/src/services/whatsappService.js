import axios from 'axios';
import { normalizePhone } from '../utils/phone.js';

const BASE_URL = process.env.GREEN_API_URL;
const ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE;
const TOKEN = process.env.GREEN_API_TOKEN_INSTANCE;

export async function sendWhatsAppMessage(phone, message) {
  const chatId = `${normalizePhone(phone)}@c.us`;
  const url = `${BASE_URL}/waInstance${ID_INSTANCE}/sendMessage/${TOKEN}`;

  try {
    const response = await axios.post(url, {
      chatId,
      message,
    });
    return response.data;
  } catch (error) {
    const msg = error.response?.data || error.message;
    console.error('[WhatsApp] Failed to send message:', msg);
    throw new Error('Не удалось отправить сообщение WhatsApp');
  }
}

export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationCode(phone, code) {
  const message = `Ваш код подтверждения для Mercury Medet: *${code}*\n\nКод действителен 10 минут.`;
  return sendWhatsAppMessage(phone, message);
}
