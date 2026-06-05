import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { chatRouter } from './routes/chat';
import { whatsappRouter } from './routes/whatsapp';
import path from 'path';

const app = express();
const publicPath = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicPath));

app.use('/chat', chatRouter);
app.use('/whatsapp', whatsappRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Browz agent backend running on port ${port}`);
});
