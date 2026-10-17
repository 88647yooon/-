const roleRequestService = require('../services/roleRequestService');
const { ok, okPage, created } = require('../utils/response');
const { contextOf } = require('../utils/context');

const create = async (req, res) => created(res, await roleRequestService.create(req.user, req.valid.body, contextOf(req)));
const list = async (req, res) => okPage(res, await roleRequestService.list(req.user, req.valid.query));
const get = async (req, res) => ok(res, await roleRequestService.get(req.user, req.valid.params.requestId));
const approve = async (req, res) => ok(res, await roleRequestService.approve(req.user, req.valid.params.requestId, contextOf(req)));
const reject = async (req, res) => ok(res, await roleRequestService.reject(req.user, req.valid.params.requestId, req.valid.body, contextOf(req)));

module.exports = { create, list, get, approve, reject };
