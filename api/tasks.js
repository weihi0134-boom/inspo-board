import { getArray, setArray, readJson, getQueryId, TASKS_KEY } from './_store.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const tasks = await getArray(TASKS_KEY);
      res.status(200).json({ tasks });
      return;
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const tasks = await getArray(TASKS_KEY);
      const task = {
        id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: String(body.title || '').slice(0, 300),
        status: ['todo', 'doing', 'done'].includes(body.status) ? body.status : 'todo',
        ideaId: body.ideaId ? String(body.ideaId) : '',
        due: body.due ? String(body.due) : '',
        createdAt: Date.now(),
      };
      tasks.unshift(task);
      await setArray(TASKS_KEY, tasks);
      res.status(200).json({ task });
      return;
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const tasks = await getArray(TASKS_KEY);
      const t = tasks.find((x) => x.id === body.id);
      if (t) {
        if (body.status && ['todo', 'doing', 'done'].includes(body.status)) t.status = body.status;
        if (typeof body.title === 'string') t.title = body.title.slice(0, 300);
        if (typeof body.due === 'string') t.due = body.due;
        if (typeof body.ideaId === 'string') t.ideaId = body.ideaId;
        await setArray(TASKS_KEY, tasks);
      }
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === 'DELETE') {
      const id = getQueryId(req);
      let tasks = await getArray(TASKS_KEY);
      tasks = tasks.filter((x) => x.id !== id);
      await setArray(TASKS_KEY, tasks);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
