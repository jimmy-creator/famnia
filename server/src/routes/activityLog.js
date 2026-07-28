/**
 * Activity log — read-only audit trail.
 *
 *   GET /api/activity-log?from=&to=&userId=&action=&locationId=
 *   GET /api/activity-log/:id
 *
 * Append-only at the model level (no PUT/DELETE here). The list view
 * is for admins/staff with the audit_log or analytics permission;
 * detail view is the same.
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import { ActivityLog, User, Location } from '../models/index.js';
import { protect } from '../middleware/auth.js';

const router = Router();

const canView = (req) =>
  req.user.role === 'admin'
  || (req.user.permissions || []).includes('analytics');

router.get('/', protect, async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ message: 'Forbidden' });
    const where = {};
    if (req.query.from || req.query.to) {
      const from = req.query.from ? new Date(req.query.from) : new Date('1970-01-01');
      const to = req.query.to ? new Date(req.query.to) : new Date('2999-12-31');
      where.createdAt = { [Op.between]: [from, to] };
    }
    if (req.query.userId) where.userId = parseInt(req.query.userId, 10);
    if (req.query.action) where.action = req.query.action;
    if (req.query.entityType) where.entityType = req.query.entityType;
    if (req.query.entityId) where.entityId = parseInt(req.query.entityId, 10);
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);
    if (req.query.managerOnly === 'true') where.managerOverrideBy = { [Op.ne]: null };

    const rows = await ActivityLog.findAll({
      where,
      include: [
        { model: User, as: 'actor', attributes: ['id', 'name', 'role'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'role'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(req.query.limit, 10) || 500,
    });
    res.json(rows);
  } catch (err) {
    console.error('[activity-log/list]', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ message: 'Forbidden' });
    const row = await ActivityLog.findByPk(req.params.id, {
      include: [
        { model: User, as: 'actor', attributes: ['id', 'name', 'role', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'role'] },
        { model: Location, attributes: ['id', 'name', 'code'] },
      ],
    });
    if (!row) return res.status(404).json({ message: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
