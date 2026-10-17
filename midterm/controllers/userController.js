const userService = require('../services/userService');
const { ok, okPage, created } = require('../utils/response');
const { contextOf } = require('../utils/context');

const create = async (req, res) => created(res, await userService.create(req.user, req.valid.body, contextOf(req)));
const bulkCreate = async (req, res) => created(res, await userService.bulkCreate(req.user, req.valid.body, contextOf(req)));
const list = async (req, res) => okPage(res, await userService.list(req.user, req.valid.query));
const checkUsername = async (req, res) => ok(res, await userService.checkUsername(req.valid.query));
const get = async (req, res) => ok(res, await userService.get(req.user, req.valid.params.userId));
const update = async (req, res) => ok(res, await userService.update(req.user, req.valid.params.userId, req.valid.body, contextOf(req)));
const remove = async (req, res) => ok(res, await userService.remove(req.user, req.valid.params.userId, contextOf(req)));
const changeRole = async (req, res) => ok(res, await userService.changeRole(req.user, req.valid.params.userId, req.valid.body, contextOf(req)));
const changeStatus = async (req, res) => ok(res, await userService.changeStatus(req.user, req.valid.params.userId, req.valid.body, contextOf(req)));
const memberships = async (req, res) => okPage(res, await userService.memberships(req.user, req.valid.params.userId, req.valid.query));
const subordinates = async (req, res) => okPage(res, await userService.subordinates(req.user, req.valid.params.userId, req.valid.query));
const chainOfCommand = async (req, res) => ok(res, await userService.chainOfCommand(req.user, req.valid.params.userId));
const roles = async (req, res) => ok(res, userService.roles());
const memberStatuses = async (req, res) => ok(res, userService.memberStatuses());

module.exports = {
  create, bulkCreate, list, checkUsername, get, update, remove, changeRole, changeStatus,
  memberships, subordinates, chainOfCommand, roles, memberStatuses,
};
