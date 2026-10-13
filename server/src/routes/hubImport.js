import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import { bad, hubLog, wrap as wrapAs } from '../hub/http.js';
import { importData, readWorkbook, templateWorkbook } from '../hub/dataImport.js';

/**
 * FEMNIA data import (Settings → Backup): the template download, and the
 * upload that previews (dry run) or imports a workbook in the FEMNIA Hub
 * backup layout. Admin only — it writes across the whole business.
 */
const router = Router();
router.use(protect);
const wrap = (fn) => wrapAs('hubImport', fn);

const adminOnly = (req, res, next) => (req.user.role === 'admin'
  ? next()
  : res.status(403).json({ message: 'Only an Admin can import data.' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/data-import/template', adminOnly, wrap(async (req, res) => {
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', 'attachment; filename="FEMNIA_Import_Template.xlsx"');
  res.send(templateWorkbook());
}));

// ?commit=1 imports; anything else is a preview that changes nothing.
router.post('/data-import', adminOnly, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw bad('Choose an .xlsx file to import.');
  if (!/\.xlsx$/i.test(req.file.originalname || '')) throw bad('Only .xlsx files can be imported.');
  const commit = req.query.commit === '1';
  const report = await importData(readWorkbook(req.file.buffer), { userId: req.user.id, dryRun: !commit });
  if (report.committed) {
    const summary = Object.entries(report.counts)
      .map(([sheet, c]) => `${sheet}: ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')}`).join(' · ');
    await hubLog(req, 'Data import completed', 'Settings', req.file.originalname.slice(0, 120), summary);
  }
  res.json(report);
}));

export default router;
