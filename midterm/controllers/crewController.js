const crewService = require('../services/crewService');
const { ok, okPage, created } = require('../utils/response');
const { contextOf } = require('../utils/context');

const create = async (req, res) => created(res, await crewService.create(req.user, req.valid.body, contextOf(req)));
const list = async (req, res) => okPage(res, await crewService.list(req.user, req.valid.query));
const get = async (req, res) => ok(res, await crewService.get(req.user, req.valid.params.crewId));
const update = async (req, res) => ok(res, await crewService.update(req.user, req.valid.params.crewId, req.valid.body, contextOf(req)));
const remove = async (req, res) => ok(res, await crewService.remove(req.user, req.valid.params.crewId, contextOf(req)));
const changeStatus = async (req, res) => ok(res, await crewService.changeStatus(req.user, req.valid.params.crewId, req.valid.body, contextOf(req)));
const assignCapo = async (req, res) => ok(res, await crewService.assignCapo(req.user, req.valid.params.crewId, req.valid.body, contextOf(req)));
const removeCapo = async (req, res) => ok(res, await crewService.removeCapo(req.user, req.valid.params.crewId, contextOf(req)));
const assignUnderboss = async (req, res) => ok(res, await crewService.assignUnderboss(req.user, req.valid.params.crewId, req.valid.body, contextOf(req)));
const capoHistory = async (req, res) => okPage(res, await crewService.capoHistory(req.user, req.valid.params.crewId, req.valid.query));
const hierarchy = async (req, res) => ok(res, await crewService.hierarchy(req.user, req.valid.params.crewId));

module.exports = {
  create, list, get, update, remove, changeStatus, assignCapo, removeCapo, assignUnderboss, capoHistory, hierarchy,
};
