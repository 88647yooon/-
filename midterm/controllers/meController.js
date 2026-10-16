const meService = require('../services/meService');
const { ok } = require('../utils/response');
const { contextOf } = require('../utils/context');

async function getMe(req, res) {
  ok(res, await meService.getMe(req.user));
}

async function updateMe(req, res) {
  ok(res, await meService.updateMe(req.user, req.valid.body, contextOf(req)));
}

async function changePassword(req, res) {
  ok(res, await meService.changePassword(req.user, req.sessionId, req.valid.body, contextOf(req)));
}

async function getPermissions(req, res) {
  ok(res, await meService.getPermissions(req.user));
}

module.exports = { getMe, updateMe, changePassword, getPermissions };
