const db = require('../db');

function logAction({ actorId, action, resourceType, resourceId, metadata }) {
  db.prepare(
    `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
     VALUES (?, ?, ?, ?, ?)`
  ).run(actorId ?? null, action, resourceType, resourceId ?? null, metadata ? JSON.stringify(metadata) : null);
}

module.exports = { logAction };
