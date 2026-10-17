const joinRequestService = require('../services/joinRequestService');
const { ok, okPage, created } = require('../utils/response');
const { contextOf } = require('../utils/context');

const apply = async (req, res) => created(res, await joinRequestService.apply(req.user, req.valid.params.crewId, req.valid.body, contextOf(req)));
const listForCrew = async (req, res) => okPage(res, await joinRequestService.listForCrew(req.user, req.valid.params.crewId, req.valid.query));
const approve = async (req, res) => {
  const { crewId, requestId } = req.valid.params;
  ok(res, await joinRequestService.approve(req.user, crewId, requestId, contextOf(req)));
};
const reject = async (req, res) => {
  const { crewId, requestId } = req.valid.params;
  ok(res, await joinRequestService.reject(req.user, crewId, requestId, req.valid.body, contextOf(req)));
};
const cancel = async (req, res) => {
  const { crewId, requestId } = req.valid.params;
  ok(res, await joinRequestService.cancel(req.user, crewId, requestId, contextOf(req)));
};
const listMine = async (req, res) => okPage(res, await joinRequestService.listMine(req.user, req.valid.query));

module.exports = { apply, listForCrew, approve, reject, cancel, listMine };
