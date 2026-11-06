'use strict';
/* ============================================================================
 * routes/backup.js — Respaldo descargable desde el portal
 *
 * GET /api/backup (solo GM/admin) devuelve un JSON con TODAS las colecciones y
 * los usuarios SIN contraseña ni hash, listo para guardarse fuera del portal.
 * Es el respaldo "de negocio": sirve para archivar y revisar los datos fuera
 * del portal. Para restaurar, usa el respaldo técnico (`npm run db:backup`) o
 * convierte `collections` a un JSON plano (formato pepes_v3_db) para import.js.
 *
 * El respaldo técnico completo (filas crudas de Supabase + hashes) sigue
 * siendo `cd backend && npm run db:backup`.
 * ========================================================================== */
const express = require('express');
const db = require('../db');
const mw = require('../middleware');

/* Estado interno del servidor: no aporta al respaldo y puede contener PII
 * innecesaria (intentos de login) o material que se gestiona aparte (guiaBase). */
const INTERNAS = new Set(['sessions', 'loginAttempts', 'iaUso', 'guiaBase']);

module.exports = (store) => {
  const r = express.Router();

  r.get('/', mw.requireRole('gm', 'admin'), async (req, res, next) => {
    try {
      await store.refreshIfStale();
      const data = store.get() || {};
      const collections = {};
      Object.keys(data).sort().forEach((k) => {
        if (INTERNAS.has(k) || k === 'users') return;
        const v = data[k];
        if (Array.isArray(v) || (v && typeof v === 'object')) collections[k] = v;
      });
      const users = db.collection(data, 'users').map(db.safeUser);
      const registros = Object.keys(collections).reduce(
        (n, k) => n + (Array.isArray(collections[k]) ? collections[k].length : 1), 0
      );
      const payload = {
        format: 'broker-booster-backup',
        version: 1,
        source: 'portal',
        generatedAt: new Date().toISOString(),
        generatedBy: { id: req.user.id, name: req.user.name || req.user.username, role: req.user.role },
        counts: { collections: Object.keys(collections).length, records: registros, users: users.length },
        collections,
        users,
      };
      const dia = payload.generatedAt.slice(0, 10);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="respaldo-portal-' + dia + '.json"');
      res.setHeader('Cache-Control', 'no-store');
      res.send(JSON.stringify(payload));
    } catch (e) { next(e); }
  });

  return r;
};
