const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'tasks';

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error('Redis HTTP ' + res.status + ': ' + (await res.text()));
  return res.json();
}

function validTasks(tasks) {
  return Array.isArray(tasks) && tasks.every((t) => t && typeof t === 'object' && typeof t.id === 'string');
}
function normalize(data) {
  if (Array.isArray(data)) {
    return validTasks(data) ? { people: [], tasks: data, history: [], meetings: [], notes: {}, settings: {} } : null;
  }
  if (data && typeof data === 'object') {
    const people = Array.isArray(data.people) ? data.people : [];
    if (!validTasks(data.tasks)) return null;
    if (!people.every((p) => p && typeof p === 'object' && typeof p.id === 'string')) return null;
    return {
      people, tasks: data.tasks,
      history: Array.isArray(data.history) ? data.history : [],
      meetings: Array.isArray(data.meetings) ? data.meetings : [],
      notes: data.notes && typeof data.notes === 'object' ? data.notes : {},
      settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
    };
  }
  return null;
}

module.exports = async (req, res) => {
  try {
    if (!REDIS_URL || !REDIS_TOKEN) {
      res.status(500).json({ error: 'Не заданы переменные окружения UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN' });
      return;
    }
    if (req.method === 'GET') {
      const { result } = await redis(['GET', KEY]);
      let data = { people: [], tasks: [] };
      if (result) { try { const n = normalize(JSON.parse(result)); if (n) data = n; } catch (_) {} }
      res.status(200).json(data);
      return;
    }
    if (req.method === 'PUT') {
      let data = req.body;
      if (typeof data === 'string') data = JSON.parse(data || '{}');
      const payload = normalize(data);
      if (!payload) { res.status(400).json({ error: 'Ожидается { people, tasks } с полем id' }); return; }
      await redis(['SET', KEY, JSON.stringify(payload)]);
      res.status(200).json({ ok: true, count: payload.tasks.length });
      return;
    }
    res.setHeader('Allow', 'GET, PUT');
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
