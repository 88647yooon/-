const authService = require('../services/authService');
const { ok } = require('../utils/response');
const { contextOf } = require('../utils/context');

async function login(req, res) {
  ok(res, await authService.login(req.valid.body, contextOf(req)));
}

async function refresh(req, res) {
  ok(res, await authService.refresh(req.valid.body, contextOf(req)));
}

async function logout(req, res) {
  ok(res, await authService.logout(req.user, req.sessionId));
}

async function listSessions(req, res) {
  ok(res, await authService.listSessions(req.user, req.sessionId));
}

async function revokeAllSessions(req, res) {
  ok(res, await authService.revokeAllSessions(req.user, contextOf(req)));
}

module.exports = { login, refresh, logout, listSessions, revokeAllSessions };
