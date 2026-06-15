import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getEnv, getActiveModel, usesPostgres } from './lib/env';
import { getHealthStatus } from './lib/healthCheck';
import { chatRouter } from './routes/chat';
import { uploadRouter } from './routes/upload';
import { reportRouter } from './routes/report';

const environment = getEnv();
const app = express();

app.use(cors({ origin: environment.CORS_ORIGIN }));
app.use(express.json());
app.use(express.static('public'));

app.use('/api/chat', chatRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/report', reportRouter);

app.get('/health', async (req, res) => {
  const health = await getHealthStatus();
  res.status(health.status === 'ok' ? 200 : 503).json({
    service: 'TMaaS AI Readiness Agent',
    ...health,
  });
});

app.listen(environment.PORT, () => {
  console.log(`🚀 TMaaS AI Readiness Agent running on port ${environment.PORT}`);
  console.log(`🤖 Active LLM Model: ${getActiveModel()}`);
  if (usesPostgres()) {
    console.log(`💾 Database: Supabase Connected`);
  } else {
    console.log(`💾 Database: In-Memory (Ephemeral)`);
  }
});
