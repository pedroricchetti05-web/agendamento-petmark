// api/availability.js
// GET /api/availability?date=2026-05-23&calendarId=xxx@group.calendar.google.com&duration=60
// Retorna os slots do dia com status livre/ocupado consultando o Google Calendar em tempo real

const { google } = require('googleapis');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const { date, calendarId, duration = 60, start = 8, end = 18 } = req.query;

  if (!date || !calendarId) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: date, calendarId' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Buscar todos os eventos do dia
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd   = new Date(`${date}T23:59:59`);

    const eventsRes = await calendar.events.list({
      calendarId,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = eventsRes.data.items || [];

    // Gerar todos os slots do dia
    const slots = [];
    const durMin = parseInt(duration);
    const startH = parseInt(start);
    const endH   = parseInt(end);

    for (let h = startH; h < endH; h++) {
      for (let m = 0; m < 60; m += durMin) {
        if (h * 60 + m + durMin > endH * 60) break;

        const slotStart = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
        const slotEnd   = new Date(slotStart.getTime() + durMin * 60 * 1000);
        const time      = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

        // Verificar se algum evento do Google Calendar ocupa este slot
        const busy = events.some(ev => {
          const evStart = new Date(ev.start.dateTime || ev.start.date);
          const evEnd   = new Date(ev.end.dateTime   || ev.end.date);
          // Sobreposição: slot começa antes do evento terminar E termina depois do evento começar
          return slotStart < evEnd && slotEnd > evStart;
        });

        slots.push({ time, busy });
      }
    }

    return res.status(200).json({ slots, date, total: slots.length, livres: slots.filter(s => !s.busy).length });

  } catch (err) {
    console.error('Erro Google Calendar:', err.message);
    return res.status(500).json({ error: 'Erro ao consultar agenda. Verifique as configurações.' });
  }
}
