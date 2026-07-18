import { Router } from 'express';
import { createRoom, getRoom, getMessages, getLivekitToken } from '../controllers/roomController.js';
import { requireAuth } from '../middleware/auth.js';

// Общий префикс '/api/rooms' навесим в app.js.
// Все роуты комнат — только для авторизованных, поэтому requireAuth на каждом.
const router = Router();

router.post('/', requireAuth, createRoom); // создать комнату
router.get('/:code', requireAuth, getRoom); // проверить/получить комнату по коду
router.get('/:code/messages', requireAuth, getMessages); // история сообщений
router.post('/:code/livekit-token', requireAuth, getLivekitToken); // токен для входа в видеозвонок

export default router;
