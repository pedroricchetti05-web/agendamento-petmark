// api/book.js
// POST /api/book
// Cria um evento no Google Calendar do cliente com verificação anti-double-booking

const { google } = require('googleapis');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { calendarId, date, time, duration, service, profissional, clientName, clientPhone, petName, especie, raca, notes } = req.body;

  if (!calendarId || !date || !time || !duration || !service || !clientName || !clientPhone || !petName) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // ── Verificação anti-double-booking ────────────────────
    const [h, m] = time.split(':').map(Number);
    const eventStart = new Date(`${date}T${time}:00`);
    const eventEnd   = new Date(eventStart.getTime() + parseInt(duration) * 60 * 1000);

    const checkRes = await calendar.events.list({
      calendarId,
      timeMin: eventStart.toISOString(),
      timeMax: eventEnd.toISOString(),
      singleEvents: true,
    });

    const conflitos = checkRes.data.items || [];
    if (conflitos.length > 0) {
      return res.status(409).json({
        error: 'SLOT_BUSY',
        message: 'Este horário acabou de ser reservado. Por favor, escolha outro horário.',
      });
    }

    // ── Criar evento no Google Calendar ───────────────────
    const durMin   = parseInt(duration);
    const durationLabel = durMin < 60 ? `${durMin}min` : `${durMin/60}h`;
    const codigo   = 'PET-' + Math.random().toString(36).toUpperCase().slice(2,7);

    const eventBody = {
      summary:     `${service} — ${petName} (${clientName})`,
      description: [
        `🐾 Serviço: ${service}`,
        `👤 Profissional: ${profissional || 'A definir'}`,
        `📱 WhatsApp: ${clientPhone}`,
        `🐕 Pet: ${petName} ${especie ? `(${especie})` : ''} ${raca ? `• Raça: ${raca}` : ''}`,
        notes ? `📝 Obs: ${notes}` : '',
        `🎫 Código: ${codigo}`,
        `⏱ Duração: ${durationLabel}`,
      ].filter(Boolean).join('\n'),
      start: { dateTime: eventStart.toISOString(), timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: eventEnd.toISOString(),   timeZone: 'America/Sao_Paulo' },
      colorId: '2', // verde no Google Calendar
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup',  minutes: 60 },
          { method: 'popup',  minutes: 15 },
        ],
      },
    };

    const created = await calendar.events.insert({ calendarId, resource: eventBody });

    return res.status(200).json({
      success: true,
      codigo,
      eventId: created.data.id,
      eventLink: created.data.htmlLink,
      message: 'Agendamento criado com sucesso na agenda do estabelecimento.',
    });

  } catch (err) {
    console.error('Erro ao criar evento:', err.message);
    return res.status(500).json({ error: 'Erro ao criar agendamento. Tente novamente.' });
  }
}
