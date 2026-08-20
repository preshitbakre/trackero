import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { createTestApp, clearDatabase, registerAdmin } from './setup';

// supertest doesn't buffer non-text bodies by default; collect the raw bytes.
function binaryParser(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

async function parseSheet(body: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(body);
  const sheet = wb.getWorksheet('Tickets')!;
  const rows: Record<string, any>[] = [];
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => { headers[col] = String(cell.value); });
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj: Record<string, any> = {};
    row.eachCell((cell, col) => { obj[headers[col]] = cell.value; });
    rows.push(obj);
  });
  return rows;
}

describe('WorkItems Export (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: number;
  let projectId: number;

  let epicKey: string;
  let storyKey: string;
  let taskKey: string;
  let sprintId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const createItem = (body: any) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const belongsTo = (itemId: number, linkedItemId: number) =>
    request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${itemId}/associations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ linkedItemId, linkType: 'belongs_to' });

  const exportXlsx = (query: string) =>
    request(app.getHttpServer())
      .get(`/api/projects/${projectId}/items/export${query}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer()
      .parse(binaryParser);

  beforeEach(async () => {
    await clearDatabase(app);
    const admin = await registerAdmin(app);
    adminToken = admin.token;
    adminId = admin.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', prefix: 'TST' });
    projectId = projRes.body.data.item.id;

    // Hierarchy: epic ← story ← task ← subtask (+ checklist on task).
    const epic = await createItem({ itemType: 'epic', title: 'Epic' });
    epicKey = epic.body.data.item.itemKey;
    const story = await createItem({ itemType: 'story', title: 'Story' });
    storyKey = story.body.data.item.itemKey;
    const task = await createItem({ itemType: 'task', title: 'Task' });
    taskKey = task.body.data.item.itemKey;
    const subtask = await createItem({ itemType: 'subtask', title: 'Subtask', parentId: task.body.data.item.id });

    await belongsTo(story.body.data.item.id, epic.body.data.item.id);
    await belongsTo(task.body.data.item.id, story.body.data.item.id);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${task.body.data.item.id}/checklist`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Check A' });

    // A sprint that holds only the task.
    const [sprint] = await ds.query(
      `INSERT INTO sprints (project_id, name, status, sprint_number, created_by)
       VALUES ($1, 'Sprint 1', 'planning', 1, $2) RETURNING id`,
      [projectId, adminId],
    );
    sprintId = sprint.id;
    await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/items/${task.body.data.item.id}/sprint`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sprintId });
  });

  it('exports all tickets as a real xlsx with the right content-type', async () => {
    const res = await exportXlsx('').expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('tickets-export-all-');
    expect(res.body.length).toBeGreaterThan(0);

    const rows = await parseSheet(res.body);
    const types = rows.map((r) => r.Type);
    expect(types).toContain('epic');
    expect(types).toContain('story');
    expect(types).toContain('task');
    expect(types).toContain('subtask');
    expect(types).toContain('checklist');
  });

  it('resolves the full parent path to the top epic', async () => {
    const res = await exportXlsx('').expect(200);
    const rows = await parseSheet(res.body);
    const taskRow = rows.find((r) => r.Type === 'task');
    expect(taskRow!['Parent Path']).toBe(`${epicKey} › ${storyKey}`);

    const checklistRow = rows.find((r) => r.Type === 'checklist');
    expect(checklistRow!['Parent Path']).toBe(`${epicKey} › ${storyKey} › ${taskKey}`);
    expect(checklistRow!.Status).toBe('Open');
  });

  it('narrows to a single sprint (task + its subtask, no epic/story)', async () => {
    const res = await exportXlsx(`?sprintId=${sprintId}`).expect(200);
    expect(res.headers['content-disposition']).toContain(`tickets-export-sprint-${sprintId}-`);
    const rows = await parseSheet(res.body);
    const types = rows.map((r) => r.Type);
    expect(types).toContain('task');
    expect(types).toContain('subtask');
    expect(types).not.toContain('epic');
    expect(types).not.toContain('story');
  });

  it('narrows to the backlog (unscheduled epic/story, no in-sprint task)', async () => {
    const res = await exportXlsx('?backlog=true').expect(200);
    expect(res.headers['content-disposition']).toContain('tickets-export-backlog-');
    const rows = await parseSheet(res.body);
    const types = rows.map((r) => r.Type);
    expect(types).toContain('epic');
    expect(types).toContain('story');
    expect(types).not.toContain('task');
  });
});
