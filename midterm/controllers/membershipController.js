const membershipService = require('../services/membershipService');
const { ok, okPage, created } = require('../utils/response');
const { contextOf } = require('../utils/context');

const listMembers = async (req, res) => okPage(res, await membershipService.listMembers(req.user, req.valid.params.crewId, req.valid.query));
const getMember = async (req, res) => {
  const { crewId, userId } = req.valid.params;
  ok(res, await membershipService.getMember(req.user, crewId, userId));
};
const addMember = async (req, res) => created(res, await membershipService.addMember(req.user, req.valid.params.crewId, req.valid.body, contextOf(req)));
const bulkAdd = async (req, res) => created(res, await membershipService.bulkAdd(req.user, req.valid.params.crewId, req.valid.body, contextOf(req)));
const changeType = async (req, res) => {
  const { crewId, userId } = req.valid.params;
  ok(res, await membershipService.changeType(req.user, crewId, userId, req.valid.body, contextOf(req)));
};
const removeMember = async (req, res) => {
  const { crewId, userId } = req.valid.params;
  ok(res, await membershipService.removeMember(req.user, crewId, userId, contextOf(req)));
};
const transfer = async (req, res) => {
  const { crewId, userId } = req.valid.params;
  ok(res, await membershipService.transfer(req.user, crewId, userId, req.valid.body, contextOf(req)));
};
const candidates = async (req, res) => okPage(res, await membershipService.candidates(req.user, req.valid.params.crewId, req.valid.query));
const history = async (req, res) => okPage(res, await membershipService.history(req.user, req.valid.params.crewId, req.valid.query));
const merge = async (req, res) => ok(res, await membershipService.merge(req.user, req.valid.body, contextOf(req)));

module.exports = { listMembers, getMember, addMember, bulkAdd, changeType, removeMember, transfer, candidates, history, merge };
