import axios from 'axios';
import { normalizePhone } from '../utils/phone.js';

const DEFAULT_API_URL = 'https://api.green-api.com';

function getGreenApiConfig() {
  return {
    apiUrl: (process.env.GREEN_API_URL || DEFAULT_API_URL).replace(/\/+$/, ''),
    idInstance: process.env.GREEN_API_ID_INSTANCE,
    tokenInstance: process.env.GREEN_API_TOKEN_INSTANCE,
  };
}

function ensureConfig({ idInstance, tokenInstance }) {
  if (!idInstance || !tokenInstance) {
    throw new Error('Green API не настроен: заполните GREEN_API_ID_INSTANCE и GREEN_API_TOKEN_INSTANCE');
  }
}

function buildMethodUrl(method) {
  const config = getGreenApiConfig();
  ensureConfig(config);
  return `${config.apiUrl}/waInstance${config.idInstance}/${method}/${config.tokenInstance}`;
}

async function ensureInstanceAuthorized() {
  const { data } = await axios.get(buildMethodUrl('getStateInstance'), {
    timeout: 10000,
  });

  if (data?.stateInstance !== 'authorized') {
    throw new Error(`Green API instance не авторизован: ${data?.stateInstance || 'unknown'}`);
  }
}

export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendWhatsAppMessage(phone, message) {
  const chatId = `${normalizePhone(phone)}@c.us`;

  try {
    await ensureInstanceAuthorized();

    const { data } = await axios.post(
      buildMethodUrl('sendMessage'),
      { chatId, message },
      {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!data?.idMessage) {
      throw new Error('Green API не вернул idMessage');
    }

    return data;
  } catch (error) {
    const details = error.response?.data || error.message;
    console.error('[Green API] Failed to send WhatsApp message:', details);
    throw new Error('Не удалось отправить сообщение WhatsApp через Green API');
  }
}

export async function sendVerificationCode(phone, code) {
  const message = `Ваш код подтверждения для Best Volleyball Academy: *${code}*\n\nКод действителен 10 минут.`;
  return sendWhatsAppMessage(phone, message);
}
