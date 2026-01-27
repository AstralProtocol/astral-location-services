import { Router } from 'express';
import distanceRouter from './distance.js';
import areaRouter from './area.js';
import lengthRouter from './length.js';
import containsRouter from './contains.js';
import withinRouter from './within.js';
import intersectsRouter from './intersects.js';

const router = Router();

// Mount operation routes
router.use('/distance', distanceRouter);
router.use('/area', areaRouter);
router.use('/length', lengthRouter);
router.use('/contains', containsRouter);
router.use('/within', withinRouter);
router.use('/intersects', intersectsRouter);

export default router;
